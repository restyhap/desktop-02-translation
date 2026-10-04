/**
 * 应用内更新 —— @tauri-apps/plugin-updater 的薄封装 + 全局状态。
 *
 * 为什么用「模块级 store + useSyncExternalStore」而不是 context/props：
 * 更新状态同时被**主页横幅**和**设置页「通用」分区**消费（两处都要能触发下载），
 * 用 store 可以零 prop drilling，且天然保证两处显示的是同一份状态，不会出现
 * 「设置页显示已是最新版、主页横幅还在提示可更新」的不一致。
 *
 * 为什么不用 Rust 侧 emit（对齐 tts-download-progress 范式）：
 * 插件自带的 `download()` 回调已经把进度送到前端了，再经 Rust 转一手只会多一层
 * 无谓的序列化与节流代码。tts 那套手写 emit 之所以必要，是因为下载逻辑本身就在
 * Rust 侧；这里逻辑全在前端，形态不同，不必强求一致。
 *
 * 后端能力来自 tauri-plugin-updater / tauri-plugin-process（见 Cargo.toml 与
 * capabilities/default.json 的 updater:default + process:allow-restart）。
 */
import { useSyncExternalStore } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { platform } from "@tauri-apps/plugin-os";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

/**
 * 是否运行在 macOS。「输入监控」是 macOS 独有的 TCC 门禁，Windows/Linux 上
 * 没有可授予的对应权限，所以更新后「请重新授权」的提示只在 macOS 出现。
 * 默认 false：读不到平台时宁可不说，也不给非 macOS 用户一个无法执行的指引。
 */
let isMacPlatform = false;

/** 同步读取平台判定（必须在 initUpdater 之后用） */
export const onMac = (): boolean => isMacPlatform;

/** 更新流程阶段。UI 按此决定显示什么、哪些按钮可点。 */
export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

export interface UpdaterState {
  phase: UpdatePhase;
  /** 运行中的版本号（来自 app config） */
  currentVersion: string;
  /** 服务端给出的新版本号；无更新时为 null */
  availableVersion: string | null;
  /** 更新说明（latest.json 的 notes） */
  notes: string | null;
  /** 已下载字节数 */
  downloaded: number;
  /** 总字节数；服务端未给 Content-Length 时为 null（此时用不确定态进度条） */
  total: number | null;
  /** 失败原因，直接展示给用户（本项目禁止静默失败） */
  error: string | null;
  /** 用户是否手动关掉了横幅 */
  dismissed: boolean;
  /**
   * 本次启动是否「刚经历过一次更新」。
   * 由「上次记录的版本 ≠ 当前版本」推断 —— 用于提示用户重新授予「输入监控」。
   */
  justUpdated: boolean;
  /** justUpdated 对应的旧版本号 */
  previousVersion: string | null;
}

const LAST_VERSION_KEY = "app-last-version";

let state: UpdaterState = {
  phase: "idle",
  currentVersion: "",
  availableVersion: null,
  notes: null,
  downloaded: 0,
  total: null,
  error: null,
  dismissed: false,
  justUpdated: false,
  previousVersion: null,
};

const listeners = new Set<() => void>();

function setState(patch: Partial<UpdaterState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const getSnapshot = () => state;

/**
 * 同步读取当前状态（非 React 环境用）。
 * 必须在 await 之后读结果时用它，而不能重新调 hook —— hook 只能在组件顶层调用。
 */
export const getUpdaterState = (): UpdaterState => state;

/** 读取共享更新状态（React 19 / useSyncExternalStore） */
export function useUpdater(): UpdaterState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * 插件返回的 Update 对象持有下载所需的签名/URL，不能跨次序列化存放。
 * 用模块级变量持有，供「先下载、后安装」两步之间传递。
 */
let pending: Update | null = null;

/** 百分比（0-100）；total 未知时返回 null，调用方渲染不确定态进度条 */
export function progressPercent(downloaded: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((downloaded / total) * 100));
}

/** 把字节数格式化成人类可读体积 */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 启动时调用一次：读版本号、比对上次记录以识别「刚更新完」，然后静默查更新。
 *
 * 静默 = 不打扰：没新版本时什么都不显示；只有出错或发现新版本才让 UI 冒头。
 */
export async function initUpdater(): Promise<void> {
  try {
    isMacPlatform = (await platform()) === "macos";
  } catch (err) {
    console.error("[updater] 读取平台失败（按非 macOS 处理）:", err);
    isMacPlatform = false;
  }

  let version = "";
  try {
    version = await getVersion();
  } catch (err) {
    console.error("[updater] 读取当前版本失败:", err);
  }

  // 读回上次记录的版本。存在且不同 → 上次运行期间换过二进制 = 刚更新完。
  let previous: string | null = null;
  try {
    previous = window.localStorage.getItem(LAST_VERSION_KEY);
  } catch {
    // localStorage 不可用（隐私模式等）时静默降级为「不提示重授权」
  }
  setState({
    currentVersion: version,
    justUpdated: Boolean(previous && version && previous !== version),
    previousVersion: previous && previous !== version ? previous : null,
  });
  try {
    window.localStorage.setItem(LAST_VERSION_KEY, version);
  } catch {
    /* 同上，忽略 */
  }

  await checkForUpdate({ silent: true });
}

/**
 * 查询更新。
 * @param silent 静默模式下失败不弹错误（启动时的后台探测用），避免用户刚开 app
 *               就被一个「检查更新失败」的 toast 糊脸；手动点击检查时 silent=false，
 *               失败必须让用户看见（AGENTS.md：静默失败必须有 UI 侧可见提示）。
 */
export async function checkForUpdate({ silent = false }: { silent?: boolean } = {}): Promise<void> {
  setState({ phase: "checking", error: null });
  try {
    const update = await check();
    pending = update;
    if (!update) {
      setState({
        phase: "idle",
        availableVersion: null,
        notes: null,
        downloaded: 0,
        total: null,
        dismissed: false,
      });
      return;
    }
    setState({
      phase: "available",
      availableVersion: update.version,
      notes: update.body ?? null,
      downloaded: 0,
      total: null,
      error: null,
      dismissed: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[updater] 检查更新失败:", err);
    setState({
      phase: silent ? "idle" : "error",
      error: silent ? null : message,
      availableVersion: null,
    });
  }
}

/** 下载更新包（不安装）。进度写进 store，横幅与设置页共用。 */
export async function downloadUpdate(): Promise<void> {
  if (!pending) {
    setState({ phase: "error", error: "no-pending-update" });
    return;
  }
  setState({ phase: "downloading", downloaded: 0, total: null, error: null });
  try {
    let downloaded = 0;
    await pending.download((event) => {
      switch (event.event) {
        case "Started":
          setState({ total: event.data.contentLength ?? null });
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          setState({ downloaded });
          break;
        case "Finished":
          setState({ downloaded, phase: "ready" });
          break;
      }
    });
    setState({ phase: "ready" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[updater] 下载更新失败:", err);
    setState({ phase: "error", error: message });
  }
}

/**
 * 安装已下载的更新并重启。
 *
 * macOS 上插件做的是「用新 .app 替换旧 .app」，**必须重启进程**才会切到新二进制
 * （不像 Windows 那样安装即退出）。这里显式调 relaunch()。
 */
export async function installAndRestart(): Promise<void> {
  if (!pending) {
    setState({ phase: "error", error: "no-pending-update" });
    return;
  }
  setState({ phase: "installing", error: null });
  try {
    await pending.install();
    await relaunch();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[updater] 安装更新失败:", err);
    setState({ phase: "error", error: message });
  }
}

/** 用户关掉横幅（仅隐藏提示，不影响已下载的包） */
export function dismissUpdateBanner(): void {
  setState({ dismissed: true });
}
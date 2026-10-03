/**
 * 设置页 — v2 重设计：舞台内整页双栏（左 w-44 锚点 rail 卡片 + 右内容大卡）
 *
 * 视觉：preview 双栏（rail 整层高 + 右列独立滚动 + 锚点跳转 + 大卡分节）。
 * 数据/交互：src 业务层全保留 ——
 *   getSettings/saveSettings（App 持有 settings，本页 patch 回传）、
 *   getDictPaths/saveDictPaths（+ plugin-dialog 选目录）、
 *   listApiKeys/addApiKey/deleteApiKey/reorderApiKeys/addEngine/deleteEngine
 *   （@dnd-kit/react 拖拽排序沿用 src 依赖 + AddKeyModal 含默认引擎项）、
 *   getShortcuts/updateShortcuts。
 * 界面语言：UI_LOCALES 九语切换（LocaleProvider）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { arrayMove } from "@dnd-kit/helpers";
import { Modifier } from "@dnd-kit/abstract";
import type { DragOperation } from "@dnd-kit/abstract";
import type { Draggable as DomDraggable, Droppable as DomDroppable } from "@dnd-kit/dom";
import { restrictShapeToBoundingRectangle } from "@dnd-kit/abstract/modifiers";
import { UI_LOCALES, useAppLocale } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { Select } from "@/components/ui/Misc";
import { ShortcutRecorder } from "@/components/ShortcutRecorder";
import { XIcon } from "@/components/icons";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { enable as enableAutostart, disable as disableAutostart } from "@tauri-apps/plugin-autostart";
import {
  deleteTtsModel,
  downloadTtsModel,
  getTtsStatus,
  listTtsVoices,
  setTtsVoice,
  type TtsDownloadProgress,
  type TtsStatus,
  type TtsVoiceInfo,
} from "@/storage";
import { playPreview, stopPreview, type PreviewEngine } from "@/lib/ttsPreview";

const SECTIONS = [
  { id: "general", tKey: "settings.sectionGeneral" },
  { id: "translation", tKey: "settings.sectionTranslation" },
  { id: "dict", tKey: "settings.sectionDict" },
  { id: "apis", tKey: "settings.sectionApis" },
  // 语音分节暂不启用（MOSS 效果不理想，先不发布）：恢复时取消本行注释 + 下方 JSX 调用
  // { id: "voice", tKey: "settings.sectionVoice" },
  { id: "appearance", tKey: "settings.sectionAppearance" },
  { id: "shortcuts", tKey: "settings.sectionShortcuts" },
] as const;

/* ---------- 基础布局件（v2 精修） ---------- */

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {hint && <p className="mt-0.5 text-xs leading-5 text-ink-3">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

import { SUPPORTED_LANGUAGES } from "@/types/translation";
import type { AppSettings } from "@/types/settings";
import type { HookStatus, ShortcutConfig } from "@/types/shortcuts";
import type { ApiKeyOption } from "@/storage";
import {
  addApiKey,
  addEngine,
  deleteApiKey,
  deleteEngine,
  getDictPaths,
  saveDictPaths,
  updateShortcuts,
  getShortcuts,
  getHookStatus,
  openInputMonitoring,
  listApiKeys,
  purgeOldHistory,
  reorderApiKeys,
} from "@/storage";
import { dictBuild } from "@/storage/dict";

function Section({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <section id={`sec-${id}`} data-sec={id} className="scroll-mt-10">
      <h3 className="mb-2.5 flex items-center gap-2 font-display text-[15px] font-semibold text-ink-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        {label}
      </h3>
      <div className="rounded-xl border border-line bg-bg-elevated px-5 py-1.5 shadow-[var(--shadow-card)]">
        {children}
      </div>
    </section>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-line-strong"
      }`}
    >
      <span
        className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-all"
        style={{ left: checked ? 18 : 2 }}
      />
    </button>
  );
}

/* ==================== 语音分节（MOSS-TTS） ==================== */

/** 语言代码 → BCP-47（与 TTSButton 对齐） */
function mapLang(lang: string): string {
  if (lang.startsWith("en")) return "en-US";
  if (lang.startsWith("zh")) return "zh-CN";
  return lang;
}

/** 格式化字节数 → MB 字符串 */
function fmtMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(0);
}

/** 语音分节：模型状态（下载/删除）+ A/B 试听 */
/** 音色分组（与 Rust VOICES 的 group 字段一致） */
const VOICE_GROUPS = [
  { id: "cn_male", tKey: "settings.ttsVoiceGroupCnMale" },
  { id: "cn_female", tKey: "settings.ttsVoiceGroupCnFemale" },
  { id: "en_male", tKey: "settings.ttsVoiceGroupEnMale" },
  { id: "en_female", tKey: "settings.ttsVoiceGroupEnFemale" },
  { id: "jp_female", tKey: "settings.ttsVoiceGroupJpFemale" },
] as const;

// 语音分节组件：当前未被调用（分节已注释停用），故导出以避免 noUnusedLocals 报错。
// 代码与 i18n key 全部保留，恢复启用只需取消 SECTIONS 与调用处注释。
export function VoiceSection({ settings, patch }: { settings: AppSettings; patch: (fn: (draft: AppSettings) => void) => void }) {
  const { t, choice } = useAppLocale();
  const { showToast } = useToast();
  const [status, setStatus] = useState<TtsStatus | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<TtsDownloadProgress | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [playing, setPlaying] = useState<PreviewEngine | null>(null);
  const [voices, setVoices] = useState<TtsVoiceInfo[]>([]);
  const progressRef = useRef<TtsDownloadProgress | null>(null);

  // 挂载时读取状态 + 订阅下载进度事件
  useEffect(() => {
    let alive = true;
    let unlisten: UnlistenFn | null = null;
    getTtsStatus()
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch((err: unknown) => {
        console.error("[Settings] 读取语音模型状态失败:", err);
      });
    listTtsVoices()
      .then((list) => {
        if (alive) setVoices(list);
      })
      .catch((err: unknown) => {
        console.error("[Settings] 读取音色列表失败:", err);
      });
    listen<TtsDownloadProgress>("tts-download-progress", (e) => {
      progressRef.current = e.payload;
      if (alive) {
        setProgress(e.payload);
        setDownloading(true);
        setStatus(null);
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err: unknown) => {
        console.error("[Settings] 订阅下载进度失败:", err);
      });
    return () => {
      alive = false;
      unlisten?.();
      stopPreview();
    };
  }, []);

  // 下载完成的统一处理（事件或错误路径复用）
  const refreshStatus = () => {
    getTtsStatus()
      .then((s) => {
        setStatus(s);
        setDownloading(false);
        setProgress(null);
        progressRef.current = null;
        if (s.downloaded) showToast(t("settings.ttsDownloadDone"), "success");
      })
      .catch((err: unknown) => {
        console.error("[Settings] 刷新语音模型状态失败:", err);
        setDownloading(false);
      });
  };

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    listen<{ ok: boolean; message: string }>("tts-download-finished", (e) => {
      if (e.payload.ok) {
        refreshStatus();
      } else {
        setDownloading(false);
        setProgress(null);
        progressRef.current = null;
        showToast(`${t("result.failed")}: ${e.payload.message}`, "error");
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err: unknown) => {
        console.error("[Settings] 订阅下载完成事件失败:", err);
      });
    return () => unlisten?.();
    // eslint 兼容：仅挂载时订阅
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDownload = () => {
    setDownloading(true);
    setProgress({ downloaded_bytes: 0, total_bytes: 1, file: "" });
    downloadTtsModel().catch((err: unknown) => {
      // 已下载/已有操作等错误直接反馈
      setDownloading(false);
      setProgress(null);
      progressRef.current = null;
      setStatus(null);
      getTtsStatus().then(setStatus).catch(() => {});
      showToast(`${t("result.failed")}: ${err instanceof Error ? err.message : String(err)}`, "error");
    });
  };

  const doDelete = () => {
    deleteTtsModel()
      .then(() => {
        setConfirmDelete(false);
        stopPreview();
        setPlaying(null);
        setStatus(null);
        getTtsStatus()
          .then((s) => {
            setStatus(s);
            showToast(t("settings.ttsDeleteDone"), "success");
          })
          .catch(() => {});
      })
      .catch((err: unknown) => {
        setConfirmDelete(false);
        showToast(`${t("result.failed")}: ${err instanceof Error ? err.message : String(err)}`, "error");
      });
  };

  const togglePreview = async (engine: PreviewEngine) => {
    const text = t("settings.ttsPreviewText");
    const lang = mapLang(choice === "system" ? navigator.language : choice);
    if (playing === engine) {
      stopPreview();
      setPlaying(null);
      return;
    }
    try {
      setPlaying(engine);
      const { voice, playbackRate, pitch, volume } = settings.tts;
      await playPreview(engine, text, lang, () => {
        // 自然播放结束（Web Speech onend / AudioContext onended）复位按钮态
        if (playingRef.current === engine) setPlaying(null);
      }, { voice, playbackRate, pitch, volume });
    } catch (err: unknown) {
      setPlaying(null);
      showToast(`${t("result.failed")}: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  const changeVoice = (voice: string) => {
    // 未下载模型时禁用
    if (!downloaded) return;
    setTtsVoice(voice)
      .then(() => {
        patch((d) => {
          d.tts.voice = voice;
        });
        showToast(t("settings.ttsVoiceChanged"), "success");
      })
      .catch((err: unknown) => {
        showToast(`${t("settings.ttsVoiceFailed")}: ${String(err)}`, "error");
      });
  };
  const playingRef = useRef<PreviewEngine | null>(null);
  playingRef.current = playing;

  const pct =
    progress && progress.total_bytes > 0
      ? Math.min(100, Math.round((progress.downloaded_bytes / progress.total_bytes) * 100))
      : 0;
  const downloaded = status?.downloaded ?? false;
  const sizeMB = status?.size_bytes ? fmtMB(status.size_bytes) : null;

  return (
    <div>
      {/* 模型状态行 */}
      <div className="flex items-center justify-between gap-4 py-3.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{t("settings.ttsModelTitle")}</p>
          <p className="mt-0.5 text-xs leading-5 text-ink-3">
            {downloading
              ? `${t("settings.ttsStatusDownloading", { percent: String(pct) })} · ${fmtMB(progress?.downloaded_bytes ?? 0)}/${fmtMB(progress?.total_bytes ?? 0)} MB`
              : downloaded
                ? `${t("settings.ttsStatusDownloaded", { version: status?.version ?? "" })}${sizeMB ? ` · ${sizeMB} MB` : ""}`
                : `${t("settings.ttsStatusNotDownloaded")}${sizeMB ? ` · ${sizeMB} MB` : ""}`}
          </p>
        </div>
        <div className="shrink-0">
          {downloading ? (
            <div className="flex items-center gap-2" role="status" aria-live="polite">
              <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[2px] border-accent border-t-transparent" aria-hidden="true" />
              <span className="w-32">
                <span className="block h-1.5 overflow-hidden rounded-full bg-line-strong">
                  <span className="block h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                </span>
              </span>
              <span className="w-9 text-right text-[11px] tabular-nums text-ink-3">{pct}%</span>
            </div>
          ) : downloaded ? (
            confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={doDelete}
                  className="h-8 rounded-md bg-red px-2.5 text-xs text-accent-fg transition-colors hover:opacity-90"
                >
                  {t("common.confirm")}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="h-8 rounded-md border border-line px-2.5 text-xs text-ink-2 transition-colors hover:bg-hover"
                >
                  {t("common.cancel")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                title={t("settings.ttsDeleteConfirm")}
                className="h-8 rounded-md border border-line px-2.5 text-xs text-ink-2 transition-colors hover:bg-hover hover:text-red"
              >
                {t("settings.ttsDeleteBtn")}
              </button>
            )
          ) : (
            <button
              onClick={startDownload}
              className="h-8 rounded-md bg-accent px-3 text-xs text-accent-fg transition-colors hover:bg-accent-hover"
            >
              {t("settings.ttsDownloadBtn")}
            </button>
          )}
        </div>
      </div>

      {/* 音色选择行（MOSS 已下载时可用） */}
      <div className="flex items-center justify-between gap-4 py-3.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{t("settings.ttsVoiceTitle")}</p>
          <p className="mt-0.5 text-xs leading-5 text-ink-3">{t("settings.ttsVoiceHint")}</p>
        </div>
        <div className="shrink-0">
          <Select
            value={settings.tts.voice}
            disabled={!downloaded || downloading}
            onChange={(e) => changeVoice(e.target.value)}
            aria-label={t("settings.ttsVoiceTitle")}
            className="h-8 min-w-40 text-xs"
          >
            {VOICE_GROUPS.map((g) => (
              <optgroup key={g.id} label={t(g.tKey)}>
                {voices
                  .filter((v) => v.group === g.id)
                  .map((v) => (
                    <option key={v.voice} value={v.voice}>
                      {v.voice}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </div>
      </div>

      {/* 播放参数行（语速/音调/音量） */}
      <div className="flex flex-col gap-3 py-3.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">{t("settings.ttsParamsTitle")}</p>
            <p className="mt-0.5 text-xs leading-5 text-ink-3">{t("settings.ttsParamsHint")}</p>
          </div>
        </div>
        <ParamSlider
          label={t("settings.ttsPlaybackRate")}
          value={settings.tts.playbackRate}
          min={0.5}
          max={2}
          step={0.05}
          display={`${settings.tts.playbackRate.toFixed(2)}×`}
          onChange={(v) => patch((d) => { d.tts.playbackRate = v; })}
        />
        <ParamSlider
          label={t("settings.ttsPitch")}
          value={settings.tts.pitch}
          min={0.5}
          max={2}
          step={0.05}
          display={`${settings.tts.pitch.toFixed(2)}×`}
          disabled={!!downloaded} // MOSS 无变调能力，仅系统语音生效
          hint={t("settings.ttsPitchHint")}
          onChange={(v) => patch((d) => { d.tts.pitch = v; })}
        />
        <ParamSlider
          label={t("settings.ttsVolume")}
          value={settings.tts.volume}
          min={0}
          max={1}
          step={0.05}
          display={`${Math.round(settings.tts.volume * 100)}%`}
          onChange={(v) => patch((d) => { d.tts.volume = v; })}
        />
      </div>

      {/* A/B 试听行 */}
      <div className="flex items-center justify-between gap-4 py-3.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{t("settings.ttsPreviewTitle")}</p>
          <p className="mt-0.5 text-xs leading-5 text-ink-3">「{t("settings.ttsPreviewText")}」</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => togglePreview("system")}
            className={`h-8 rounded-md border px-2.5 text-xs transition-colors ${
              playing === "system"
                ? "border-accent bg-accent-soft text-accent"
                : "border-line text-ink-2 hover:bg-hover hover:text-ink"
            }`}
          >
            {playing === "system" ? t("common.stop") : `${t("settings.ttsPreviewSystem")} ▸`}
          </button>
          <button
            onClick={() => togglePreview("neural")}
            disabled={!downloaded || downloading}
            title={!downloaded ? t("settings.ttsPreviewNeuralDisabled") : undefined}
            className={`h-8 rounded-md border px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              playing === "neural"
                ? "border-accent bg-accent-soft text-accent"
                : "border-line text-ink-2 hover:bg-hover hover:text-ink"
            }`}
          >
            {playing === "neural" ? t("common.stop") : `${t("settings.ttsPreviewNeural")} ▸`}
          </button>
        </div>
      </div>

      {/* 说明行 */}
      <div className="flex items-center gap-2 py-3.5">
        <p className="text-xs leading-5 text-ink-3">{t("settings.ttsHint")}</p>
      </div>
    </div>
  );
}

/** 播放参数滑块（语速/音调/音量，复用外观分节滑块布局） */
function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  hint,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  hint?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs text-ink-2">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-4 flex-1"
        aria-label={label}
      />
      <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-ink-3">{display}</span>
      {hint && <span className="shrink-0 text-[11px] text-ink-3">{hint}</span>}
    </div>
  );
}

/* ==================== 页面本体 ==================== */

interface SettingsPanelProps {
  settings: AppSettings;
  onClose: () => void;
  /** 单项改动回传 App（App 负责 saveSettings 与主题即时生效） */
  onChange: (settings: AppSettings) => void;
  /** 路径保存触发全量重建完成后回调（App.loadDicts 刷新词典列表） */
  onDictsRebuilt: () => void;
  /** 重建开始/结束回传 App（词典页覆盖 loading 态） */
  onDictsRebuilding?: (v: boolean) => void;
  /** 翻译服务 增加/删除 后回调（App.loadEngines 刷新主页引擎芯片） */
  onEnginesChanged?: () => void;
  /** 历史清理后回调（App 递增 historyVersion，让主页「最近」重新拉取） */
  onHistoryChanged?: () => void;
}

/** 服务行展示形态：listApiKeys 基础字段 + 可选的 Key 信息 */
type KeyRow = ApiKeyOption & { app_id?: string | null; api_key?: string };

export function SettingsPanel({ settings, onClose, onChange, onDictsRebuilt, onDictsRebuilding, onEnginesChanged, onHistoryChanged }: SettingsPanelProps) {
  const { t, choice, setChoice } = useAppLocale();
  const { showToast } = useToast();
  const [active, setActive] = useState<string>("general");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const patch = (fn: (draft: AppSettings) => void) => {
    const draft = structuredClone(settings);
    fn(draft);
    onChange(draft); // App 侧 saveSettings（save_all_settings_cmd）
  };

  /**
   * 改历史保存时效：先落设置（App.onChange 内部 saveSettings），再立即清理一次。
   * 启动时 Rust 也会清理一次，这里是为了改设置后立刻见效并给出删除条数反馈。
   */
  const changeRetention = async (days: number) => {
    patch((d) => {
      d.general.historyRetentionDays = days;
    });
    if (days <= 0) {
      onHistoryChanged?.();
      return;
    }
    try {
      const removed = await purgeOldHistory(days);
      onHistoryChanged?.();
      showToast(t("settings.historyPurged", { count: removed }), "success");
    } catch (err) {
      showToast(`${t("settings.historyPurgeFailed")}: ${String(err)}`, "error");
    }
  };

  // 滚动反高亮最近 section（对齐 src 的 scroll 监听 + 距离计算）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      let best: (typeof SECTIONS)[number]["id"] = SECTIONS[0].id;
      let bestDist = Infinity;
      for (const s of SECTIONS) {
        const sec = el.querySelector(`[data-sec="${s.id}"]`);
        if (!sec) continue;
        const d = Math.abs(
          (sec as HTMLElement).getBoundingClientRect().top - el.getBoundingClientRect().top,
        );
        if (d < bestDist) {
          bestDist = d;
          best = s.id;
        }
      }
      setActive(best);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // 滚动发生在右侧内容列内部
  const jump = (id: string) => {
    setActive(id);
    const el = scrollRef.current;
    const sec = el?.querySelector<HTMLElement>(`[data-sec="${id}"]`);
    if (el && sec) {
      // 直接定位（相对可视关系，不依赖 scrollIntoView/smooth 合成器）
      const top = sec.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
      el.scrollTo({ top });
    }
  };

  return (
    <div className="relative flex h-full w-full gap-6 px-8 py-6">
      {/* 左：锚点 rail（窗体整层高，无 sticky） */}
      <aside className="flex h-full w-44 shrink-0 flex-col rounded-xl border border-line bg-bg-elevated p-2.5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
          <p className="font-display text-base font-semibold text-ink">{t("settings.title")}</p>
          <button
            onClick={onClose}
            title={t("settings.closeTip")}
            className="grid h-6 w-6 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <XIcon size={13} />
          </button>
        </div>
        <nav className="mt-1 flex flex-col gap-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => jump(s.id)}
              aria-current={active === s.id ? "true" : undefined}
              className={`h-8 rounded-md px-2.5 text-left text-[13px] transition-colors ${
                active === s.id
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-ink-2 hover:bg-hover hover:text-ink"
              }`}
            >
              {t(s.tKey)}
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pb-1 pt-2">
          <button
            onClick={onClose}
            className="h-8 w-full rounded-md px-2.5 text-left text-xs text-ink-2 transition-colors hover:bg-hover hover:text-ink"
          >
            {t("settings.backHome")}
          </button>
        </div>
      </aside>

      {/* 右：内容大卡（独立滚动，整层高） */}
      <div ref={scrollRef} className="h-full min-w-0 flex-1 overflow-y-auto pb-10 pr-1">
        {/* ===== 通用 ===== */}
        <Section id="general" label={t("settings.sectionGeneral")}>
          <Row title={t("settings.launchStartup")} hint={t("settings.launchStartupHint")}>
            <Switch
              checked={settings.general.launchAtStartup}
              onChange={(v) => {
                // 先调系统登录项 enable/disable，以结果为准回写设置（失败弹 toast）
                (v ? enableAutostart() : disableAutostart())
                  .then(() => {
                    patch((d) => {
                      d.general.launchAtStartup = v;
                    });
                  })
                  .catch((err: unknown) => {
                    patch((d) => {
                      d.general.launchAtStartup = false;
                    });
                    showToast(String(err), "error");
                  });
              }}
            />
          </Row>
          <Row title={t("settings.closeWindow")} hint={t("settings.closeWindowHint")}>
            <Select
              value={settings.general.closeBehavior}
              onChange={(e) => patch((d) => {
                d.general.closeBehavior = e.target.value as AppSettings["general"]["closeBehavior"];
              })}
              className="h-8 text-xs"
            >
              <option value="minimizeToTray">{t("settings.minimizeToTray")}</option>
              <option value="exit">{t("settings.exitApp")}</option>
            </Select>
          </Row>
          {/* 历史保存时效：启动时与改设置时各清理一次过期非收藏记录 */}
          <Row title={t("settings.historyRetention")} hint={t("settings.historyRetentionHint")}>
            <Select
              value={String(settings.general.historyRetentionDays)}
              onChange={(e) => {
                void changeRetention(Number(e.target.value));
              }}
              className="h-8 text-xs"
            >
              {[7, 30, 90, 180, 365].map((d) => (
                <option key={d} value={d}>
                  {t("settings.historyRetentionDays", { days: d })}
                </option>
              ))}
              <option value={0}>{t("settings.historyRetentionForever")}</option>
            </Select>
          </Row>
        </Section>

        {/* ===== 翻译 ===== */}
        <div className="mt-6">
          <Section id="translation" label={t("settings.sectionTranslation")}>
            <Row title={t("settings.autoDetect")} hint={t("settings.autoDetectHint")}>
              <Switch
                checked={settings.translation.autoDetect}
                onChange={(v) => patch((d) => {
                  d.translation.autoDetect = v;
                })}
              />
            </Row>
            <Row title={t("settings.defaultSource")}>
              <Select
                value={settings.translation.defaultSourceLang}
                onChange={(e) => patch((d) => {
                  d.translation.defaultSourceLang = e.target.value as AppSettings["translation"]["defaultSourceLang"];
                })}
                className="h-8 text-xs"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Row>
            <Row title={t("settings.defaultTarget")}>
              <Select
                value={settings.translation.defaultTargetLang}
                onChange={(e) => patch((d) => {
                  d.translation.defaultTargetLang = e.target.value as AppSettings["translation"]["defaultTargetLang"];
                })}
                className="h-8 text-xs"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Row>
          </Section>
        </div>

        {/* ===== 词典目录 ===== */}
        <div className="mt-6">
          <Section id="dict" label={t("settings.sectionDict")}>
            <DictDirSection onDictsRebuilt={onDictsRebuilt} onRebuilding={onDictsRebuilding} />
          </Section>
        </div>

        {/* ===== 翻译服务 ===== */}
        <div className="mt-6">
          <Section id="apis" label={t("settings.sectionApis")}>
            <ApiSection settings={settings} patch={patch} onEnginesChanged={onEnginesChanged} />
          </Section>
        </div>

        {/* ===== 语音（MOSS-TTS 可选下载 + A/B 试听）=====
            暂不启用：MOSS 语音效果不理想，先不发布（MOSS 引擎代码与 i18n 全部保留，
            恢复时取消上方 SECTIONS 注释 + 解除本段注释即可）。 */}
        {/* <div className="mt-6">
          <Section id="voice" label={t("settings.sectionVoice")}>
            <VoiceSection settings={settings} patch={patch} />
          </Section>
        </div> */}

        {/* ===== 外观 ===== */}
        <div className="mt-6">
          <Section id="appearance" label={t("settings.sectionAppearance")}>
            <Row title={t("settings.theme")} hint={t("settings.themeHint")}>
              <Select
                value={settings.appearance.theme}
                onChange={(e) => patch((d) => {
                  d.appearance.theme = e.target.value as AppSettings["appearance"]["theme"];
                })}
                className="h-8 text-xs"
              >
                <option value="light">{t("theme.light")}</option>
                <option value="dark">{t("theme.dark")}</option>
                <option value="system">{t("common.followSystem")}</option>
              </Select>
            </Row>
            {/* 界面语言：跟随系统 + 9 语（本地名展示），选择落 localStorage 并即时生效 */}
            <Row title={t("settings.uiLang")} hint={t("settings.uiLangHint")}>
              <Select
                value={choice}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "system") {
                    setChoice("system");
                    return;
                  }
                  const hit = UI_LOCALES.find((l) => l.code === v);
                  if (hit) setChoice(hit.code);
                }}
                aria-label={t("settings.uiLang")}
                className="h-8 text-xs"
              >
                <option value="system">{t("common.followSystem")}</option>
                {UI_LOCALES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeName}
                  </option>
                ))}
              </Select>
            </Row>
            <Row title={t("settings.fontSize")}>
              <Select
                value={settings.appearance.fontSize}
                onChange={(e) => patch((d) => {
                  d.appearance.fontSize = e.target.value as AppSettings["appearance"]["fontSize"];
                })}
                className="h-8 text-xs"
              >
                <option value="small">{t("settings.fontSizeSmall")}</option>
                <option value="medium">{t("settings.fontSizeMedium")}</option>
                <option value="large">{t("settings.fontSizeLarge")}</option>
              </Select>
            </Row>
            <Row title={t("settings.opacity")}>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={5}
                  value={settings.appearance.opacity}
                  onChange={(e) => patch((d) => {
                    d.appearance.opacity = Number(e.target.value);
                  })}
                  className="w-32"
                  aria-label={t("settings.opacity")}
                />
                <span className="w-9 text-right text-[11px] text-ink-3">
                  {settings.appearance.opacity}%
                </span>
              </div>
            </Row>
            <Row title={t("settings.hideDelay")} hint={t("settings.hideDelayHint")}>
              <Select
                value={String(settings.appearance.hideDelay)}
                onChange={(e) => patch((d) => {
                  d.appearance.hideDelay = Number(e.target.value);
                })}
                className="h-8 text-xs"
              >
                <option value="0">{t("settings.noAutoHide")}</option>
                <option value="3">{t("settings.seconds", { n: 3 })}</option>
                <option value="5">{t("settings.seconds", { n: 5 })}</option>
                <option value="10">{t("settings.seconds", { n: 10 })}</option>
              </Select>
            </Row>
          </Section>
        </div>

        {/* ===== 快捷键 ===== */}
        <div className="mt-6">
          <Section id="shortcuts" label={t("settings.sectionShortcuts")}>
            <ShortcutRows />
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ==================== 子组件 ==================== */

/** 词典目录分节（getDictPaths / saveDictPaths / plugin-dialog 选目录） */
function DictDirSection({ onDictsRebuilt, onRebuilding }: { onDictsRebuilt: () => void; onRebuilding?: (v: boolean) => void }) {
  const { t } = useAppLocale();
  const { showToast } = useToast();
  const [paths, setPaths] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    getDictPaths()
      .then((list) => {
        if (alive) setPaths(list);
      })
      .catch((err: unknown) => {
        console.error("[Settings] 加载词典路径失败:", err);
      });
    return () => {
      alive = false;
    };
  }, []);

  // B 方案：保存路径后自动全量重建（dictbuild 启动清空旧行，删除路径的词典随之消失）
  const [rebuilding, setRebuilding] = useState(false);
  const save = (next: string[]) => {
    if (rebuilding) return;
    setRebuilding(true);
    onRebuilding?.(true);
    showToast(t("toast.dictRebuilding"), "info");
    saveDictPaths(next)
      .then(() => {
        setPaths(next);
        return dictBuild();
      })
      .then(() => {
        onDictsRebuilt();
        showToast(t("toast.dictRebuildDone"), "success");
      })
      .catch((err: unknown) => {
        console.error("[Settings] 词典构建失败:", err);
        showToast(t("toast.dictRebuildFailed"), "error");
      })
      .finally(() => {
        setRebuilding(false);
        onRebuilding?.(false);
      });
  };

  const addPath = () => {
    import("@tauri-apps/plugin-dialog")
      .then(({ open }) => open({ directory: true, multiple: false }))
      .then((selected) => {
        if (typeof selected === "string") save([...paths, selected]);
      })
      .catch((err: unknown) => {
        console.error("[Settings] 打开目录选择器失败:", err);
        showToast(t("result.failed"), "error");
      });
  };

  return (
    <div>
      <div className="flex items-center py-3.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
        <div className="flex-1">
          <p className="text-sm font-medium text-ink">{t("settings.dictDirTitle")}</p>
          <p className="mt-0.5 text-xs text-ink-3">{t("settings.dictDirHint")}</p>
        </div>
        <button
          onClick={addPath}
          disabled={rebuilding}
          className="h-8 rounded-md border border-line px-2.5 text-xs text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("settings.addDirBtn")}
        </button>
      </div>
      {/* 重建中的显性加载条：spinner + 说明（B 方案全量重建需数分钟） */}
      {rebuilding && (
        <div
          className="flex items-center gap-2.5 py-3.5 text-xs text-ink-2"
          role="status"
          aria-live="polite"
        >
          <span
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[2px] border-accent border-t-transparent"
            aria-hidden="true"
          />
          <span className="flex-1">{t("toast.dictRebuilding")}</span>
        </div>
      )}
      {paths.map((p, i) => (
        <div
          key={p}
          className="flex items-center gap-2 py-3 text-xs [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-ink-2">{p}</span>
          <button
            disabled={rebuilding}
            onClick={() => save(paths.filter((_, j) => j !== i))}
            className="text-ink-3 transition-colors hover:text-red disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("common.delete")}
          </button>
        </div>
      ))}
    </div>
  );
}

// 限制拖拽位移不超出卡片父容器（翻译服务列表，src 版 Modifier 原样沿用）
class RestrictToParentElement extends Modifier {
  apply(operation: DragOperation<DomDraggable, DomDroppable>) {
    const { transform, shape, source } = operation;
    const initialShape = shape?.initial;
    const parent = source?.element?.parentElement;
    if (!initialShape || !parent) return transform;
    return restrictShapeToBoundingRectangle(
      initialShape,
      transform,
      parent.getBoundingClientRect(),
    );
  }
}

/** 翻译服务分节：dnd-kit 拖拽排序（src 版）+ 添加弹窗 + 删除 + 默认引擎 */
function ApiSection({ settings, patch, onEnginesChanged }: { settings: AppSettings; patch: (fn: (d: AppSettings) => void) => void; onEnginesChanged?: () => void }) {
  const { t } = useAppLocale();
  const { showToast } = useToast();
  const [apiKeys, setApiKeys] = useState<KeyRow[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const apiKeysRef = useRef<KeyRow[]>([]);
  apiKeysRef.current = apiKeys;

  const refreshApiKeys = () => {
    listApiKeysRows().then(setApiKeys).catch((err: unknown) => {
      console.error("[Settings] 刷新 API Key 失败:", err);
      setApiKeys([]);
    });
  };

  useEffect(() => {
    refreshApiKeys();
  }, []);

  const handleAdd = (input: { name: string; appId: string; key: string; url: string; asDefault: boolean; service?: string }) => {
    // 预设引擎用标准 service 名（Rust 分支可命柄）；自定义仍按用户名归一
    const serviceName = input.service ?? input.name.trim().toLowerCase().replace(/\s+/g, "_");
    addApiKey(serviceName, input.name.trim(), input.appId.trim() || null, input.key.trim(), 0)
      .then(() => addEngine(serviceName, input.name.trim(), input.url.trim(), !!input.appId.trim()))
      .then(() => {
        if (input.asDefault) {
          patch((d) => {
            d.translation.defaultEngine = serviceName;
          });
        }
        showToast(t("toast.serviceAdded", { name: input.name.trim() }), "success");
        setShowAdd(false);
        refreshApiKeys();
        onEnginesChanged?.();
      })
      .catch((err: unknown) => {
        console.error("[Settings] 添加失败:", err);
        showToast(`${t("result.failed")}: ${String(err)}`, "error");
      });
  };

  const handleDelete = (serviceName: string) => {
    deleteApiKey(serviceName)
      .then(() => deleteEngine(serviceName))
      .then(() => {
        showToast(t("toast.serviceDeleted"), "success");
        refreshApiKeys();
        onEnginesChanged?.();
      })
      .catch((err: unknown) => {
        console.error("[Settings] 删除 API Key 失败:", err);
        showToast(t("result.failed"), "error");
      });
  };

  const reorder = (ordered: string[]) => {
    reorderApiKeys(ordered)
      // 拖拽排序即优先级变化，需同步刷新面板与主页引擎列表
      .then(() => {
        refreshApiKeys();
        onEnginesChanged?.();
      })
      .catch(() => showToast(t("result.failed"), "error"));
  };

  return (
    <div>
      <div className="flex items-center py-3.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
        <div className="flex-1">
          <p className="text-sm font-medium text-ink">{t("settings.apisTitle")}</p>
          <p className="mt-0.5 text-xs text-ink-3">{t("settings.apisHint")}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="h-8 rounded-md bg-accent px-3 text-xs text-accent-fg transition-colors hover:bg-accent-hover"
        >
          {t("common.add")}
        </button>
      </div>

      {apiKeys.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-3">{t("settings.apisHint")}</p>
      ) : (
        <DragDropProvider
          modifiers={[RestrictToParentElement]}
          onDragOver={(event) => {
            const { source, target } = event.operation;
            if (!source || !target || source.id === target.id) return;
            setApiKeys((prev) => {
              const from = prev.findIndex((k) => k.service_name === String(source.id));
              const to = prev.findIndex((k) => k.service_name === String(target.id));
              if (from < 0 || to < 0 || from === to) return prev;
              return arrayMove(prev, from, to);
            });
          }}
          onDragEnd={() => {
            reorder(apiKeysRef.current.map((k) => k.service_name));
          }}
        >
          <div>
            {apiKeys.map((item, index) => (
              <SortableKeyRow
                key={item.service_name}
                item={item}
                index={index}
                onDelete={handleDelete}
              />
            ))}
          </div>
          <DragOverlay>
            {(source) => {
              const item = apiKeys.find((k) => k.service_name === String(source.id));
              return item ? <KeyRowCard item={item} /> : null;
            }}
          </DragOverlay>
        </DragDropProvider>
      )}

      {showAdd && <AddKeyModal onClose={() => setShowAdd(false)} onAdd={handleAdd} settings={settings} />}
    </div>
  );
}

/** listApiKeys → KeyRow 结构数据（service_name/display_name 必有，app_id/api_key 可选） */
function listApiKeysRows(): Promise<KeyRow[]> {
  return listApiKeys().then((rows) =>
    rows.map((r) => ({
      service_name: r.service_name,
      display_name: r.display_name,
      app_id: "app_id" in r ? (r as { app_id?: string | null }).app_id ?? null : null,
      api_key: "api_key" in r ? (r as { api_key?: string }).api_key : undefined,
    })),
  );
}

/** 服务行卡（v2 视觉 + 元信息） */
function KeyRowCard({ item, onDelete }: { item: KeyRow; onDelete?: (serviceName: string) => void }) {
  const { t } = useAppLocale();
  return (
    <div className="flex items-center gap-2.5 py-3 text-xs [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-bg-inset text-[11px] text-ink-3">
        ⠿
      </span>
      <span className="font-medium text-ink">{item.display_name}</span>
      <span className="font-mono text-ink-3">{item.service_name}</span>
      <span className="truncate text-ink-3">
        {item.app_id ? `ID ${item.app_id}` : ""}
        {item.api_key ? ` · ${t("settings.keyTail", { tail: item.api_key.slice(-4) })}` : ""}
      </span>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.service_name);
          }}
          title={t("settings.deleteServiceTitle", { name: item.display_name })}
          className="ml-auto text-ink-3 transition-colors hover:text-red"
        >
          {t("common.delete")}
        </button>
      )}
    </div>
  );
}

/** 排序行（dnd-kit useSortable，src 版交互） */
function SortableKeyRow({ item, index, onDelete }: { item: KeyRow; index: number; onDelete: (serviceName: string) => void }) {
  const { ref, isDragging } = useSortable({
    id: item.service_name,
    index,
    transition: { duration: 300, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
  });

  return (
    <div ref={ref} className={isDragging ? "opacity-60 ring-2 ring-accent/40 rounded-md" : "rounded-md"}>
      <KeyRowCard item={item} onDelete={onDelete} />
    </div>
  );
}

/** 添加服务弹窗（src 业务形状：名称/ID/Key/URL/设为默认 × preview 视觉） */
function AddKeyModal({
  onAdd,
  onClose,
  settings,
}: {
  onAdd: (input: { name: string; appId: string; key: string; url: string; asDefault: boolean; service?: string }) => void;
  onClose: () => void;
  settings: AppSettings;
}) {
  const { t } = useAppLocale();
  const [name, setName] = useState("");
  const [appId, setAppId] = useState("");
  const [key, setKey] = useState("");
  const [url, setUrl] = useState("");
  const [asDefault, setAsDefault] = useState(false);
  // 常见引擎预设：选中即用标准 service 名（Rust 侧 translate 分支可识别），避免自取名不命中
  const PRESETS: Array<{ service: string; label: string; needsAppId: boolean }> = [
    { service: "google", label: "Google 翻译", needsAppId: false },
    { service: "deepl", label: "DeepL", needsAppId: false },
    { service: "baidu", label: "百度翻译", needsAppId: true },
    { service: "youdao", label: "有道翻译", needsAppId: true },
    { service: "caiyun", label: "彩云小译", needsAppId: false },
    { service: "ali", label: "阿里云机器翻译", needsAppId: true },
    { service: "volcano", label: "火山翻译", needsAppId: true },
  ];
  const [preset, setPreset] = useState<string>("google");
  const isCustom = preset === "custom";
  const chosen = PRESETS.find((p) => p.service === preset);
  const valid = key.trim().length > 0 && (isCustom ? name.trim().length > 0 : true);

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/30" onClick={onClose}>
      <div
        className="rise-in w-96 max-h-full overflow-y-auto rounded-xl border border-line bg-bg-elevated p-5 shadow-[var(--shadow-popup)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="font-display text-base font-semibold text-ink">{t("settings.addServiceTitle")}</h4>
        {/* 第一项：常见引擎下拉（选中即锁定标准 service 名，Rust 分支可直接命中） */}
        <label className="mt-3 block text-xs text-ink-2">{t("settings.commonEngines")}</label>
        <Select
          aria-label={t("settings.commonEngines")}
          value={preset}
          onChange={(e) => {
            const v = e.target.value;
            setPreset(v);
            const p = PRESETS.find((x) => x.service === v);
            if (p) {
              setName(p.label);
              setUrl("");
            } else {
              setName("");
              setAppId("");
              setUrl("");
            }
          }}
          className="mt-1 h-9 w-full text-xs"
        >
          {PRESETS.map((p) => (
            <option key={p.service} value={p.service}>{p.label}</option>
          ))}
          <option value="custom">{t("settings.customService")}</option>
        </Select>
        <label className="mt-2.5 block text-xs text-ink-2">
          {isCustom ? t("settings.serviceName") : t("settings.displayName")}
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isCustom ? t("settings.serviceNamePh") : t("settings.displayNamePh")}
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-3 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
        <label className="mt-2.5 block text-xs text-ink-2">
          ID（{chosen?.needsAppId || isCustom ? t("settings.appIdRequired") : t("settings.appIdOptional")}）
        </label>
        <input
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          placeholder="例如: 百度 AppID"
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-3 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
        <label className="mt-2.5 block text-xs text-ink-2">{t("settings.apiKey")}</label>
        <input
          value={key}
          type="password"
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-···"
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-3 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
        <label className="mt-2.5 block text-xs text-ink-2">{t("settings.apiUrl")}</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.example.com/translate"
          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-3 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-bg px-3 py-2.5">
          <div className="flex-1">
            <p className="text-xs font-medium text-ink">设为默认翻译引擎</p>
            <p className="text-[11px] text-ink-3">{chosen && !isCustom ? chosen.label : settings.translation.defaultEngine}</p>
          </div>
          <Switch checked={asDefault} onChange={setAsDefault} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-8 rounded-md border border-line px-3 text-xs text-ink-2 transition-colors hover:bg-hover"
          >
            {t("common.cancel")}
          </button>
          <button
            disabled={!valid}
            onClick={() =>
              onAdd({
                name: name.trim(),
                appId,
                key,
                url,
                asDefault,
                service: isCustom ? undefined : chosen?.service,
              })
            }
            className="h-8 rounded-md bg-accent px-4 text-xs text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {t("common.add")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 快捷键分节。
 * 除了 getShortcuts/updateShortcuts，还读取后端监听诊断状态：
 * 未获得 macOS「输入监控」授权时系统根本不投递按键事件，快捷键必然无反应，
 * 必须在界面上可见地提示（此前是纯静默失败，用户无从排查）。
 * 窗口重新获得焦点时轮询状态，便于用户授权后立即看到提示消失。
 */
function ShortcutRows() {
  const { t } = useAppLocale();
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>({ translate: "", show_main: "" });
  const [loaded, setLoaded] = useState(false);
  const [hookStatus, setHookStatus] = useState<HookStatus | null>(null);

  useEffect(() => {
    let alive = true;
    getShortcuts<ShortcutConfig>()
      .then((config) => {
        if (alive) {
          setShortcuts(config);
          setLoaded(true);
        }
      })
      .catch((err: unknown) => {
        console.error("[Settings] 加载快捷键失败:", err);
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const refreshStatus = useCallback(() => {
    getHookStatus()
      .then((status) => setHookStatus(status))
      .catch((err: unknown) => {
        console.error("[Settings] 读取快捷键监听状态失败:", err);
      });
  }, []);

  useEffect(() => {
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 2000);
    return () => window.clearInterval(timer);
  }, [refreshStatus]);

  const updateShortcut = (k: keyof ShortcutConfig, v: string) => {
    const updated = { ...shortcuts, [k]: v };
    setShortcuts(updated);
    updateShortcuts(updated)
      .then(() => refreshStatus())
      .catch((err: unknown) => {
        console.error("[Settings] 保存快捷键失败:", err);
      });
  };

  // 后端未就绪 / tap 线程未运行 / 未获输入监控授权 —— 三种情况都让快捷键无法触发
  const permMissing = hookStatus !== null && (!hookStatus.listening || !hookStatus.listen_event);

  return (
    <div>
      {permMissing && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--warn-bg, rgba(217, 119, 6, 0.12))",
            border: "1px solid var(--warn-border, rgba(217, 119, 6, 0.35))",
            color: "var(--text-primary)",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          <div>{t("settings.shortcutPermWarn")}</div>
          <button
            type="button"
            onClick={() => {
              openInputMonitoring().catch((err: unknown) => {
                console.error("[Settings] 打开输入监控设置失败:", err);
              });
            }}
            style={{
              marginTop: 8,
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-elevated, transparent)",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {t("settings.shortcutPermBtn")}
          </button>
        </div>
      )}
      <Row title={t("settings.shortcutTranslate")} hint={t("settings.shortcutTranslateHint")}>
        <ShortcutRecorder
          value={shortcuts.translate}
          onChange={(v) => updateShortcut("translate", v)}
          disabled={!loaded}
        />
      </Row>
      <Row title={t("settings.shortcutMain")} hint={t("settings.shortcutMainHint")}>
        <ShortcutRecorder
          value={shortcuts.show_main}
          onChange={(v) => updateShortcut("show_main", v)}
          disabled={!loaded}
        />
      </Row>
    </div>
  );
}

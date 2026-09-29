/**
 * 词典词条视图 — v2 视觉（front-preview）× src 资源能力
 *
 * 视觉：文章式词条卡（词典名头 + 巨大衬线词头 + 义项排印 + 行内小喇叭）。
 * 数据：@/storage/dict 的 dictLoadResources / dictGetResource（zip_file + mime/data_base64）。
 * 词条类型 DictEntry 沿用 src 形状（word/word_raw/definition/audio_ref），
 * dictionary_name 由查询侧可选附带，缺失时回退词典占位名。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  dictGetResource,
  dictLoadResources,
  type DictResource,
} from "@/storage/dict";
import { attachSounds, scopeResources, isPlayableSoundFile } from "@/lib/dictSounds";
import { toPlayableAudioUrl } from "@/lib/audioUrl";
import { DictBody, useParsed } from "@/components/DictBody";
import { XIcon } from "@/components/icons";
import { useAppLocale } from "@/lib/i18n";

export interface DictEntry {
  word: string;
  word_raw: string;
  definition: string;
  audio_ref?: string | null;
  dictionary_name?: string;
}

interface DictEntryViewProps {
  entry: DictEntry;
  /** 收起释义（词典页只需回到查询态；结果区复用为可选） */
  onClose?: () => void;
  /** 词条所属词典名（= dictionaries.name，与 zip_file 目录段一致）。用于资源越库过滤 */
  dictionaryName?: string;
}

interface LoadedResource {
  key: string;
  dataUrl: string;
}

export function DictEntryView({ entry, onClose, dictionaryName }: DictEntryViewProps) {
  const { t } = useAppLocale();
  const parsed = useParsed(entry.definition);
  // 资源清单（懒加载；Plan B 下 resources 表可能为空 → 行内喇叭静默失败可接受）
  const [resources, setResources] = useState<DictResource[] | null>(null);
  // 已加载的资源内容：dataUrl（audio 播放缓存）
  const [loaded, setLoaded] = useState<LoadedResource[]>([]);

  useEffect(() => {
    // 换词时重置资源区
    setResources(null);
    setLoaded([]);
  }, [entry.word]);

  // 挂载即探测资源清单：决定词头喇叭是否显示（无 audio 资源的词典不再给死按钮）
  useEffect(() => {
    let alive = true;
    dictLoadResources(entry.word)
      .then((list) => { if (alive) setResources(list); })
      .catch(() => { if (alive) setResources([]); });
    return () => { alive = false; };
  }, [entry.word]);

  // 本词典作用域资源：get_resources 按 word JOIN 会带出同名词形的其他词典行，
  // 必须经 zip_file 目录段过滤，禁止跨库取音（多词典匹配铁律）。
  // 叠加文件名级可播过滤（.spx = Ogg/Speex，WKWebView 无解码器 → 按「无资源」处理，
  // 喇叭不渲染，规格 #3 的可视化降级收口点）
  const scopedResources = useMemo(
    () =>
      resources
        ? scopeResources(resources, dictionaryName).filter(
            (r) => r.kind !== "audio" || isPlayableSoundFile(r.filename),
          )
        : null,
    [resources, dictionaryName],
  );

  // 解析行 + 音频挂载：词头英/美 + 例句槽逐位（dictSounds 槽位律，防护不等不挂）
  const lines = useMemo(
    () => (scopedResources ? attachSounds(parsed, scopedResources, dictionaryName) : parsed),
    [parsed, scopedResources, dictionaryName],
  );

  /** Audio 实例缓存：同一 dataUrl 复用（重复点击零延迟；首次点击等 canplay 再发声） */
  const audioCacheRef = useRef(new Map<string, HTMLAudioElement>());

  /** toPlayableAudioUrl 是唯一容器嗅探处（规格 #3）：null = OggS/Speex 不可播 → 静默降级不报错
   *  首次点击无声根因：base64 dataUrl 首次解码异步，READY_STATE=0 时立即 play() 在
   *  WKWebView 常静默无效 → 统一先等 canplay（含 4s 兜底）再 play */
  const playPlayable = (dataUrl: string) => {
    const playable = toPlayableAudioUrl(dataUrl);
    if (!playable) {
      console.info("[DictEntryView] 音频容器不可播（OggS/Speex），按无资源降级");
      return;
    }
    let audio = audioCacheRef.current.get(playable);
    if (!audio) {
      audio = new Audio();
      audio.preload = "auto";
      audio.src = playable;
      audioCacheRef.current.set(playable, audio);
    }
    audio.currentTime = 0;
    const start = () => {
      void audio!.play().catch((e) => console.error("[DictEntryView] 播放失败:", e));
    };
    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      start();
      return;
    }
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      audio!.removeEventListener("canplay", once);
      audio!.removeEventListener("error", onError);
      start();
    };
    const onError = () => {
      if (done) return;
      done = true;
      audio!.removeEventListener("canplay", once);
      audio!.removeEventListener("error", onError);
      // 缓存的坏实例直接踢掉，下次点击重建
      audioCacheRef.current.delete(playable);
      console.error("[DictEntryView] 音频加载失败（已重置缓存）:", audio.error);
    };
    audio.addEventListener("canplay", once, { once: true });
    audio.addEventListener("error", onError, { once: true });
    // 大 dataUrl 兜底：canplay 迟迟不来也从第 4 秒强制尝试（避免首次点击无响应）
    setTimeout(once, 4000);
  };

  /** 提取并播放单个 audio 资源（缓存命中直接复用 dataUrl；容器不可播 = 无资源，静默降级） */
  const playRes = async (res: DictResource) => {
    const key = `${res.zip_file}/${res.filename}`;
    const known = loaded.find((l) => l.key === key);
    if (known?.dataUrl) {
      playPlayable(known.dataUrl);
      return;
    }
    const data = await dictGetResource(res.zip_file, res.filename);
    const dataUrl = `data:${data.mime};base64,${data.data_base64}`;
    setLoaded((prev) => [...prev, { key, dataUrl }]);
    // 伪 WAV 容器重打包后播放（词头/行内喇叭共用链路）
    playPlayable(dataUrl);
  };

  /**
   * 行内小喇叭：按 filename 在**本词典范围**内解析资源。
   * scopedResources 已按 zip_file 目录段过滤（跨库文件名不可命中），
   * 按 filename 精确匹配后走 dictGetResource（用资源行自身的 zip_file，精确提取）
   * + toPlayableAudioUrl 播放；找不到 → 静默 + console，不发起跨库调用。
   */
  const speakFile = async (filename: string) => {
    try {
      const list = scopedResources ?? scopeResources(await dictLoadResources(entry.word), dictionaryName);
      const res = list.find((r) => r.kind === "audio" && r.filename === filename);
      if (!res) {
        console.info("[DictEntryView] 本词典无此音频:", filename, dictionaryName ?? "(未知名)");
        return;
      }
      await playRes(res);
    } catch (err) {
      console.error("[DictEntryView] 行内播放失败:", err);
    }
  };

  return (
    <div className="rise-in flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
      <div className="rounded-card border border-line bg-bg-elevated shadow-[var(--shadow-card)]">
        {/* 头部：词头 + 词典名 + 关闭 */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-ink-3">
          <span className="font-mono">{entry.dictionary_name ?? t("dict.fallbackName")}</span>
          {onClose && (
            <button
              onClick={onClose}
              title={t("dict.collapseDef")}
              className="ml-auto grid h-6 w-6 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
            >
              <XIcon size={13} />
            </button>
          )}
        </div>
        <DictBody
          lines={lines}
          entryTitle={entry.word_raw || entry.word}
          onSpeakFile={speakFile}
        />
      </div>
    </div>
  );
}

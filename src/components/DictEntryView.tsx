/**
 * 词典词条视图 — v2 视觉（front-preview）× src 资源能力
 *
 * 视觉：文章式词条卡（词典名头 + 巨大衬线词头 + 义项排印 + 资源 chips 懒加载）。
 * 数据：@/storage/dict 的 dictLoadResources / dictGetResource（zip_file + mime/data_base64）。
 * 词条类型 DictEntry 沿用 src 形状（word/word_raw/definition/audio_ref），
 * dictionary_name 由查询侧可选附带，缺失时回退词典占位名。
 */
import { useEffect, useState } from "react";
import {
  dictGetResource,
  dictLoadResources,
  type DictResource,
} from "@/storage/dict";
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
}

interface LoadedResource {
  key: string;
  dataUrl: string | null;
}

/**
 * Longman/GoldenDict 系列 .wav 是"伪 WAV 容器"：RIFF 头的 wFormatTag=0x55（非 PCM），
 * data 块里实际装的是 MP3 帧 —— 系统/WebKit 按容器解析会失败（afinfo/AudioFileOpen 均不识别）。
 * 处理：识别该容器后剥离 RIFF 头，把 data 块载荷重标为 audio/mpeg。
 * WebAudio decodeAudioData 实测可解（0.6s mono 22050Hz）。
 */
function toPlayableAudioUrl(dataUrl: string): string {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  const [meta, b64] = dataUrl.split(",", 2);
  if (!/audio\/(wav|x-wav)/.test(meta) || !b64) return dataUrl;
  try {
    // atob → 字节级嗅探：RIFF....WAVEfmt 且 wFormatTag != 1
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const text = String.fromCharCode(...bytes.subarray(0, 20));
    const fmtTag = bytes[20] | (bytes[21] << 8);
    if (!text.startsWith("RIFF") || fmtTag === 1) return dataUrl; // 真 PCM WAV → 原样
    // 找 "data" 块，载荷重打包为 mp3 data URL
    for (let p = 12; p + 8 <= bytes.length; ) {
      const id = String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
      const size =
        (bytes[p + 4] | (bytes[p + 5] << 8) | (bytes[p + 6] << 16) | (bytes[p + 7] << 24)) >>> 0;
      if (id === "data") {
        const payload = bytes.subarray(p + 8, Math.min(p + 8 + size, bytes.length));
        let out = "";
        const chunk = 0x8000;
        for (let j = 0; j < payload.length; j += chunk) {
          out += String.fromCharCode(...payload.subarray(j, j + chunk));
        }
        return `data:audio/mpeg;base64,${btoa(out)}`;
      }
      p += 8 + size; // RIFF 对齐可忽略（解析只认 id/size，容错）
    }
    return dataUrl;
  } catch {
    return dataUrl;
  }
}

export function DictEntryView({ entry, onClose }: DictEntryViewProps) {
  const { t } = useAppLocale();
  const lines = useParsed(entry.definition);
  // 资源 chips（懒加载清单）
  const [resources, setResources] = useState<DictResource[] | null>(null);
  const [resLoading, setResLoading] = useState(false);
  // 已加载的资源内容：dataUrl（image 直接显示；audio 播放）
  const [loaded, setLoaded] = useState<LoadedResource[]>([]);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);

  useEffect(() => {
    // 换词时重置资源区
    setResources(null);
    setLoaded([]);
    setAudioSrc(null);
  }, [entry.word]);

  // 挂载即探测资源清单：决定词头喇叭是否显示（无 audio 资源的词典不再给死按钮）
  useEffect(() => {
    let alive = true;
    dictLoadResources(entry.word)
      .then((list) => { if (alive) setResources(list); })
      .catch(() => { if (alive) setResources([]); });
    return () => { alive = false; };
  }, [entry.word]);

  const loadChip = async () => {
    if (resources) {
      setResources(null);
      return;
    }
    setResLoading(true);
    try {
      const list = await dictLoadResources(entry.word);
      setResources(list);
    } catch (err) {
      console.error("[DictEntryView] 加载资源清单失败:", err);
      setResources([]);
    } finally {
      setResLoading(false);
    }
  };

  const openResource = async (res: DictResource) => {
    const key = `${res.zip_file}/${res.filename}`;
    const known = loaded.find((l) => l.key === key);
    if (!known) {
      try {
        const data = await dictGetResource(res.zip_file, res.filename);
        const dataUrl = `data:${data.mime};base64,${data.data_base64}`;
        setLoaded((prev) => [...prev, { key, dataUrl }]);
        if (res.kind === "audio") {
          // 首次提取即自动播放（词头喇叭主链路依赖这里）
          const playable = toPlayableAudioUrl(dataUrl);
          setAudioSrc(playable);
          void new Audio(playable).play().catch((e) => console.error("[DictEntryView] 播放失败:", e));
        }
        return;
      } catch (err) {
        console.error("[DictEntryView] 提取词典资源失败:", err);
        setLoaded((prev) => [...prev, { key, dataUrl: null }]);
        return;
      }
    }
    if (res.kind === "audio" && known.dataUrl) {
      setAudioSrc(known.dataUrl);
      void new Audio(known.dataUrl).play().catch((e) => console.error("[DictEntryView] 播放失败:", e));
    }
  };

  const images = loaded.filter((l) => l.dataUrl?.startsWith("data:image"));

  /** 词头喇叭：取首个 audio 资源播放（点击资源 chip 的懒加载链路复用） */
  const speak = async () => {
    try {
      const list = await dictLoadResources(entry.word);
      const audio = list.find((r) => r.kind === "audio");
      if (!audio) return;
      const key = `${audio.zip_file}/${audio.filename}`;
      const known = loaded.find((l) => l.key === key);
      if (known?.dataUrl) {
        void new Audio(toPlayableAudioUrl(known.dataUrl)).play().catch((e) => console.error("[DictEntryView] 播放失败:", e));
        return;
      }
      const data = await dictGetResource(audio.zip_file, audio.filename);
      const dataUrl = `data:${data.mime};base64,${data.data_base64}`;
      setLoaded((prev) => [...prev, { key, dataUrl }]);
      setAudioSrc(dataUrl);
      void new Audio(dataUrl).play().catch((e) => console.error("[DictEntryView] 播放失败:", e));
    } catch (err) {
      console.error("[DictEntryView] 词头播放失败:", err);
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
          // 探测到 audio 资源才显示词头喇叭，避免无发音词典出现死按钮
          onSpeak={resources?.some((r) => r.kind === "audio") ? speak : undefined}
        />

        {/* 资源 chips：点击展开懒加载清单 */}
        <div className="flex items-center gap-1.5 border-t border-line px-4 py-2">
          <button
            onClick={loadChip}
            className="rounded-md bg-bg-inset px-2 py-1 text-[11px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
          >
            {t("dict.resources")}
            {resources ? " ▾" : resLoading ? " …" : ""}
          </button>
          {resources?.map((res) => {
            const key = `${res.zip_file}/${res.filename}`;
            return (
              <button
                key={key}
                onClick={() => openResource(res)}
                title={res.kind === "audio" ? t("dict.playAudio") : t("dict.viewImage")}
                className="rounded-md border border-line px-2 py-1 text-[11px] text-ink-2 transition-colors hover:border-accent/40 hover:text-accent"
              >
                {res.kind === "audio" ? "🔊" : "🖼"} {res.filename}
              </button>
            );
          })}
        </div>
        {/* 音频控件 + 内嵌图片 */}
        {(audioSrc || images.length > 0) && (
          <div className="border-t border-line px-4 py-2">
            {audioSrc && <audio controls src={audioSrc} className="h-7 w-44" />}
            {images.map((img) => (
              <img
                key={img.key}
                src={img.dataUrl as string}
                alt={t("dict.imageAlt")}
                className="max-h-64 rounded-md border border-line"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 词典词条视图 — v2 视觉（front-preview）× src 资源能力
 *
 * 视觉：文章式词条卡（词典名头 + 巨大衬线词头 + 义项排印 + 行内小喇叭）。
 * 数据：@/storage/dict 的 dictLoadResources / dictGetResource（zip_file + mime/data_base64）。
 * 词条类型 DictEntry 沿用 src 形状（word/word_raw/definition/audio_ref），
 * dictionary_name 由查询侧可选附带，缺失时回退词典占位名。
 */
import { useEffect, useMemo, useState } from "react";
import {
  dictGetResource,
  dictLoadResources,
  type DictResource,
} from "@/storage/dict";
import { attachSounds, pickHeadAudio, scopeResources } from "@/lib/dictSounds";
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
  // 必须经 zip_file 目录段过滤，禁止跨库取音（多词典匹配铁律）
  const scopedResources = useMemo(
    () => (resources ? scopeResources(resources, dictionaryName) : null),
    [resources, dictionaryName],
  );

  // 解析行 + 音频挂载：词头英/美 + 例句槽逐位（dictSounds 槽位律，防护不等不挂）
  const lines = useMemo(
    () => (scopedResources ? attachSounds(parsed, scopedResources) : parsed),
    [parsed, scopedResources],
  );

  /** 提取并播放单个 audio 资源（缓存命中直接复用 dataUrl） */
  const playRes = async (res: DictResource) => {
    const key = `${res.zip_file}/${res.filename}`;
    const known = loaded.find((l) => l.key === key);
    if (known?.dataUrl) {
      void new Audio(toPlayableAudioUrl(known.dataUrl)).play().catch((e) => console.error("[DictEntryView] 播放失败:", e));
      return;
    }
    const data = await dictGetResource(res.zip_file, res.filename);
    const dataUrl = `data:${data.mime};base64,${data.data_base64}`;
    setLoaded((prev) => [...prev, { key, dataUrl }]);
    // 伪 WAV 容器重打包后播放（词头/行内喇叭共用链路）
    const playable = toPlayableAudioUrl(dataUrl);
    void new Audio(playable).play().catch((e) => console.error("[DictEntryView] 播放失败:", e));
  };

  /**
   * 词头喇叭：优先 entry.audio_ref（词条自身的主发音），退化取本词典首个 audio
   * 资源；播放统一走 playRes。资源列表用已探测的 scopedResources，避免重复 IPC。
   */
  const speak = async () => {
    try {
      const list = scopedResources ?? scopeResources(await dictLoadResources(entry.word), dictionaryName);
      const audio = pickHeadAudio(list, entry.audio_ref);
      if (audio) {
        await playRes(audio);
      } else {
        console.info("[DictEntryView] 本词典无可用 audio 资源:", entry.word, dictionaryName ?? "(未知名)");
      }
    } catch (err) {
      console.error("[DictEntryView] 词头播放失败:", err);
    }
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
          // 探测到本词典 audio 资源才显示词头喇叭，避免无发音词典出现死按钮
          // （保留 resources 探测判据；作用域已限本词典，跨库资源不再误显示）
          onSpeak={scopedResources?.some((r) => r.kind === "audio") ? speak : undefined}
          onSpeakFile={speakFile}
        />
      </div>
    </div>
  );
}

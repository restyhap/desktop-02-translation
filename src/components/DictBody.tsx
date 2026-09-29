import { useMemo } from "react";
import type { DictLine } from "@/lib/parseDefinition";
import { parseDefinition } from "@/lib/parseDefinition";
import { useAppLocale } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/Misc";
import { Volume2Icon } from "@/components/icons";

/** 单行渲染 — 参考 src/components/DictEntryView.tsx 的 LineView 视觉 */
function LineView({ line, onSpeakFile }: { line: DictLine; onSpeakFile?: (filename: string) => void }) {
  switch (line.type) {
    case "pos":
      return (
        <div className="mt-3 flex items-baseline gap-2 first:mt-0">
          <span className="shrink-0 rounded bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
            {line.label}
          </span>
          {line.html && (
            <span className="text-xs text-ink-3" dangerouslySetInnerHTML={{ __html: line.html }} />
          )}
          <SoundBtns sounds={line.sounds} onSpeakFile={onSpeakFile} />
        </div>
      );
    case "group":
      return (
        <div className="mt-3 text-[11px] font-bold uppercase tracking-wide text-ink-3" style={line.level ? { paddingLeft: line.level * 12 } : undefined}>
          {line.label}
        </div>
      );
    case "sense":
      return (
        <div className="mt-1.5 flex gap-2 pl-0.5">
          <span className="w-5 shrink-0 text-right text-sm font-semibold leading-6 text-accent">
            {line.label}
          </span>
          <span className="min-w-0 flex-1 text-sm leading-6" dangerouslySetInnerHTML={{ __html: line.html }} />
          <SoundBtns sounds={line.sounds} onSpeakFile={onSpeakFile} />
        </div>
      );
    case "subsense":
      return (
        <div className="mt-0.5 flex gap-2 pl-7">
          <span className="w-4 shrink-0 text-sm leading-6 text-ink-3">{line.label}</span>
          <span className="min-w-0 flex-1 text-sm leading-6" dangerouslySetInnerHTML={{ __html: line.html }} />
          <SoundBtns sounds={line.sounds} onSpeakFile={onSpeakFile} />
        </div>
      );
    case "example":
      return (
        <div
          className="mt-0.5 flex gap-1 border-l-2 border-line pl-3 text-sm italic leading-6 text-ink-2"
          style={line.level ? { paddingLeft: line.level * 12 + 12 } : undefined}
        >
          <span className="min-w-0 flex-1" dangerouslySetInnerHTML={{ __html: line.html }} />
          <SoundBtns sounds={line.sounds} onSpeakFile={onSpeakFile} />
        </div>
      );
    case "meta":
      return (
        <div className="mt-3 text-xs text-ink-3" style={line.level ? { paddingLeft: line.level * 12 } : undefined}>
          {line.label && <span className="font-semibold">{line.label}{/[A-Za-z:]$/.test(line.label || "") ? " " : ""}</span>}
          <span dangerouslySetInnerHTML={{ __html: line.html }} />
          <SoundBtns sounds={line.sounds} onSpeakFile={onSpeakFile} />
        </div>
      );
    case "text":
    default:
      // 缩进层级（DSL [m1..m6]）→ 左内边距
      return (
        <div
          className="mt-1 flex gap-1 text-sm leading-6"
          style={line.level ? { paddingLeft: line.level * 12 } : undefined}
        >
          <span className="min-w-0 flex-1" dangerouslySetInnerHTML={{ __html: line.html }} />
          <SoundBtns sounds={line.sounds} onSpeakFile={onSpeakFile} />
        </div>
      );
  }
}

/** 行内小喇叭：带 sounds 的行在行尾渲染多个（size 12，hover accent） */
function SoundBtns({ sounds, onSpeakFile }: { sounds?: string[]; onSpeakFile?: (filename: string) => void }) {
  if (!onSpeakFile || !sounds || sounds.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {sounds.map((f) => (
        <button
          key={f}
          onClick={() => onSpeakFile(f)}
          title={f}
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-ink-3 transition-colors hover:bg-hover hover:text-accent"
        >
          <Volume2Icon size={12} />
        </button>
      ))}
    </span>
  );
}

/** 音标区发音变体：bbc/am 前缀推英音/美音标注 */
interface PronVariant {
  file: string;
  tag: "美音" | "英音" | null;
}
function soundTag(file: string): PronVariant["tag"] {
  const f = file.toLowerCase();
  if (/^(bre[_-]|en[_-]?uk|uk[_-]|brit)/.test(f)) return "英音";
  if (/^(ame[_-]|en[_-]?us|us[_-]|amer)/.test(f)) return "美音";
  return null;
}

/** 音标区一排带标注的发音按钮（英/美，无前缀则只显示喇叭） */
function PronButtons({
  variants,
  onSpeakFile,
}: {
  variants: PronVariant[];
  onSpeakFile: (f: string) => void;
}) {
  if (variants.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {variants.map((v) => (
        <button
          key={v.file}
          onClick={() => onSpeakFile(v.file)}
          title={v.file}
          className="flex h-6 items-center gap-1 rounded-md bg-accent-soft px-1.5 text-[10px] text-accent transition-colors hover:bg-accent hover:text-accent-fg"
        >
          <Volume2Icon size={11} />
          {v.tag && <span>{v.tag}</span>}
        </button>
      ))}
    </span>
  );
}

interface DictBodyProps {
  /** 词条中已解析的行 */
  lines: DictLine[];
  /** 未解析的原始 definition（如词典不可解析时的兜底） */
  entryTitle: string;
  /** 词头喇叭播放回调（未传则隐藏喇叭按钮，避免死按钮） */
  onSpeak?: () => void;
  /** 行内小喇叭：按声音文件名播放（未传则不渲染行内喇叭） */
  onSpeakFile?: (filename: string) => void;
}

/** 词典词条正文 */
export function DictBody({ lines, entryTitle, onSpeak, onSpeakFile }: DictBodyProps) {
  const { t } = useAppLocale();
// 词头 + 音标分离: 首行 text 若含 "/…/" 则拆出
const { head, phonetic, pronVariants, phoneticTail, rest } = useMemo(() => {
  const first = lines.find((l) => l.type === "text");
  if (!first) return { head: entryTitle, phonetic: null, pronVariants: [] as PronVariant[], phoneticTail: null, rest: lines };
  // 先在「纯文本拷贝」里找音标，避免被 </b> 等闭合标签里的 "/" 干扰
  const base = first.html.replace(/<[^>]+>/g, "");
  const m = base.match(/^(.*?)\s*(\/[^/]+\/)\s*([\s\S]*)$/);
  if (!m) return { head: entryTitle, phonetic: null, pronVariants: [] as PronVariant[], phoneticTail: null, rest: lines };
  // 音标干净化：去掉 Longman 段内控制符 `$`、尾随空逗/空格
  const pho = m[2].replace(/\$\s*/g, "").replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
  // 变体发音：bre_/ame_ 前缀 → 英/美标注（其余未识别文件名仍然可播但不加标注）
  const variants: PronVariant[] = (first.sounds ?? []).map((f) => ({ file: f, tag: soundTag(f) }));
  // 音标后剩余内容（also hallo…、词性等）不得丢弃 → 作为追加 text 行还给正文
  const tailHtml = m[3].trim();
  if (tailHtml) {
    const rest0 = lines.filter((l) => l !== first);
    return { head: entryTitle, phonetic: pho, pronVariants: variants, phoneticTail: tailHtml, rest: rest0 };
  }
  return { head: entryTitle, phonetic: pho, pronVariants: variants, phoneticTail: null, rest: lines.filter((l) => l !== first) };
}, [lines, entryTitle]);

  if (lines.length === 0) {
    return <EmptyState title={t("dict.emptyTitle")} hint={t("dict.emptyHint")} />;
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-display text-2xl font-semibold text-ink">{head}</h2>
        {phonetic && <span className="font-mono text-xs text-ink-3">{phonetic}</span>}
        {/* 音标区：英/美两枚带标注按钮（从词头行 sounds 派生），点击分别播放 */}
        {onSpeakFile && <PronButtons variants={pronVariants} onSpeakFile={onSpeakFile} />}
        {onSpeak && (
          <button
            onClick={onSpeak}
            title={t("tts.speak")}
            className="ml-auto grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-accent"
          >
            <Volume2Icon size={14} />
          </button>
        )}
      </div>
      <div className="mt-2">
        {phoneticTail && <LineView line={{ type: "text", html: phoneticTail }} onSpeakFile={onSpeakFile} />}
        {rest.map((l, i) => (
          <LineView key={i} line={l} onSpeakFile={onSpeakFile} />
        ))}
      </div>
    </div>
  );
}

export type { DictLine };

/** 便捷 hook: 解析词条 HTML → 行数组 */
export function useParsed(html: string): DictLine[] {
  return useMemo(() => parseDefinition(html), [html]);
}

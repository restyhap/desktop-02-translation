import { useMemo } from "react";
import type { DictLine } from "@/lib/parseDefinition";
import { parseDefinition } from "@/lib/parseDefinition";
import { soundTag, type PronTag } from "@/lib/dictSounds";
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
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-3 transition-colors hover:bg-hover hover:text-accent"
        >
          <Volume2Icon size={14} />
        </button>
      ))}
    </span>
  );
}

/** 音标区发音变体：file + 英/美标注（标注规则见 dictSounds.soundTag） */
interface PronVariant {
  file: string;
  tag: PronTag;
}

/** 音标区一排带标注的发音按钮（英/美，无前缀则只显示喇叭）；标注与 title 走 i18n */
function PronButtons({
  variants,
  onSpeakFile,
}: {
  variants: PronVariant[];
  onSpeakFile: (f: string) => void;
}) {
  const { t } = useAppLocale();
  if (variants.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {variants.map((v) => {
        const tagKey = v.tag === "英音" ? "dict.tagBrE" : "dict.tagAmE";
        return (
          <button
            key={v.file}
            onClick={() => onSpeakFile(v.file)}
            title={`${t(tagKey)} · ${v.file}`}
            className="flex h-7 items-center gap-1 rounded-md bg-accent-soft px-2.5 text-[11px] text-accent transition-colors hover:bg-accent hover:text-accent-fg"
          >
            <Volume2Icon size={13} />
            {v.tag && <span>{t(tagKey)}</span>}
          </button>
        );
      })}
    </span>
  );
}

interface DictBodyProps {
  /** 词条中已解析的行 */
  lines: DictLine[];
  /** 未解析的原始 definition（如词典不可解析时的兜底） */
  entryTitle: string;
  /** 行内小喇叭：按声音文件名播放（未传则不渲染行内喇叭） */
  onSpeakFile?: (filename: string) => void;
}

/** 词典词条正文 */
export function DictBody({ lines, entryTitle, onSpeakFile }: DictBodyProps) {
  const { t } = useAppLocale();
// 词头 + 音标分离: 首行 text 若含 "/…/" 则拆出
const { head, phonetic, freq, pronVariants, phoneticTail, rest } = useMemo(() => {
  const first = lines.find((l) => l.type === "text");
  if (!first) return { head: entryTitle, phonetic: null, freq: null, pronVariants: [] as PronVariant[], phoneticTail: null, rest: lines };
  // 先在「纯文本拷贝」里找音标，避免被 </b> 等闭合标签里的 "/" 干扰
  const base = first.html.replace(/<[^>]+>/g, "");
  const m = base.match(/^(.*?)\s*(\/[^/]+\/)\s*([\s\S]*)$/);
  if (!m) return { head: entryTitle, phonetic: null, freq: null, pronVariants: [] as PronVariant[], phoneticTail: null, rest: lines };
  // 音标干净化：去掉 Longman 段内控制符 `$`、`he- -ˈloʊ` 类变体拼接留下的"- -"、尾随空逗/空格
  const pho = m[2]
    .replace(/\$\s*/g, "")
    .replace(/-\s+-/g, "-")
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  // 频率标记（Longman S1/W3 = 口语/书面最常用前 1000/3000 词），音标前小徽章展示
  const freq = m[1].match(/(?:^|\s)([SW]\d{1,2})$/)?.[1] ?? null;
  // 变体发音：非 exa 音频资源（attachSounds 已挂到头行），同文件并钮去重
  const variants: PronVariant[] = [...new Set(first.sounds ?? [])].map((f) => ({ file: f, tag: soundTag(f) }));
  // 音标后剩余内容（also hallo…、词性等）不得丢弃 → 作为追加 text 行还给正文；
  // 行首 "BrE AmE" 文本与发音按钮重复，去掉（仅 Longman 音标行尾此形态）
  const tailHtml = m[3].replace(/^BrE\s+AmE\s*/, "").trim();
  if (tailHtml) {
    const rest0 = lines.filter((l) => l !== first);
    return { head: entryTitle, phonetic: pho, freq, pronVariants: variants, phoneticTail: tailHtml, rest: rest0 };
  }
  return { head: entryTitle, phonetic: pho, freq, pronVariants: variants, phoneticTail: null, rest: lines.filter((l) => l !== first) };
}, [lines, entryTitle]);

  if (lines.length === 0) {
    return <EmptyState title={t("dict.emptyTitle")} hint={t("dict.emptyHint")} />;
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-display text-2xl font-semibold text-ink">{head}</h2>
        {/* 频率徽章（Longman S1/W3） */}
        {freq && (
          <span className="shrink-0 rounded bg-bg-inset px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-3">
            {freq}
          </span>
        )}
        {phonetic && <span className="font-mono text-xs text-ink-3">{phonetic}</span>}
        {/* 音标区：英/美两枚带标注按钮（从词头行 sounds 派生），点击分别播放 */}
        {onSpeakFile && <PronButtons variants={pronVariants} onSpeakFile={onSpeakFile} />}
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

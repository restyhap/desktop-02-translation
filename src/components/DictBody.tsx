import { useMemo } from "react";
import type { DictLine } from "@/lib/parseDefinition";
import { parseDefinition } from "@/lib/parseDefinition";
import { useAppLocale } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/Misc";
import { Volume2Icon } from "@/components/icons";

/** 单行渲染 — 参考 src/components/DictEntryView.tsx 的 LineView 视觉 */
function LineView({ line }: { line: DictLine }) {
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
        </div>
      );
    case "group":
      return (
        <div className="mt-3 text-[11px] font-bold uppercase tracking-wide text-ink-3">
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
        </div>
      );
    case "subsense":
      return (
        <div className="mt-0.5 flex gap-2 pl-7">
          <span className="w-4 shrink-0 text-sm leading-6 text-ink-3">{line.label}</span>
          <span className="min-w-0 flex-1 text-sm leading-6" dangerouslySetInnerHTML={{ __html: line.html }} />
        </div>
      );
    case "example":
      return (
        <div
          className="mt-0.5 border-l-2 border-line pl-3 text-sm italic leading-6 text-ink-2"
          dangerouslySetInnerHTML={{ __html: line.html }}
        />
      );
    case "meta":
      return (
        <div className="mt-3 text-xs text-ink-3">
          {line.label && <span className="font-semibold">{line.label}{/[A-Za-z:]$/.test(line.label || "") ? " " : ""}</span>}
          <span dangerouslySetInnerHTML={{ __html: line.html }} />
        </div>
      );
    case "text":
    default:
      return (
        <div className="mt-1 text-sm leading-6" dangerouslySetInnerHTML={{ __html: line.html }} />
      );
  }
}

interface DictBodyProps {
  /** 词条中已解析的行 */
  lines: DictLine[];
  /** 未解析的原始 definition（如词典不可解析时的兜底） */
  entryTitle: string;
}

/** 词典词条正文 */
export function DictBody({ lines, entryTitle }: DictBodyProps) {
  const { t } = useAppLocale();
  // 词头 + 音标分离: 首行 text 若含 "/…/" 则拆出
  const { head, phonetic, rest } = useMemo(() => {
    const first = lines.find((l) => l.type === "text");
    const m = first?.html.match(/^(.*?)\s*(\/.*?\/)\s*(.*)$/);
    if (m) {
      return {
        head: entryTitle,
        phonetic: m[2],
        rest: lines.filter((l) => l !== first),
      };
    }
    return { head: entryTitle, phonetic: null as string | null, rest: lines };
  }, [lines, entryTitle]);

  if (lines.length === 0) {
    return <EmptyState title={t("dict.emptyTitle")} hint={t("dict.emptyHint")} />;
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-display text-2xl font-semibold text-ink">{head}</h2>
        {phonetic && <span className="font-mono text-xs text-ink-3">{phonetic}</span>}
        <button
          title={t("tts.speak")}
          className="ml-auto grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-accent"
        >
          <Volume2Icon size={14} />
        </button>
      </div>
      <div className="mt-2">
        {rest.map((l, i) => (
          <LineView key={i} line={l} />
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

/**
 * 引擎芯片行 — 独立一档，位于输入框与结果框之间
 *
 * 主页职责唯一（workflow v2 D0 红线）：主页不做单词查询，词典芯片不进主页，
 * 此行仅承载翻译引擎切换；单词查询走左侧「单字词典」页。
 */
import type { TranslationEngine } from "@/lib/types";
import type { EngineChip } from "@/components/TranslationInput";

interface TranslateChipsRowProps {
  engine: TranslationEngine;
  engines: EngineChip[];
  onEngineChange: (engine: TranslationEngine) => void;
}

export function TranslateChipsRow({ engine, engines, onEngineChange }: TranslateChipsRowProps) {
  if (engines.length === 0) return null;
  return (
    <div className="mt-3" data-testid="translate-chips-row">
      <div
        className="flex flex-wrap items-center gap-1 rounded-lg bg-bg-inset p-1"
        role="group"
        aria-label="翻译引擎"
      >
        {engines.map((e) => (
          <button
            key={e.service}
            onClick={() => onEngineChange(e.service)}
            title={`切换到 ${e.label}`}
            aria-pressed={engine === e.service}
            className={`rounded-md px-2 py-1 text-[11px] leading-none transition-colors ${
              engine === e.service
                ? "bg-accent text-accent-fg shadow-sm"
                : "text-ink-2 hover:bg-hover hover:text-ink"
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 引擎芯片行 — 默认独立一档（主页：位于输入框与结果框之间）；inline 变体用于标题栏同排
 *
 * 主页职责唯一（workflow v2 D0 红线）：主页不做单词查询，词典芯片不进主页，
 * 此行仅承载翻译引擎切换；单词查询走左侧「单字词典」页。
 * inline（弹窗标题栏）：去外距、禁换行、超宽截断、阻止事件冒泡（防触发标题栏拖拽）。
 */
import type * as React from "react";
import type { TranslationEngine } from "@/types/translation";
import type { EngineChip } from "@/components/TranslationInput";

interface TranslateChipsRowProps {
  engine: TranslationEngine;
  engines: EngineChip[];
  onEngineChange: (engine: TranslationEngine) => void;
  /** 内联/紧凑变体：用在与标题同一行的场景（弹窗标题栏）；默认 false（主页独立一行） */
  inline?: boolean;
}

export function TranslateChipsRow({
  engine,
  engines,
  onEngineChange,
  inline = false,
}: TranslateChipsRowProps) {
  if (engines.length === 0) return null;
  // ←/→ 循环切换引擎：能力从弹窗原 <Select> 迁移至此，主页/弹窗共用此组件行为一致
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (engines.length < 2) return;
    e.preventDefault();
    const idx = engines.findIndex((x) => x.service === engine);
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = engines[(idx + dir + engines.length) % engines.length];
    if (next && next.service !== engine) onEngineChange(next.service);
  };
  // 内联变体下阻止按下事件冒泡：标题栏整行是拖拽区，点击 chip 不能触发 startDragging
  const onPointerDown = (e: React.PointerEvent) => {
    if (!inline) return;
    e.stopPropagation();
  };
  return (
    <div className={inline ? "min-w-0" : "mt-3"} data-testid="translate-chips-row">
      <div
        className={`flex items-center gap-1 rounded-lg focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 ${
          inline
            ? "min-w-0 flex-nowrap overflow-hidden"
            : "flex-wrap bg-bg-inset p-1"
        }`}
        role="group"
        aria-label="翻译引擎"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
      >
        {engines.map((e) => (
          <button
            key={e.service}
            onClick={() => onEngineChange(e.service)}
            title={`切换到 ${e.label}`}
            aria-pressed={engine === e.service}
            className={`shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[11px] leading-none transition-colors ${
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

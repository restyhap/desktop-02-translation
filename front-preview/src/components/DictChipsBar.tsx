/**
 * 词典开关条 — v2 从主窗口底部状态栏移入主页（卡片之下、结果区之上）
 *
 * 现有 enabledDicts 能力保留：切换影响回信区逐本释义卡的渲染。
 */
import type { DictInfo } from "@/lib/types";
import { useAppLocale } from "@/lib/i18n";

interface DictChipsBarProps {
  dicts: DictInfo[];
  enabled: number[];
  onToggle: (id: number) => void;
}

export function DictChipsBar({ dicts, enabled, onToggle }: DictChipsBarProps) {
  const { t } = useAppLocale();
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={t("dictChips.aria")}>
      <span className="text-[11px] text-ink-3">{t("dict.label")}</span>
      {dicts.map((d) => {
        const on = enabled.includes(d.id);
        return (
          <button
            key={d.id}
            onClick={() => onToggle(d.id)}
            title={on ? t("dictChips.hide", { name: d.name }) : t("dictChips.show", { name: d.name })}
            className={`flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors ${
              on
                ? "border-transparent bg-accent-soft text-accent"
                : "border-line text-ink-3 hover:text-ink-2"
            }`}
          >
            {d.name}
          </button>
        );
      })}
    </div>
  );
}

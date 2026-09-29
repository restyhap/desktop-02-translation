/**
 * 最近历史条带 — v2 新增（主页底部）
 *
 * 横向 3-5 条小卡，点击回填主输入区；无数据时整个条带隐藏（空态不占位）。
 * 数据由 App 从 getTranslations() 取最近几条传入。
 */
import type { TranslationRecord } from "@/lib/types";
import { useAppLocale } from "@/lib/i18n";

interface RecentStripProps {
  recent: TranslationRecord[];
  onPick: (record: TranslationRecord) => void;
  className?: string;
}

export function RecentStrip({ recent, onPick, className = "" }: RecentStripProps) {
  const { t } = useAppLocale();
  if (recent.length === 0) return null; // 空态隐藏
  return (
    <section className={className} aria-label={t("recent.aria")}>
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="font-display text-base text-ink-2">{t("recent.title")}</h2>
        <span className="text-[11px] text-ink-3">{t("recent.hint")}</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-5">
        {recent.map((r, i) => (
          <button
            key={r.id}
            onClick={() => onPick(r)}
            title={t("recent.refillTitle")}
            style={{ animationDelay: `${i * 50}ms` }}
            className="rise-in rounded-card border border-line bg-bg-elevated px-3 py-2.5 text-left shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[var(--shadow-lift)]"
          >
            <p className="truncate text-[13px] leading-5 text-ink-2">{r.source_text}</p>
            <p className="mt-1 truncate text-xs text-ink">{r.translated_text}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

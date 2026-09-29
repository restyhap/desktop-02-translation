/**
 * 历史页 — v2 重设计：整页时间线（单页单焦点）
 *
 * 按日分组（今天/昨天/具体日期分组头）+ 单列大条目卡：
 * 原文衬线 15px → 译文 + 时间 + 收藏/删除 hover 通道（键盘可达）。
 * 全量加载 + 本地搜索过滤 + 点击条目回填主输入区（对齐 src）。
 * key={historyVersion} 由 App 传入以触发 remount 刷新。
 */
import { useEffect, useMemo, useState } from "react";
import type { TranslationRecord } from "@/lib/types";
import { UI_LOCALE_TAGS, useAppLocale, type TFn } from "@/lib/i18n";
import { getTranslations, toggleFavorite, deleteTranslation } from "@/mock/store";
import { SearchIcon, StarIcon, TrashIcon, HistoryIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/Misc";
import { PageHeader } from "@/components/PageHeader";

interface HistoryPanelProps {
  /** 点击条目回填主输入区（对齐 App.handleHistorySelect） */
  onSelect: (record: TranslationRecord) => void;
}

/** 按日分组标签：今天 / 昨天 / 本地化短日期（Intl 按 UI 语言输出） */
function dayLabel(ts: number, localeTag: string, t: TFn): string {
  const d = new Date(ts);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((todayStart - dayStart) / 86_400_000);
  if (diffDays === 0) return t("history.today");
  if (diffDays === 1) return t("history.yesterday");
  return new Intl.DateTimeFormat(localeTag, { month: "short", day: "numeric" }).format(d);
}

export function HistoryPanel({ onSelect }: HistoryPanelProps) {
  const { t, locale } = useAppLocale();
  const localeTag = UI_LOCALE_TAGS[locale];
  const [records, setRecords] = useState<TranslationRecord[]>(() => getTranslations());
  const [query, setQuery] = useState("");

  useEffect(() => {
    setRecords(getTranslations());
  }, []);

  // 本地过滤（sourceText + translatedText 双匹配，大小写不敏感 —— 对齐 src）
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.source_text.toLowerCase().includes(q) ||
        r.translated_text.toLowerCase().includes(q),
    );
  }, [records, query]);

  // 按日分组（filtered 已按时间倒序，Map 插入序即分组倒序）
  const groups = useMemo(() => {
    const buckets = new Map<number, TranslationRecord[]>();
    for (const r of filtered) {
      const d = new Date(r.timestamp);
      const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const arr = buckets.get(key);
      if (arr) arr.push(r);
      else buckets.set(key, [r]);
    }
    return [...buckets.entries()].map(([day, list]) => ({
      day,
      label: dayLabel(list[0].timestamp, localeTag, t),
      list,
    }));
  }, [filtered, localeTag, t]);

  const toggleFav = (id: string) => {
    const next = toggleFavorite(id);
    setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, favorite: next } : r)));
  };

  const remove = (id: string) => {
    deleteTranslation(id);
    setRecords((rs) => rs.filter((r) => r.id !== id));
  };

  return (
    <div className="mx-auto w-full max-w-[860px] px-8 py-10">
      {/* 页头：统一规格（图标 chip + 标题 + 计数 + 职责说明） */}
      <PageHeader
        icon={<HistoryIcon size={16} />}
        title={t("history.title")}
        hint={t("history.pageHint")}
        right={t("history.count", { count: records.length })}
      />

      {/* 搜索：flex-1 满宽 */}
      <div className="relative mt-5 flex w-full items-center">
        <span className="pointer-events-none absolute left-3 grid h-9 w-9 place-items-center text-ink-3">
          <SearchIcon size={14} />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("history.search")}
          className="h-10 w-full min-w-0 rounded-lg border border-line bg-bg-elevated pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
        />
      </div>

      {/* 时间线 */}
      <div className="mt-8 pb-14">
        {groups.length === 0 ? (
          <div className="min-h-64 rounded-xl border border-dashed border-line">
            <EmptyState
              icon={<SearchIcon size={36} />}
              title={records.length === 0 ? t("history.emptyAll") : t("history.emptyNoMatch")}
              hint={records.length === 0 ? t("history.emptyAllHint") : undefined}
            />
            {/* 搜索空态：一键清除搜索直达复位 */}
            {records.length > 0 && query && (
              <p className="mt-3 text-center">
                <button
                  onClick={() => setQuery("")}
                  className="rounded-md px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent-soft"
                  title={t("history.clearSearch")}
                >
                  {t("history.clearSearch")}
                </button>
              </p>
            )}
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.day} className="mb-8">
              {/* 分组头 */}
              <div className="mb-3 flex items-center gap-3">
                <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                <h2 className="font-display text-lg text-ink">{g.label}</h2>
                <span className="text-[11px] text-ink-3">
                  {t("history.groupCount", { count: g.list.length })}
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>

              {/* 单列大条目卡 */}
              <div className="flex flex-col gap-2.5">
                {g.list.map((r) => (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(r)}
                    onKeyDown={(e) => { if (e.key === "Enter") onSelect(r); }}
                    title={t("history.refillTitle")}
                    className="group cursor-pointer rounded-card border border-line bg-bg-elevated px-5 py-4 shadow-[var(--shadow-card)] outline-none transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[var(--shadow-lift)] focus-visible:border-accent"
                  >
                    {/* 原文衬线 15px */}
                    <p className="font-display text-[15px] leading-6 text-ink-2">{r.source_text}</p>

                    {/* 译文 */}
                    <p className="mt-1.5 flex items-baseline gap-2.5">
                      <span className="text-[13px] text-ink-3">→</span>
                      <span className="min-w-0 flex-1 text-[15px] leading-7 text-ink">
                        {r.translated_text}
                      </span>
                    </p>

                    {/* 元信息 + hover 操作通道 */}
                    <div className="mt-2.5 flex items-center gap-2 text-[11px] text-ink-3">
                      <span className="rounded border border-line px-1.5 font-mono">
                        {r.source_lang.toUpperCase()}→{r.target_lang.toUpperCase()}
                      </span>
                      <span>{r.engine}</span>
                      {r.favorite === 1 && (
                        <span className="inline-flex text-gold group-hover:hidden">
                          <StarIcon size={11} filled />
                        </span>
                      )}
                      <span className="ml-auto">{new Date(r.timestamp).toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" })}</span>
                      {/* hover 才出现的操作（tabIndex=0 保证键盘可达） */}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); toggleFav(r.id); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); toggleFav(r.id); } }}
                        title={r.favorite === 1 ? t("action.unfavorite") : t("action.favorite")}
                        className={`grid h-6 w-6 place-items-center rounded-md opacity-0 transition-all group-hover:opacity-100 focus-visible:opacity-100 hover:bg-hover ${
                          r.favorite === 1 ? "text-gold" : "text-ink-3 hover:text-gold"
                        }`}
                      >
                        <StarIcon size={12} filled={r.favorite === 1} />
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); remove(r.id); }}
                        onKeyDown={(e) => e.key === "Enter" && remove(r.id)}
                        title={t("common.delete")}
                        className="grid h-6 w-6 place-items-center rounded-md opacity-0 transition-all group-hover:opacity-100 focus-visible:opacity-100 hover:bg-hover hover:text-red"
                      >
                        <TrashIcon size={12} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

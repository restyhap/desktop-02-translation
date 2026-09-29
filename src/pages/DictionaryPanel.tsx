/**
 * 词典页 — v2 重设计：顶级查询界面（单页单焦点）
 *
 * 视觉：preview chips 选择 + 巨型衬线查询框 + 文章式释义卡。
 * 数据：App 状态机下传（src dict_* 命令），本页只做交互编排；build 走 src 全库构建。
 */
import { useEffect, useRef, useState } from "react";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { arrayMove } from "@dnd-kit/helpers";
import type { DictInfo } from "@/storage/dict";
import type { DictEntry } from "@/components/DictEntryView";
import { useAppLocale, type TFn, type UiLocale } from "@/lib/i18n";
import { DictEntryView } from "@/components/DictEntryView";
import { EmptyState } from "@/components/ui/Misc";
import { BookIcon, SearchIcon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";

/** 词条数显示：zh/ko 用「万」，其余语言用「k」（对齐各自数词习惯） */
function fmtCount(n: number, locale: UiLocale, t: TFn): string {
  if (n <= 0) return t("dict.noData");
  const useWan = locale === "zh" || locale === "ko";
  const count = useWan ? (n / 10_000).toFixed(1) : (n / 1_000).toFixed(1);
  return t("dict.wordCount", { count });
}

/** 与 src DictionaryPanel 一致的判词规则 */
const isWordLike = (tt: string) => /^[a-zA-Z']+$/.test(tt.trim()) && tt.trim().length <= 32;

interface DictionaryPanelProps {
  dicts: DictInfo[];
  activeDict: number | null;
  hasDb: boolean;
  buildingId: number | null;
  buildProgress: number;
  onSelect: (id: number) => void;
  onBuild: (id: number) => void;
  /** 词典顺序（settings.dictOrder 驱动）+ 拖拽换序回调（App 负责落库） */
  onReorder: (ids: number[]) => void;
  /** 当前词条（App 状态；主页输入单词也会落到这里） */
  entry: DictEntry | null;
  entryLoading: boolean;
  entryError: string | null;
  onLookup: (word: string) => void;
  onCloseEntry: () => void;
}

export function DictionaryPanel({
  dicts, activeDict, hasDb, buildingId, buildProgress,
  onSelect, onBuild, onReorder, entry, entryLoading, entryError, onLookup, onCloseEntry,
}: DictionaryPanelProps) {
  const { t, locale } = useAppLocale();
  const [query, setQuery] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const run = () => {
    const tt = query.trim();
    if (!tt) return;
    if (!isWordLike(tt)) {
      setLocalError(t("dict.sentenceTip"));
      return;
    }
    setLocalError(null);
    onLookup(tt.toLowerCase());
  };

  // 切换词典时联动重查当前 query（对齐 src useEffect [activeDict]）
  const prevDictRef = useRef(activeDict);
  useEffect(() => {
    if (prevDictRef.current === activeDict) return;
    prevDictRef.current = activeDict;
    const tt = query.trim();
    if (tt && isWordLike(tt)) {
      setLocalError(null);
      onLookup(tt.toLowerCase());
    }
    // 刻意只依赖 activeDict：仅词典切换触发重查（query 保留在闭包内即可）
  }, [activeDict]);

  if (!hasDb) {
    return (
      <div className="grid h-full w-full place-items-center px-8">
        <div className="flex flex-col items-center text-center">
          <BookIcon size={40} />
          <p className="mt-3 text-sm text-ink-2">{t("dict.noDbTitle")}</p>
          <button
            onClick={() => onBuild(dicts[0]?.id ?? 1)}
            disabled={buildingId != null}
            className="mt-4 h-9 rounded-lg bg-accent px-5 text-xs text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {buildingId != null ? t("dict.building", { p: buildProgress }) : t("dict.build")}
          </button>
          <p className="mt-2 text-xs text-ink-3">{t("dict.noDbHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[860px] flex-col px-8 py-10">
      {/* 页头：统一规格 */}
      <PageHeader
        icon={<BookIcon size={16} />}
        title={t("dict.pageTitle")}
        hint={t("dict.pageHint")}
      />

      {/* 词典选择 chips + 重建：单行横向滚动 + 拖拽排序（顺序经 App 落 settings.dictOrder） */}
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-lg bg-bg-inset p-1">
        <span className="shrink-0 pl-1.5 text-[11px] text-ink-3">{t("dict.label")}</span>
        <DragDropProvider
          onDragOver={(event) => {
            const { source, target } = event.operation;
            if (!source || !target || source.id === target.id) return;
            const from = dicts.findIndex((d) => d.id === Number(source.id));
            const to = dicts.findIndex((d) => d.id === Number(target.id));
            if (from < 0 || to < 0 || from === to) return;
            onReorder(arrayMove(dicts, from, to).map((d) => d.id));
          }}
        >
          {dicts.map((d, index) => (
            <SortableDictChip key={d.id} dict={d} index={index} active={d.id === activeDict} locale={locale} t={t} onSelect={onSelect} />
          ))}
          <DragOverlay>
            {(source) => {
              const d = dicts.find((x) => x.id === Number(source.id));
              return d ? (
                <span className="flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-2 text-[11px] text-accent-fg shadow-[var(--shadow-popup)]">
                  <BookIcon size={11} />
                  {d.name}
                </span>
              ) : null;
            }}
          </DragOverlay>
        </DragDropProvider>
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className="ml-1 text-[11px] text-ink-3 hover:text-accent"
        >
          {moreOpen ? t("dict.lessBtn") : t("dict.moreBtn")}
        </button>
      </div>

      {/* 重建词典（展开态；src 全库构建无进度回传 —— 进度条以不确定态脉冲呈现） */}
      {moreOpen && activeDict != null && (
        <div className="mt-2">
          <button
            onClick={() => onBuild(activeDict)}
            disabled={buildingId != null}
            className="h-7 rounded-md border border-line px-2.5 text-[11px] text-ink-2 hover:bg-hover disabled:opacity-50"
          >
            {buildingId != null
              ? t("dict.rebuilding", { p: buildProgress })
              : t("dict.rebuildCurrent")}
          </button>
          {buildingId != null && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
              <div className="h-full animate-pulse rounded-full bg-accent" />
            </div>
          )}
        </div>
      )}

      {/* hero 巨型衬线查询框 */}
      <label className="mx-auto mt-8 flex w-full max-w-[640px] flex-col items-center border-b border-line-strong pb-3 transition-colors focus-within:border-accent">
        <span className="sr-only">{t("dict.querySr")}</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          placeholder={t("dict.lookupPh")}
          title={t("dict.lookupTip")}
          className="w-full border-0 bg-transparent text-center font-display text-[40px] leading-tight text-ink outline-none placeholder:text-ink-3"
        />
      </label>
      <p className="mt-3 text-center text-[11px] text-ink-3">{t("dict.enterHint")}</p>

      {/* 文章式释义卡 */}
      <div className="mt-6 min-h-0 flex-1 pb-12">
        {entryLoading ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-ink-3">
            {t("common.dictLoading")}
          </div>
        ) : localError ? (
          <div className="min-h-48 rounded-xl border border-dashed border-line">
            <EmptyState title={t("dict.cannotQuery")} hint={localError} />
          </div>
        ) : entryError ? (
          <div className="min-h-48 rounded-xl border border-dashed border-line">
            <EmptyState icon={<SearchIcon size={34} />} title={t("dict.notFound")} hint={entryError} />
          </div>
        ) : entry ? (
          <DictEntryView entry={entry} onClose={onCloseEntry} />
        ) : (
          <div className="min-h-48 rounded-xl border border-dashed border-line">
            <EmptyState
              icon={<BookIcon size={40} />}
              title={t("dict.startTitle")}
              hint={t("dict.currentDict", {
                name: dicts.find((d) => d.id === activeDict)?.name ?? t("dict.notSelected"),
              })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** 可拖拽词典 chip（点击=选中，拖动=换序；dnd-kit 手势阈值与 click 天然区分） */
function SortableDictChip({
  dict, index, active, locale, t, onSelect,
}: {
  dict: DictInfo;
  index: number;
  active: boolean;
  locale: UiLocale;
  t: TFn;
  onSelect: (id: number) => void;
}) {
  const { ref, isDragging } = useSortable({
    id: dict.id,
    index,
    transition: { duration: 250, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
  });
  return (
    <div ref={ref} className={`shrink-0 ${isDragging ? "opacity-50" : ""}`}>
      <button
        onClick={() => onSelect(dict.id)}
        title={`${fmtCount(dict.entry_count, locale, t)} · ${dict.name}`}
        className={`flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[11px] transition-colors ${
          active ? "bg-accent text-accent-fg" : "text-ink-2 hover:bg-hover hover:text-ink"
        }`}
      >
        <BookIcon size={11} />
        {dict.name}
        <span className={active ? "text-accent-fg/70" : "text-ink-3"}>
          {dict.entry_count > 0 ? fmtCount(dict.entry_count, locale, t) : t("dict.noData")}
        </span>
      </button>
    </div>
  );
}

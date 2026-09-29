/**
 * 翻译结果「回信卡」 — v2 重设计
 *
 * 主页职责唯一：此组件只渲染句子翻译（空白态 / 加载态 / 错误态 / 回信卡），
 * 词条卡由词典页承担；引擎切换由 TranslateChipsRow 独立一档承载。
 */
import { useEffect, useState } from "react";
import type { TranslationEngine, TranslationResult } from "@/types/translation";
import { useAppLocale } from "@/lib/i18n";
import { CopyIcon, StarIcon, BookIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/Misc";
import { TTSButton } from "@/components/TTSButton";

interface ResultPanelProps {
  result: TranslationResult | null;
  /** 附带错误信息（翻译失败占位状态） */
  error: string | null;
  loading: boolean;
  currentEngine: TranslationEngine;
}

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

export function TranslationResultPanel({
  result, error, loading, currentEngine,
}: ResultPanelProps) {
  const { t } = useAppLocale();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  /* ---------- 加载态 ---------- */
  if (loading) {
    return (
      <div className="flex min-h-44 items-center justify-center rounded-xl border border-line bg-bg-elevated shadow-[var(--shadow-card)]">
        <span className="animate-pulse text-sm text-ink-3">{t("common.translating")}</span>
      </div>
    );
  }

  /* ---------- 错误 / 空白态 ---------- */
  if (!result || error) {
    return (
      <div className="flex min-h-56 flex-col justify-center rounded-xl border border-dashed border-line">
        {error ? (
          <EmptyState title={t("result.failed")} hint={error} />
        ) : (
          <EmptyState
            icon={<BookIcon size={40} />}
            title={t("result.emptyTitle")}
            hint={t("result.emptyHint")}
          />
        )}
      </div>
    );
  }

  /* ---------- 回信卡 ---------- */
  return (
    <div className="flex flex-col">
      <div className="rise-in overflow-hidden rounded-xl border border-line bg-bg-elevated shadow-[var(--shadow-card)]">
        {/* 元信息条 */}
        <div className="flex items-center gap-2 border-b border-line px-5 py-2 text-xs text-ink-3">
          <span className="font-mono">{result.sourceLang.toUpperCase()}</span>
          <span>→</span>
          <span className="font-mono">{result.targetLang.toUpperCase()}</span>
          <span className="h-3 w-px bg-line" />
          <span>{result.engine || currentEngine}</span>
          <span className="ml-auto">{fmtTime(result.timestamp)}</span>
        </div>
        {/* 译文大字（衬线 accent） */}
        <div className="px-6 py-5">
          <p className="font-display text-[24px] leading-9 text-accent">{result.translatedText}</p>
        </div>
        {/* 操作行 */}
        <div className="flex items-center gap-1 border-t border-line px-4 py-1.5">
          <button
            onClick={() => {
              navigator.clipboard
                .writeText(result.translatedText)
                .then(() => setCopied(true))
                .catch((err: unknown) => console.error("[ResultPanel] 复制失败:", err));
            }}
            title={t("action.copyTranslation")}
            className="grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-accent"
          >
            <CopyIcon size={14} />
          </button>
          <TTSButton text={result.translatedText} lang={result.targetLang} />
          <button
            title={result.favorite ? t("action.favorited") : t("action.favorite")}
            className={`grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-hover ${
              result.favorite ? "text-gold" : "text-ink-3 hover:text-gold"
            }`}
          >
            <StarIcon size={14} filled={result.favorite} />
          </button>
        </div>
      </div>
    </div>
  );
}

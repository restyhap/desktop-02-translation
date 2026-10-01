/**
 * 翻译结果「回信卡」 — v2 重设计
 *
 * 主页职责唯一：此组件只渲染句子翻译（空白态 / 加载态 / 错误态 / 回信卡），
 * 词条卡由词典页承担；引擎切换由 TranslateChipsRow 独立一档承载。
 *
 * 空白态可由外部注入 idleContent（主页传「最近翻译」条带）：
 * 未翻译时用最近记录填充结果区，做到「未翻译也有内容可看」；缺省回退内置空态。
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { TranslationEngine, TranslationResult } from "@/types/translation";
import { useAppLocale } from "@/lib/i18n";
import { CopyIcon, BookIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/Misc";
import { TTSButton } from "@/components/TTSButton";

interface ResultPanelProps {
  result: TranslationResult | null;
  /** 附带错误信息（翻译失败占位状态） */
  error: string | null;
  loading: boolean;
  currentEngine: TranslationEngine;
  /** 空白态自定义内容（未翻译时填充结果区）；缺省回退内置空态提示 */
  idleContent?: ReactNode;
}

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

export function TranslationResultPanel({
  result, error, loading, currentEngine, idleContent,
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
      <div className="flex min-h-44 items-center justify-center rounded-xl border border-line-strong bg-bg-elevated shadow-[var(--shadow-lift)]">
        <span className="animate-pulse text-sm text-ink-3">{t("common.translating")}</span>
      </div>
    );
  }

  /* ---------- 错误 / 空白态 ---------- */
  if (!result || error) {
    // 未翻译且无错误：优先渲染外部注入内容（主页为「最近翻译」条带），无注入才回退空态提示
    if (!error && idleContent) {
      return <div className="min-h-56 py-1">{idleContent}</div>;
    }
    return (
      <div className="flex min-h-56 flex-col justify-center rounded-xl border border-dashed border-line-strong bg-bg-elevated">
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
      <div className="rise-in overflow-hidden rounded-xl border border-line-strong bg-bg-elevated shadow-[var(--shadow-lift)]">
        {/* 元信息条 */}
        <div className="flex items-center gap-2 border-b border-line px-5 py-2 text-xs text-ink-3">
          <span className="font-mono">{result.sourceLang.toUpperCase()}</span>
          <span>→</span>
          <span className="font-mono">{result.targetLang.toUpperCase()}</span>
          <span className="h-3 w-px bg-line" />
          <span>{result.engine || currentEngine}</span>
          <span className="ml-auto">{fmtTime(result.timestamp)}</span>
        </div>
        {/* 译文大字（衬线 accent）；长译文限高内滚，避免结果卡无限长把下方模块顶出视口 */}
        <div className="max-h-[38vh] overflow-y-auto px-6 py-5">
          <p className="whitespace-pre-wrap break-words font-display text-[24px] leading-9 text-accent">
            {result.translatedText}
          </p>
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
        </div>
      </div>
    </div>
  );
}

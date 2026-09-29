/**
 * 划词弹窗预览卡 — v2 视觉精修（与主页「回信卡」同源设计语言）
 *
 * 行为状态机对齐 src/TranslatePopup.tsx 不变：
 * - show-translate 事件到达：新文本自动翻译；同文本只重置隐藏计时
 * - 引擎切换 → 即时重译
 * - hideDelay>0 自动隐藏；hover/pointerdown 取消计时
 * - Escape / 点击外部 / × 关闭
 * - 不透明度消费 settings.appearance.opacity
 * - 失败 → errorResult 占位（不落历史）
 * 拖拽/8向 resize 属 Tauri 窗口能力，预览中省略（移植时接 startDragging/startResizeDragging）
 */
import { useEffect, useRef, useState } from "react";
import type { AppSettings, Language, TranslationEngine, TranslationResult } from "@/lib/types";
import { useAppLocale } from "@/lib/i18n";
import { mockTranslate } from "@/mock/engine";
import { detectLanguage } from "@/mock/store";
import { emitShowTranslate } from "@/mock/bus";
import type { EngineChip } from "@/components/TranslationInput";
import { Select } from "@/components/ui/Misc";
import { TTSButton } from "@/components/TTSButton";
import { CopyIcon, StarIcon, XIcon } from "@/components/icons";
import { useToast } from "@/components/ui/Toast";

interface TranslatePopupProps {
  /** 模拟 show-translate 事件携带的文本 */
  initialText: string;
  settings: AppSettings;
  engines: EngineChip[];
  onClose: () => void;
}

export function TranslatePopup({ initialText, settings, engines, onClose }: TranslatePopupProps) {
  const { t } = useAppLocale();
  const { showToast } = useToast();
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<TranslationEngine>(engines[0]?.service ?? "");
  const [copied, setCopied] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const lastTextRef = useRef<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const delay = settings.appearance.hideDelay;
    if (delay > 0) {
      hideTimer.current = setTimeout(onClose, delay * 1000);
    }
  };
  const cancelHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };

  useEffect(() => {
    scheduleHide();
    return cancelHide;
    // 刻意只挂载一次：计时器消费最新 onClose 由调用方保证
  }, []);

  /** 翻译执行（失败 errorResult 占位，不落历史） */
  const performTranslation = async (text: string, engineId: string) => {
    const src: Language = detectLanguage(text);
    const tgt = settings.translation.defaultTargetLang;
    setLoading(true);
    setError(null);
    try {
      const r = await mockTranslate(text, src, tgt, engineId);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // show-translate 到达：新文本 → 翻译；同文本 → 只重置隐藏计时
  const performRef = useRef(performTranslation);
  performRef.current = performTranslation;
  useEffect(() => {
    if (!initialText || initialText === lastTextRef.current) {
      cancelHide();
      scheduleHide();
      return;
    }
    lastTextRef.current = initialText;
    void performRef.current(initialText, engine);
    scheduleHide();
    // 刻意只依赖 initialText：引擎重译走 select 变更路径
  }, [initialText]);

  // Escape 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const opacity = Math.max(0.3, settings.appearance.opacity / 100);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // 弹窗语义 + 焦点管理：role=dialog、Tab 不穿出到背景页、关闭时还原焦点
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    return () => restoreFocusRef.current?.focus?.();
  }, []);

  const onTrapKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    // 焦点圈：Tab 循环限制在弹窗内（无障碍 G 维度要求）
    const panel = e.currentTarget as HTMLElement;
    const items = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const inside = panel.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("popup.title")}
      onKeyDown={onTrapKey}
      className="w-[420px] overflow-hidden rounded-xl border border-line bg-bg-elevated shadow-[var(--shadow-popup)]"
      style={{ opacity }}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
      onPointerDown={cancelHide}
    >
      {/* 标题栏（拖拽区：移植时接 startDragging） */}
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <span className="text-[10px] uppercase tracking-wider text-ink-3">{t("popup.title")}</span>
        <Select
          aria-label={t("popup.engineAria")}
          value={engine}
          onChange={(e) => {
            const next = e.target.value as TranslationEngine;
            setEngine(next);
            if (lastTextRef.current) void performTranslation(lastTextRef.current, next);
          }}
          className="h-6 border-none bg-bg-inset pr-6 text-[11px] text-ink-2"
        >
          {engines.map((e) => (
            <option key={e.service} value={e.service}>{e.label}</option>
          ))}
        </Select>
        <button
          ref={closeBtnRef}
          onClick={onClose}
          title={t("common.close")}
          className="ml-auto grid h-6 w-6 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
        >
          <XIcon size={12} />
        </button>
      </div>

      {/* 正文：回信卡同源（原句小字 → 译文大字 accent 衬线） */}
      <div className="px-4 py-3.5" onDoubleClick={() => initialText && emitShowTranslate(initialText)}>
        {loading ? (
          <p className="py-4 text-center text-xs text-ink-3">{t("common.translating")}</p>
        ) : error ? (
          <p className="py-4 text-center text-xs text-red">{t("result.failed")} · {error}</p>
        ) : result ? (
          <>
            <p className="text-xs leading-5 text-ink-3">{initialText}</p>
            <p className="mt-2.5 font-display text-[18px] leading-7 text-accent">
              {result.translatedText}
            </p>
          </>
        ) : (
          <p className="py-4 text-center text-xs text-ink-3">{t("popup.selectHint")}</p>
        )}
      </div>

      {/* 操作行 */}
      <div className="flex items-center gap-1 border-t border-line px-3 py-1.5">
        <span className="font-mono text-[10px] text-ink-3">
          {(result?.sourceLang ?? "en").toUpperCase()} → {settings.translation.defaultTargetLang.toUpperCase()}
        </span>
        <TTSButton text={result?.translatedText ?? ""} lang={result?.targetLang ?? "en"} />
        <button
          onClick={async () => {
            if (!result) return;
            await navigator.clipboard.writeText(result.translatedText);
            setCopied(true);
            showToast(t("toast.copied"), "success");
          }}
          title={t("action.copyTranslation")}
          className="grid h-6 w-6 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-accent"
        >
          <CopyIcon size={12} />
        </button>
        <button
          onClick={() => {
            setFavorite((f) => !f);
            showToast(
              favorite ? t("toast.removedFromVocab") : t("toast.addedToVocab"),
              favorite ? "info" : "success",
            );
          }}
          title={favorite ? t("action.favorited") : t("popup.addToVocab")}
          className={`grid h-6 w-6 place-items-center rounded-md transition-colors hover:bg-hover ${
            favorite ? "text-gold" : "text-ink-3 hover:text-gold"
          }`}
        >
          <StarIcon size={12} filled={favorite} />
        </button>
        <span className="ml-auto text-[10px] text-ink-3">
          {settings.appearance.hideDelay > 0
            ? t("popup.autoHideIn", { n: settings.appearance.hideDelay })
            : t("popup.stay")}
        </span>
      </div>
    </div>
  );
}

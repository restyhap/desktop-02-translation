/**
 * 划词弹窗 — v2 视觉 × src 窗口业务（二窗口入口 translate.tsx）
 *
 * 业务语义对齐 src 版（零改动迁移）：
 * - 事件源 = getCurrentWindow().listen("show-translate")：新文本自动翻译；
 *   同文本只重置隐藏计时（重复文本下永不隐藏的教训保留）
 * - 引擎切换 → 即时重译；引擎列表来自 listApiKeys
 * - hideDelay>0 自动隐藏（getCurrentWindow().hide）；hover/pointerdown 取消计时
 * - Escape / 点击外部 / × 关闭（隐藏窗口）
 * - 不透明度消费 settings.appearance.opacity；默认语向 settings.translation.*
 * - 失败 → errorResult 占位（不落历史）；拖拽/8 向 resize 保留原生窗口能力
 * 视觉来自 preview 回信卡同源设计（标题栏 + 原句小字 + 译文大字 accent 衬线 + 焦点圈）。
 */
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listApiKeys, getSettings } from "@/storage";
import { errorResult, translateAndSave } from "@/storage/translation";
import type { AppSettings } from "@/types/settings";
import type { Language, TranslationResult } from "@/types/translation";
import { DEFAULT_SETTINGS } from "@/types/settings";
import { useAppLocale } from "@/lib/i18n";
import { Select } from "@/components/ui/Misc";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { TTSButton } from "@/components/TTSButton";
import { CopyIcon, StarIcon, XIcon } from "@/components/icons";
import type { EngineChip } from "@/components/TranslationInput";

// @tauri-apps/api 未导出 ResizeDirection，与内部定义保持一致
type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

interface TranslateEvent {
  text: string;
  cursorX?: number;
  cursorY?: number;
}

function TranslatePopup() {
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engines, setEngines] = useState<EngineChip[]>([]);
  const [currentEngine, setCurrentEngine] = useState<string>("");
  const [settings, setSettings] = useState({
    sourceLang: "en" as Language,
    targetLang: "zh" as Language,
    opacity: DEFAULT_SETTINGS.appearance.opacity,
    hideDelay: DEFAULT_SETTINGS.appearance.hideDelay,
  });
  const lastTextRef = useRef<string>("");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 实时倒计时（秒）：与 hide 定时器同步跳动，0/不入计时=常驻 */
  const [countdown, setCountdown] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const scheduleHide = () => {
    if (settings.hideDelay <= 0) {
      stopTick();
      setCountdown(0);
      return;
    }
    cancelHide();
    setCountdown(settings.hideDelay);
    // 每秒跳动 UI 倒计时；到 0 时隐藏窗口
    tickRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          stopTick();
          setCountdown(0);
          getCurrentWindow()
            .hide()
            .catch((err: unknown) => console.error("[popup] 隐藏窗口失败:", err));
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const cancelHide = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    stopTick();
    setCountdown(0);
  };

  useEffect(() => {
    return () => {
      stopTick();
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    listApiKeys()
      .then((keys) => {
        setEngines(keys.map((k) => ({ service: k.service_name, label: k.display_name })));
        if (keys.length > 0 && !currentEngine) {
          setCurrentEngine(keys[0].service_name);
        }
      })
      .catch((err: unknown) => {
        console.error("[popup] 引擎列表加载失败:", err);
        setEngines([]);
      });
    // 刻意只在挂载时拉取一次（与 src 行为一致）
  }, []);

  useEffect(() => {
    let alive = true;
    getSettings<Partial<AppSettings>>()
      .then((s) => {
        if (!alive || !s) return;
        setSettings((prev) => ({
          sourceLang: s.translation?.defaultSourceLang ?? prev.sourceLang,
          targetLang: s.translation?.defaultTargetLang ?? prev.targetLang,
          opacity: s.appearance?.opacity ?? prev.opacity,
          hideDelay: s.appearance?.hideDelay ?? prev.hideDelay,
        }));
      })
      .catch((err: unknown) => {
        console.error("[popup] 读取设置失败（沿用默认弹窗参数）:", err);
      });
    return () => {
      alive = false;
    };
  }, []);

  const performTranslation = (text: string, engine: string) => {
    if (!text.trim()) return;

    setVisible(true);
    setLoading(true);
    setError(null);
    lastTextRef.current = text;
    scheduleHide();

    // 弹窗位置由 Rust 侧负责（光标所在显示器 + 逻辑像素边界修正），前端不做定位

    translateAndSave(text, settings.sourceLang, settings.targetLang, engine)
      .then((translatedResult) => {
        setResult(translatedResult);
      })
      .catch((err: unknown) => {
        console.error("[popup] 翻译失败:", err);
        const message = err instanceof Error ? err.message : "翻译失败";
        setError(message);
        setResult(errorResult(text, engine, settings.sourceLang, settings.targetLang));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    try {
      const win = getCurrentWindow();
      win
        .listen<TranslateEvent>("show-translate", async (event) => {
          const payload = event.payload as { text: string; cursorX?: number; cursorY?: number };
          const text = payload.text?.trim() || "";

          // 无论文本是否重复，弹出都重置隐藏计时（避免重复文本下永不隐藏）
          cancelHide();

          if (!text || text === lastTextRef.current) {
            setVisible(true);
            scheduleHide();
            return;
          }

          setVisible(true);
          scheduleHide();
          if (currentEngine) {
            performTranslation(text, currentEngine);
          }
        })
        .then((fn) => {
          unlisten = fn;
        });
    } catch (err) {
      console.error("[popup] getCurrentWindow error:", err);
    }
    return () => {
      if (unlisten) unlisten();
    };
  }, [currentEngine]);

  const handleClose = async () => {
    setVisible(false);
    const win = getCurrentWindow();
    await win.hide();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose().catch((err: unknown) => console.error("[popup] 关闭失败:", err));
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const startDragWindow = (e: React.PointerEvent) => {
    e.preventDefault();
    getCurrentWindow().startDragging().catch(() => {});
  };

  // 原生 resize：交给 OS 处理拖拽循环，尺寸持久化由 Rust 侧 on_window_event 节流保存
  const startResize = (dir: ResizeDirection) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    getCurrentWindow().startResizeDragging(dir).catch(() => {});
  };

  if (!visible) return null;

  return (
    <ToastProvider>
      <PopupCard
        result={result}
        visibleText={lastTextRef.current}
        loading={loading}
        error={error}
        engines={engines}
        engine={currentEngine}
        opacity={Math.max(0.3, settings.opacity / 100)}
        hideDelay={settings.hideDelay}
        countdown={countdown}
        targetLang={settings.targetLang}
        onEngineChange={(service) => {
          setCurrentEngine(service);
          if (lastTextRef.current) performTranslation(lastTextRef.current, service);
        }}
        onClose={handleClose}
        onCancelHide={cancelHide}
        onScheduleHide={scheduleHide}
        onStartDrag={startDragWindow}
        onStartResize={startResize}
      />
    </ToastProvider>
  );
}

/* ---------- 卡片本体（视觉层，接 useToast/焦点圈） ---------- */

interface PopupCardProps {
  result: TranslationResult | null;
  visibleText: string;
  loading: boolean;
  error: string | null;
  engines: EngineChip[];
  engine: string;
  opacity: number;
  hideDelay: number;
  /** 实时倒计时（秒），0=无计时 */
  countdown: number;
  targetLang: Language;
  onEngineChange: (service: string) => void;
  onClose: () => void;
  onCancelHide: () => void;
  onScheduleHide: () => void;
  onStartDrag: (e: React.PointerEvent) => void;
  onStartResize: (dir: ResizeDirection) => (e: React.PointerEvent) => void;
}

function PopupCard({
  result, visibleText, loading, error, engines, engine,
  opacity, hideDelay, countdown, targetLang, onEngineChange, onClose,
  onCancelHide, onScheduleHide, onStartDrag, onStartResize,
}: PopupCardProps) {
  const { t } = useAppLocale();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

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
      className="flex h-full w-full items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("popup.title")}
        onKeyDown={onTrapKey}
        className="popup-root relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-bg-elevated shadow-[var(--shadow-popup)]"
        style={{ opacity }}
        onMouseEnter={onCancelHide}
        onMouseLeave={onScheduleHide}
        onPointerDown={onCancelHide}
      >
        {/* 8 个 resize 热区（每边 16px，四角 20px），原生 startResizeDragging 交给 OS */}
        <div className="absolute left-4 right-4 top-0 z-20 h-4 cursor-n-resize" onPointerDown={onStartResize("North")} />
        <div className="absolute bottom-0 left-4 right-4 z-20 h-4 cursor-s-resize" onPointerDown={onStartResize("South")} />
        <div className="absolute bottom-4 right-0 top-4 z-20 w-4 cursor-e-resize" onPointerDown={onStartResize("East")} />
        <div className="absolute bottom-4 left-0 top-4 z-20 w-4 cursor-w-resize" onPointerDown={onStartResize("West")} />
        <div className="absolute left-0 top-0 z-20 h-5 w-5 cursor-nw-resize" onPointerDown={onStartResize("NorthWest")} />
        <div className="absolute right-0 top-0 z-20 h-5 w-5 cursor-ne-resize" onPointerDown={onStartResize("NorthEast")} />
        <div className="absolute bottom-0 left-0 z-20 h-5 w-5 cursor-sw-resize" onPointerDown={onStartResize("SouthWest")} />
        <div className="absolute bottom-0 right-0 z-20 h-5 w-5 cursor-se-resize" onPointerDown={onStartResize("SouthEast")} />

        {/* 标题栏（拖拽区：startDragging） */}
        <div
          className="flex shrink-0 cursor-move items-center gap-2 border-b border-line px-3.5 py-2.5"
          onPointerDown={onStartDrag}
        >
          <span className="text-[10px] uppercase tracking-wider text-ink-3">{t("popup.title")}</span>
          <span onPointerDown={(e) => e.stopPropagation()}>
            <Select
              aria-label={t("popup.engineAria")}
              value={engine}
              onChange={(e) => {
                const next = e.target.value;
                onEngineChange(next);
              }}
              className="h-6 border-none bg-bg-inset pr-6 text-[11px] text-ink-2"
            >
              {engines.map((e) => (
                <option key={e.service} value={e.service}>{e.label}</option>
              ))}
            </Select>
          </span>
          <button
            ref={closeBtnRef}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            title={t("common.close")}
            className="ml-auto grid h-6 w-6 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <XIcon size={12} />
          </button>
        </div>

        {/* 正文：回信卡同源（原句小字 → 译文大字 accent 衬线） */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
          {loading ? (
            <p className="py-4 text-center text-xs text-ink-3">{t("common.translating")}</p>
          ) : error ? (
            <p className="py-4 text-center text-xs text-red">
              {t("result.failed")} · {error}
            </p>
          ) : result ? (
            <>
              <p className="text-xs leading-5 text-ink-3">{visibleText || result.sourceText}</p>
              <p className="mt-2.5 font-display text-[18px] leading-7 text-accent">
                {result.translatedText}
              </p>
            </>
          ) : (
            <p className="py-4 text-center text-xs text-ink-3">{t("popup.selectHint")}</p>
          )}
        </div>

        {/* 操作行 */}
        <div className="flex shrink-0 items-center gap-1 border-t border-line px-3 py-1.5">
          <span className="font-mono text-[10px] text-ink-3">
            {(result?.sourceLang ?? "en").toUpperCase()} → {targetLang.toUpperCase()}
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
          <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-3">
            {hideDelay > 0 ? t("popup.autoHideIn", { n: countdown }) : t("popup.stay")}
          </span>
        </div>
      </div>
    </div>
  );
}

export default TranslatePopup;

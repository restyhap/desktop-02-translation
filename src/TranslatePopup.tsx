import { useEffect, useRef, useState } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { translate } from "@/storage/translation";
import { listApiKeys, saveTranslationHistory, store } from "@/storage";
import type { TranslationResult, TranslationRecord, Language } from "@/types/translation";

interface ApiKeyInfo {
  service_name: string;
  display_name: string;
}

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
  const [engines, setEngines] = useState<ApiKeyInfo[]>([]);
  const [currentEngine, setCurrentEngine] = useState<string>("");
  const [settings, setSettings] = useState({ sourceLang: "en" as Language, targetLang: "zh" as Language, opacity: 100, hideDelay: 5 });
  const lastTextRef = useRef<string>("");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = () => {
    if (settings.hideDelay <= 0) return;
    hideTimerRef.current = setTimeout(() => {
      getCurrentWindow().hide().catch(() => {});
    }, settings.hideDelay * 1000);
  };

  const cancelHide = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    listApiKeys().then(keys => {
      setEngines(keys);
      if (keys.length > 0 && !currentEngine) {
        setCurrentEngine(keys[0].service_name);
      }
    }).catch(() => {
      const stored = localStorage.getItem("apiKeys");
      if (stored) {
        try {
          const keys: ApiKeyInfo[] = JSON.parse(stored);
          setEngines(keys);
          if (keys.length > 0 && !currentEngine) {
            setCurrentEngine(keys[0].service_name);
          }
        } catch (e) {
          console.error("解析 localStorage 失败:", e);
        }
      }
    });
  }, []);

  useEffect(() => {
    store.getSettings().then((s: any) => {
      if (s?.sourceLang) setSettings(prev => ({ ...prev, sourceLang: s.sourceLang }));
      if (s?.targetLang) setSettings(prev => ({ ...prev, targetLang: s.targetLang }));
      if (s?.appearance?.opacity != null) setSettings(prev => ({ ...prev, opacity: s.appearance.opacity }));
      if (s?.appearance?.hideDelay != null) setSettings(prev => ({ ...prev, hideDelay: s.appearance.hideDelay }));
    }).catch(() => {});
  }, []);

  const performTranslation = async (text: string, engine: string) => {
    if (!text.trim()) return;

    setVisible(true);
    setLoading(true);
    setError(null);
    lastTextRef.current = text;
    scheduleHide();

    // 弹窗位置由 Rust 侧负责（基于光标所在显示器 + 逻辑像素边界修正），前端不做定位

    try {
      const apiResult = await translate(text, settings.sourceLang, settings.targetLang, engine);
      const translatedResult: TranslationResult = {
        id: Date.now().toString(),
        sourceText: text,
        translatedText: apiResult.text,
        sourceLang: apiResult.source_lang as TranslationResult["sourceLang"],
        targetLang: apiResult.target_lang as TranslationResult["targetLang"],
        engine: apiResult.engine as TranslationResult["engine"],
        timestamp: Date.now(),
        favorite: false,
      };
      setResult(translatedResult);

      const record: TranslationRecord = {
        id: translatedResult.id,
        source_text: translatedResult.sourceText,
        translated_text: translatedResult.translatedText,
        source_lang: translatedResult.sourceLang,
        target_lang: translatedResult.targetLang,
        engine: translatedResult.engine,
        timestamp: translatedResult.timestamp,
        favorite: 0,
      };
      saveTranslationHistory(record).catch((e: any) => console.error("[popup] 保存失败:", e));
    } catch (err) {
      console.error("[popup] 翻译失败:", err);
      setError(err instanceof Error ? err.message : "翻译失败");
      setResult({
        id: Date.now().toString(),
        sourceText: text,
        translatedText: `翻译失败: ${err instanceof Error ? err.message : "未知错误"}`,
        sourceLang: "en",
        targetLang: "zh",
        engine: engine,
        timestamp: Date.now(),
        favorite: false,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    try {
      const win = getCurrentWindow();
      win.listen<TranslateEvent>("show-translate", async (event) => {
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
          await performTranslation(text, currentEngine);
        }
      }).then((fn) => { unlisten = fn; });
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
        handleClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const [resizeState, setResizeState] = useState<{ dir: string; startX: number; startY: number; startW: number; startH: number } | null>(null);
  const resizeRef = useRef(resizeState);
  resizeRef.current = resizeState;

  const startDragWindow = (e: React.PointerEvent) => {
    e.preventDefault();
    getCurrentWindow().startDragging().catch(() => {});
  };

  const startResize = (dir: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 同步读取当前逻辑尺寸（window.innerW/H = webview 视口 = 窗口内尺寸，无需 IPC/换算）
    setResizeState({
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startW: window.innerWidth,
      startH: window.innerHeight,
    });
  };

  const rafRef = useRef(0);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const rs = resizeRef.current;
      if (!rs) return;
      if (rafRef.current) return; // rAF 合并，避免 setSize IPC 洪泛

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const cur = resizeRef.current;
        if (!cur) return;
        const dx = e.clientX - cur.startX;
        const dy = e.clientY - cur.startY;
        let w = cur.startW;
        let h = cur.startH;
        if (cur.dir.includes("E")) w = cur.startW + dx;
        if (cur.dir.includes("W")) w = cur.startW - dx;
        if (cur.dir.includes("S")) h = cur.startH + dy;
        if (cur.dir.includes("N")) h = cur.startH - dy;
        w = Math.max(200, Math.round(w));
        h = Math.max(120, Math.round(h));
        getCurrentWindow().setSize(new LogicalSize(w, h)).catch(() => {});
      });
    };
    const onUp = () => {
      setResizeState(null);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="popup-root relative w-full h-full rounded-2xl border border-gray-300 shadow-lg bg-card overflow-hidden"
          style={{ opacity: settings.opacity / 100 }}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
      onKeyDown={(e) => { if (e.key === "Escape") { handleClose(); } }}
    >
      {/* 8 个 resize 热区（每边 16px，四角 20px） */}
      <div className="absolute top-0 left-4 right-4 h-4 cursor-n-resize z-20" onPointerDown={startResize("N")} />
      <div className="absolute bottom-0 left-4 right-4 h-4 cursor-s-resize z-20" onPointerDown={startResize("S")} />
      <div className="absolute right-0 top-4 bottom-4 w-4 cursor-e-resize z-20" onPointerDown={startResize("E")} />
      <div className="absolute left-0 top-4 bottom-4 w-4 cursor-w-resize z-20" onPointerDown={startResize("W")} />
      <div className="absolute top-0 left-0 w-5 h-5 cursor-nw-resize z-20" onPointerDown={startResize("NW")} />
      <div className="absolute top-0 right-0 w-5 h-5 cursor-ne-resize z-20" onPointerDown={startResize("NE")} />
      <div className="absolute bottom-0 left-0 w-5 h-5 cursor-sw-resize z-20" onPointerDown={startResize("SW")} />
      <div className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-20" onPointerDown={startResize("SE")} />

      <div className="h-full flex flex-col overflow-hidden rounded-2xl">
        <div
          className="title-bar flex items-center justify-between px-3 py-2 border-b select-none cursor-move shrink-0"
          onPointerDown={startDragWindow}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">翻译</span>
            {engines.length > 0 && (
              <div className="flex items-center gap-1">
                {engines.map((opt) => (
                  <button
                    key={opt.service_name}
                    onClick={() => {
                      setCurrentEngine(opt.service_name);
                      if (lastTextRef.current) {
                        performTranslation(lastTextRef.current, opt.service_name);
                      }
                    }}
                    className={`px-2 py-0.5 text-xs rounded transition-colors ${
                      currentEngine === opt.service_name
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.display_name}
                  </button>
                ))}
              </div>
            )}
            {result && (
              <span className="text-xs px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground">
                {result.sourceLang.toUpperCase()} → {result.targetLang.toUpperCase()}
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
          >
            ×
          </button>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-muted-foreground">翻译中...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-sm text-destructive">
                <div className="font-medium mb-1">翻译失败</div>
                <div className="text-xs text-muted-foreground">{error}</div>
              </div>
            </div>
          ) : result ? (
            <div>
              <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">翻译</div>
              <div className="text-sm font-medium leading-relaxed text-primary">
                {result.translatedText}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              选中文本后按快捷键翻译
            </div>
          )}
        </div>

        <div className="px-3 py-2 border-t flex items-center justify-between shrink-0">
          {result && <span className="text-xs text-muted-foreground">{result.engine}</span>}
          <span className="text-xs text-muted-foreground">{loading ? "翻译中..." : ""}</span>
          <button
            onClick={handleClose}
            className="px-3 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-xs font-medium"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

export default TranslatePopup;
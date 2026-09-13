import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

// @tauri-apps/api 未导出 ResizeDirection，与 window.d.ts 内部定义保持一致
type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";
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
  const [, setEngines] = useState<ApiKeyInfo[]>([]);
  const [currentEngine, setCurrentEngine] = useState<string>("");
  const [settings, setSettings] = useState({ sourceLang: "en" as Language, targetLang: "zh" as Language, opacity: 100, hideDelay: 5 });
  const lastTextRef = useRef<string>("");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = () => {
    if (settings.hideDelay <= 0) return;
    cancelHide();
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

  const startDragWindow = (e: React.PointerEvent) => {
    e.preventDefault();
    getCurrentWindow().startDragging().catch(() => {});
  };

  // 原生 resize：交给 OS 处理拖拽循环，尺寸持久化由 Rust 侧 on_window_event 节流保存（settings.json，唯一数据源）
  const startResize = (dir: ResizeDirection) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    getCurrentWindow().startResizeDragging(dir).catch(() => {});
  };

  if (!visible) return null;

  return (
    <div
      className="popup-root relative w-full h-full rounded-2xl border border-gray-300 shadow-lg bg-card overflow-hidden"
          style={{ opacity: settings.opacity / 100 }}
      onMouseEnter={() => { cancelHide(); scheduleHide(); }}
      onMouseLeave={scheduleHide}
      onPointerDown={cancelHide}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { handleClose(); } }}
    >
      {/* 8 个 resize 热区（每边 16px，四角 20px），原生 startResizeDragging 交给 OS 处理 */}
      <div className="absolute top-0 left-4 right-4 h-4 cursor-n-resize z-20" onPointerDown={startResize("North")} />
      <div className="absolute bottom-0 left-4 right-4 h-4 cursor-s-resize z-20" onPointerDown={startResize("South")} />
      <div className="absolute right-0 top-4 bottom-4 w-4 cursor-e-resize z-20" onPointerDown={startResize("East")} />
      <div className="absolute left-0 top-4 bottom-4 w-4 cursor-w-resize z-20" onPointerDown={startResize("West")} />
      <div className="absolute top-0 left-0 w-5 h-5 cursor-nw-resize z-20" onPointerDown={startResize("NorthWest")} />
      <div className="absolute top-0 right-0 w-5 h-5 cursor-ne-resize z-20" onPointerDown={startResize("NorthEast")} />
      <div className="absolute bottom-0 left-0 w-5 h-5 cursor-sw-resize z-20" onPointerDown={startResize("SouthWest")} />
      <div className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-20" onPointerDown={startResize("SouthEast")} />

      <div className="h-full flex flex-col overflow-hidden rounded-2xl">
        <div
          className="title-bar flex items-center justify-between px-3 py-2 border-b select-none cursor-move shrink-0"
          onPointerDown={startDragWindow}
        >
          <div className="flex items-center gap-2" />
          <button
            onClick={handleClose}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
          >
            ×
          </button>
        </div>

        <div className="flex-1 p-4 overflow-y-auto min-h-0">
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
            <div className="text-sm font-medium leading-relaxed text-primary">
              {result.translatedText}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              选中文本后按快捷键翻译
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TranslatePopup;
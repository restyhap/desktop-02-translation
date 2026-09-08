import { useEffect, useRef, useState } from "react";
import { getCurrentWindow, LogicalPosition } from "@tauri-apps/api/window";
import { generateMockTranslation } from "@/mocks";
import { mockDictionaryEntries } from "@/mocks";
import type { TranslationResult } from "@/types/translation";
import type { DictionarySearchResult } from "@/types/dictionary";

interface TranslateEvent {
  text: string;
}

function TranslatePopup() {
  const [result, setResult] = useState<TranslationResult | null>(generateMockTranslation(""));
  const [dictResult, setDictResult] = useState<DictionarySearchResult | null>(null);
  const [visible, setVisible] = useState(true);
  const hideDelay = Number(localStorage.getItem("hideDelay") || "5");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = () => {
    hideTimerRef.current = setTimeout(() => {
      const win = getCurrentWindow();
      win.hide().catch(() => {});
    }, hideDelay * 1000);
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
  // 启动时直接设置可见，确保弹窗 immediate 显示
  console.log("[popup] startup: visible=true forced");
}, [visible]);

useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const win = getCurrentWindow();
        win.listen<TranslateEvent>("show-translate", async (event) => {
          console.log("[popup] received show-translate event:", event);
          let text = "";
          console.log("[popup] event payload:", event.payload);
          if (event.payload) {
            const payload = event.payload as { text: string; cursorX?: number; cursorY?: number };
            console.log("[popup] event payload:", event.payload, "| cursor:", { cursorX: payload.cursorX, cursorY: payload.cursorY });
            const text = payload.text;
            console.log("[popup] text from payload:", text);
            const mockResult = generateMockTranslation(text);
            setResult(mockResult);
            const win = getCurrentWindow();
            if (payload.cursorX != null && payload.cursorY != null) {
              const popupWidth = 480;
              const popupHeight = 360;
              let x = payload.cursorX;
              let y = payload.cursorY;
              const screenWidth = typeof screen !== 'undefined' ? screen.width : 1920;
              const screenHeight = typeof screen !== 'undefined' ? screen.height : 1080;
              if (x + popupWidth > screenWidth) x = screenWidth - popupWidth;
              if (y + popupHeight > screenHeight) y = screenHeight - popupHeight;
              if (x < 0) x = 0;
              if (y < 0) y = 0;
              win.setPosition(new LogicalPosition(x, y)).catch(() => {});
            }
            setVisible(true);
            console.log("[popup] result updated:", mockResult);
          } else {
            setVisible(true);
            setResult(generateMockTranslation(""));
          }

          const dictEntry = mockDictionaryEntries[text.toLowerCase()];
          setDictResult(dictEntry || null);

          await win.setAlwaysOnTop(true);
        }).catch((err) => {
          console.error("[popup] failed to listen:", err);
        });
      } catch (err) {
        console.error("[popup] getCurrentWindow error:", err);
      }
    }, 1000);
    
    return () => {
      clearTimeout(timer);
      console.log("[popup] cleanup listener");
    };
  }, []);

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

useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const dragArea = target.closest('.drag-handle, .title-bar');
      console.log("[drag] mousedown, dragArea found:", !!dragArea);
      if (!dragArea) return;
      const win = getCurrentWindow();
      win.startDragging().then(() => {
        console.log("[drag] startDragging success");
      }).catch((err) => {
        console.error("[drag] startDragging error:", err);
      });
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  if (!visible || !result) return null;

  return (
    <div
      className="fixed top-0 left-0 w-screen h-screen rounded-2xl border-2 border-gray-300 overflow-hidden"
      onKeyDown={(e) => { if (e.key === "Escape") {  handleClose(); } }}
    >
      <div className="drag-handle absolute top-0 left-1/2 -translate-x-1/2 h-6 w-full cursor-move select-none" />
      <div
        className="absolute inset-0 bg-card flex flex-col"
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
      >
        <div
          className="title-bar flex items-center justify-between px-3 py-2 border-b select-none cursor-move"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">翻译</span>
            <span className="text-xs px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground">
              {result.sourceLang.toUpperCase()} → {result.targetLang.toUpperCase()}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
          >
            ×
          </button>
        </div>
        <div className="flex-1 p-3 overflow-y-auto">
          <div className="mb-3">
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">原文</div>
            <div className="text-sm leading-relaxed text-foreground">{result.sourceText}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">翻译</div>
            <div className="text-sm font-medium leading-relaxed text-primary">
              {result.translatedText}
            </div>
          </div>
          {dictResult && dictResult.entries.length > 0 && (
            <div className="mt-4 pt-3 border-t">
              <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">词典释义</div>
              {dictResult.entries.map((entry, i) => (
                <div key={i} className="mb-3">
                  <div className="text-sm font-medium">{entry.word}{entry.phonetic && <span className="text-muted-foreground"> {entry.phonetic}</span>}</div>
                  {entry.definitions.map((def, j) => (
                    <div key={j} className="text-sm mt-1 ml-2">
                      <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{def.partOfSpeech}</span>
                      <span className="ml-1">{def.meaning}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-3 py-2 border-t flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{result.engine}</span>
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
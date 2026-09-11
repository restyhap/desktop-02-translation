import { useState, useEffect, useCallback, useRef } from "react";

interface ShortcutRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
  disabled?: boolean;
}

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "ControlRight", "AltRight", "ShiftRight", "MetaRight"]);

function parseShortcut(shortcut: string): string[] {
  if (!shortcut) return [];
  return shortcut.split("+").map(k => k.trim());
}

function formatShortcut(parts: string[]): string {
  const displayMap: Record<string, string> = {
    "Control": "Ctrl",
    "Meta": "⌘",
    "Alt": "⌥",
    "Shift": "⇧",
  };
  
  return parts.map(p => displayMap[p] || p).join(" + ");
}

export function ShortcutRecorder({ value, onChange, disabled }: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [pressedKeys, setPressedKeys] = useState<string[]>([]);
  const pressedSetRef = useRef(new Set<string>());
  
  const startRecording = useCallback(() => {
    if (disabled) return;
    setRecording(true);
    setPressedKeys([]);
    pressedSetRef.current.clear();
  }, [disabled]);
  
  const stopRecording = useCallback(() => {
    setRecording(false);
    pressedSetRef.current.clear();
  }, []);
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    
    const key = e.key;
    
    if (key === "Escape") {
      stopRecording();
      onChange(value);
      return;
    }
    
    if (key === "Backspace" || key === "Delete") {
      pressedSetRef.current.clear();
      setPressedKeys([]);
      return;
    }
    
    if (!pressedSetRef.current.has(key)) {
      pressedSetRef.current.add(key);
      setPressedKeys(Array.from(pressedSetRef.current));
    }
    
    if (pressedSetRef.current.size >= 1) {
      const hasModifier = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
      const isModifier = MODIFIER_KEYS.has(key);
      
      if (hasModifier && !isModifier) {
        const finalShortcut = formatShortcut(Array.from(pressedSetRef.current));
        stopRecording();
        onChange(finalShortcut);
      }
    }
  }, [recording, value, onChange, stopRecording]);
  
  const handleKeyUp = useCallback(() => {
    if (pressedSetRef.current.size > 0 && !Array.from(pressedSetRef.current).some(k => MODIFIER_KEYS.has(k))) {
      const timeout = setTimeout(() => {
        if (pressedSetRef.current.size > 0) {
          const finalShortcut = formatShortcut(Array.from(pressedSetRef.current));
          stopRecording();
          onChange(finalShortcut);
        }
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [stopRecording, onChange]);

  useEffect(() => {
    if (!recording) return;
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("keyup", handleKeyUp, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [recording, handleKeyDown, handleKeyUp]);
  
  const displayText = recording 
    ? (pressedKeys.length > 0 ? formatShortcut(pressedKeys) : "请按快捷键...")
    : (value ? formatShortcut(parseShortcut(value)) : "未设置");
  
  return (
    <button
      onClick={startRecording}
      disabled={disabled || recording}
      className={`flex items-center gap-2 px-3 py-2 border rounded-md text-sm font-mono transition-all ${
        recording
          ? "border-primary bg-primary/10 text-primary animate-pulse"
          : "border-input bg-background hover:bg-muted text-foreground"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {displayText.split(" + ").map((key, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground">+</span>}
          <kbd className="px-2 py-1 bg-background border rounded text-xs shadow-sm">
            {key}
          </kbd>
        </span>
      ))}
      {recording && <span className="text-xs opacity-75 ml-1">按 Esc 取消</span>}
    </button>
  );
}

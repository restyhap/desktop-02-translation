import { useState, useEffect, useCallback, useRef } from "react";

interface ShortcutRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
  disabled?: boolean;
}

const MODIFIER_KEYS = new Set([
  "Control", "Alt", "Shift", "Meta",
  "ControlRight", "AltRight", "ShiftRight", "MetaRight",
]);

const MODIFIER_DISPLAY: Record<string, string> = {
  Control: "Ctrl",
  ControlRight: "Ctrl",
  Alt: "⌥",
  AltRight: "⌥",
  Shift: "⇧",
  ShiftRight: "⇧",
  Meta: "⌘",
  MetaRight: "⌘",
};

const SEQ_WINDOW = 500;

function parseShortcut(shortcut: string): string[] {
  if (!shortcut) return [];
  return shortcut
    .split("+")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

function formatKey(key: string): string {
  if (MODIFIER_DISPLAY[key]) return MODIFIER_DISPLAY[key];
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function formatShortcut(parts: string[]): string {
  return parts.map(formatKey).join("+");
}

export function ShortcutRecorder({ value, onChange, disabled }: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [pressedKeys, setPressedKeys] = useState<string[]>([]);

  const keysRef = useRef<string[]>([]);
  const activeModifiersRef = useRef<Set<string>>(new Set());
  const lastKeyTimeRef = useRef(0);

  const clearAll = () => {
    keysRef.current = [];
    activeModifiersRef.current.clear();
    lastKeyTimeRef.current = 0;
    setPressedKeys([]);
  };

  const startRecording = useCallback(() => {
    if (disabled) return;
    clearAll();
    setRecording(true);
  }, [disabled]);

  const stopRecording = useCallback(() => {
    setRecording(false);
    clearAll();
  }, []);

  const commit = useCallback(
    (keys: string[]) => {
      stopRecording();
      if (keys.length > 0) {
        onChange(formatShortcut(keys));
      } else {
        onChange("");
      }
    },
    [stopRecording, onChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();

      const key = e.key;

      if (key === "Escape") {
        stopRecording();
        onChange(value);
        return;
      }

      if (key === "Enter") {
        commit([...keysRef.current]);
        return;
      }

      if (key === "Backspace" || key === "Delete") {
        keysRef.current.pop();
        setPressedKeys([...keysRef.current]);
        lastKeyTimeRef.current = 0;
        return;
      }

      if (MODIFIER_KEYS.has(key)) {
        activeModifiersRef.current.add(key);
        if (!keysRef.current.includes(key)) {
          keysRef.current.push(key);
          setPressedKeys([...keysRef.current]);
        }
        return;
      }

      if (activeModifiersRef.current.size === 0) return;

      const now = Date.now();
      if (lastKeyTimeRef.current > 0 && now - lastKeyTimeRef.current > SEQ_WINDOW) {
        keysRef.current = keysRef.current.filter((k) => MODIFIER_KEYS.has(k));
      }

      const normalized = key.length === 1 ? key.toUpperCase() : key;
      keysRef.current.push(normalized);
      lastKeyTimeRef.current = now;
      setPressedKeys([...keysRef.current]);
    },
    [recording, value, onChange, commit, stopRecording]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (!recording) return;
      const key = e.key;
      if (MODIFIER_KEYS.has(key)) {
        activeModifiersRef.current.delete(key);
      }
    },
    [recording]
  );

  useEffect(() => {
    if (!recording) return;
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("keyup", handleKeyUp, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [recording, handleKeyDown, handleKeyUp]);

  const displayParts = recording
    ? (pressedKeys.length > 0 ? pressedKeys.map(formatKey) : [])
    : (value ? parseShortcut(value).map(formatKey) : []);

  const displayText =
    displayParts.length > 0 ? displayParts.join(" + ") : (recording ? "请按快捷键..." : "未设置");

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
      {recording && (
        <span className="text-xs opacity-75 ml-1">Enter 确认 · Esc 取消 · Backspace 删除</span>
      )}
    </button>
  );
}

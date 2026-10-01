/**
 * 快捷键录制器 — src 交互逻辑（.ekey 解析/序列窗/disabled 状态）× preview 视觉
 *
 * document 捕获阶段 keydown/keyup；pressedKeys + activeModifiers + 500ms 序列窗；
 * Escape=取消还原，Enter=提交，Backspace/Delete=弹出末键；普通键必须有修饰键。
 *
 * 引导可见化（防新用户无感）：录制中在按钮下方常驻显示「Enter 确认 · Esc 取消 · Backspace 删除」
 * （此前只挂在 title 提示气泡里，需悬停才可见）；按到无修饰键的普通键时改显红色「需先按住修饰键」。
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useAppLocale } from "@/lib/i18n";

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
  const { t } = useAppLocale();
  const [recording, setRecording] = useState(false);
  const [pressedKeys, setPressedKeys] = useState<string[]>([]);
  /** 刚按了无修饰键的普通键（被忽略）→ 显示红色提示引导补修饰键 */
  const [needModifier, setNeedModifier] = useState(false);

  const keysRef = useRef<string[]>([]);
  const activeModifiersRef = useRef<Set<string>>(new Set());
  const lastKeyTimeRef = useRef(0);

  const clearAll = () => {
    keysRef.current = [];
    activeModifiersRef.current.clear();
    lastKeyTimeRef.current = 0;
    setPressedKeys([]);
    setNeedModifier(false);
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
      onChange(keys.length > 0 ? formatShortcut(keys) : "");
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
        // 空组合按回车不作确认：否则「点录制后顺手按回车」会静默清空已设置的快捷键
        if (keysRef.current.length === 0) return;
        commit([...keysRef.current]);
        return;
      }

      if (key === "Backspace" || key === "Delete") {
        keysRef.current.pop();
        lastKeyTimeRef.current = 0;
        // 退格删到空 = 清空该快捷键并结束录制（清空的唯一出口，Enter 空提交已被上面拦住）
        if (keysRef.current.length === 0) {
          commit([]);
          return;
        }
        setPressedKeys([...keysRef.current]);
        return;
      }

      if (MODIFIER_KEYS.has(key)) {
        activeModifiersRef.current.add(key);
        setNeedModifier(false);
        if (!keysRef.current.includes(key)) {
          keysRef.current.push(key);
          setPressedKeys([...keysRef.current]);
        }
        return;
      }

      // 普通键必须搭配修饰键；否则给出可见反馈而不是静默丢弃（此前新用户会以为没生效）
      if (activeModifiersRef.current.size === 0) {
        setNeedModifier(true);
        return;
      }

      const now = Date.now();
      if (lastKeyTimeRef.current > 0 && now - lastKeyTimeRef.current > SEQ_WINDOW) {
        keysRef.current = keysRef.current.filter((k) => MODIFIER_KEYS.has(k));
      }

      const normalized = key.length === 1 ? key.toUpperCase() : key;
      keysRef.current.push(normalized);
      lastKeyTimeRef.current = now;
      setNeedModifier(false);
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
    ? pressedKeys.map(formatKey)
    : parseShortcut(value).map(formatKey);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={startRecording}
        disabled={disabled || recording}
        title={recording ? t("shortcut.recordingTip") : t("shortcut.clickToRecord")}
        className={`flex h-8 min-w-32 flex-wrap items-center gap-1 rounded-md border px-2.5 text-left text-xs transition-colors ${
          recording
            ? "animate-pulse border-accent text-accent"
            : "border-line bg-bg-elevated text-ink hover:border-accent/50"
        } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      >
        {displayParts.length > 0 ? (
          displayParts.map((key, i) => (
            <kbd
              key={i}
              className="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[11px] leading-5"
            >
              {key}
            </kbd>
          ))
        ) : (
          <span>
            {recording ? t("shortcut.pressNow") : value || t("shortcut.notSet")}
          </span>
        )}
      </button>
      {/* 录制中常驻可见的操作提示：Enter 确认 / Esc 取消 / Backspace 删除 */}
      {recording && (
        <p
          className={`max-w-56 text-right text-[11px] leading-4 ${
            needModifier ? "text-red" : "text-ink-3"
          }`}
        >
          {needModifier ? t("shortcut.needModifier") : t("shortcut.recordingTip")}
        </p>
      )}
    </div>
  );
}

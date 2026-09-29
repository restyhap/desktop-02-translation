/**
 * 快捷键录制器 — 对齐 src/components/ShortcutRecorder.tsx
 *
 * document 捕获阶段 keydown/keyup；pressedKeys + activeModifiers +
 * 500ms 序列窗；Escape=取消还原，Enter=提交，Backspace/Delete=弹出末键；
 * 普通键必须有修饰键才记录。
 */
import { useEffect, useRef, useState } from "react";
import { useAppLocale } from "@/lib/i18n";

const SEQ_WINDOW = 500;

const isModifier = (code: string) =>
  code === "ControlLeft" || code === "ControlRight" ||
  code === "ShiftLeft" || code === "ShiftRight" ||
  code === "AltLeft" || code === "AltRight" ||
  code === "MetaLeft" || code === "MetaRight";

/** 键码 → 单键显示（Ctrl/⌥/⇧/⌘ 由码映射） */
const MOD_LABEL: Record<string, string> = {
  ControlLeft: "Ctrl", ControlRight: "Ctrl",
  ShiftLeft: "⇧", ShiftRight: "⇧",
  AltLeft: "⌥", AltRight: "⌥",
  MetaLeft: "⌘", MetaRight: "⌘",
};

function keyLabel(code: string): string {
  return MOD_LABEL[code] ?? code.replace(/^Key|^Digit/, "").toUpperCase();
}

interface ShortcutRecorderProps {
  value: string;
  onChange: (value: string) => void;
}

export function ShortcutRecorder({ value, onChange }: ShortcutRecorderProps) {
  const { t } = useAppLocale();
  const [recording, setRecording] = useState(false);
  const [pressed, setPressed] = useState<string[]>([]);
  const [modifiers, setModifiers] = useState<string[]>([]);
  const seqTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!recording) return;

    const pushKey = (code: string) => {
      seqTimer.current && clearTimeout(seqTimer.current);
      setPressed((prev) => [...prev, code]);
      // 500ms 序列窗：超窗清掉非修饰键（对齐 src）
      seqTimer.current = setTimeout(() => {
        setPressed((prev) => prev.filter(isModifier));
      }, SEQ_WINDOW);
    };

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code === "Escape") {
        setRecording(false);
        setPressed([]);
        setModifiers([]);
        return;
      }
      if (e.code === "Enter") {
        // 提交
        if (pressed.length > 0) {
          onChange(pressed.map(keyLabel).join("+"));
        }
        setRecording(false);
        setPressed([]);
        setModifiers([]);
        return;
      }
      if (e.code === "Backspace" || e.code === "Delete") {
        setPressed((prev) => prev.slice(0, -1));
        return;
      }
      if (isModifier(e.code)) {
        if (!pressed.includes(e.code)) {
          pushKey(e.code);
          setModifiers((prev) => [...prev, e.code]);
        }
        return;
      }
      // 普通键必须已有修饰键
      if (modifiers.length > 0) {
        pushKey(e.code.length > 4 ? e.code.replace(/^Key|^Digit/, "").toUpperCase() : e.code);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isModifier(e.code)) {
        setModifiers((prev) => prev.filter((m) => m !== e.code));
      }
    };

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKeyUp, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keyup", onKeyUp, true);
      seqTimer.current && clearTimeout(seqTimer.current);
    };
  }, [recording, pressed, modifiers, onChange]);

  return (
    <button
      onClick={() => setRecording(true)}
      title={recording ? t("shortcut.recordingTip") : t("shortcut.clickToRecord")}
      className={`h-8 min-w-32 rounded-md border px-2.5 text-left text-xs transition-colors ${
        recording
          ? "animate-pulse border-accent text-accent"
          : "border-line bg-bg-elevated text-ink hover:border-accent/50"
      }`}
    >
      {recording
        ? pressed.length > 0
          ? pressed.map(keyLabel).join("+")
          : t("shortcut.pressNow")
        : value || t("shortcut.notSet")}
    </button>
  );
}

import { useState, useEffect, useCallback } from "react";

interface ShortcutRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
  disabled?: boolean;
}

function formatKey(e: KeyboardEvent): string | null {
  const parts: string[] = [];

  // Modifier key mapping - support all specified keys
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.key === "Meta" || e.metaKey) parts.push("⌘");
  if (e.altKey) parts.push("⌥");
  if (e.shiftKey) parts.push("⇧");

  // Standard keys
  const key = e.key;

  // Function keys F1-F19
  if (key.startsWith("F") && /^F\d$/.test(key)) {
    parts.push(key);
  }
  // Special handling for common keys
  else if (key === "Control") {
    // ctrlKey already handled; skip duplicate
  }
  else if (key === "Meta") {
    // metaKey already handled; skip duplicate
  }
  else if (key === "Alt") {
    // altKey already handled; skip duplicate
  }
  else if (key === "Shift") {
    // shiftKey already handled; skip duplicate
  }
  else if (key === " ") {
    parts.push("Space");
  }
  else if (key.length === 1) {
    parts.push(key.toUpperCase());
  }
  else if (
    key &&
    !["Control", "Meta", "Shift", "Alt"].includes(key) &&
    key.length > 1
  ) {
    // Other keys (arrow keys, etc.) - use their name
    parts.push(key);
  }

  // Remove duplicate modifiers (if both ctrlKey and e.key="Control" fired)
  const uniqueParts = parts.filter(
    (part, index, self) => self.indexOf(part) === index
  );

  return uniqueParts.length > 0 ? uniqueParts.join("+") : null;
}

export function ShortcutRecorder({ value, onChange, disabled }: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState<string>("");

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();

      // ESC: exit recording without saving
      if (e.key === "Escape" || e.key === "Esc") {
        setRecording(false);
        setPreview("");
        onChange(value); // restore original value
        return;
      }

      // DELETE: go back (remove last key from preview)
      if (e.key === "Delete" || e.key === "Backspace") {
        setPreview((prev) => {
          const parts = prev.split("+");
          parts.pop();
          return parts.length > 0 ? parts.join("+") : "";
        });
        return;
      }

      // ENTER: confirm and save the shortcut
      if (e.key === "Enter") {
        setRecording(false);
        setPreview("");
        if (preview.trim()) {
          onChange(preview);
        } else {
          onChange(value); // restore original on empty
        }
        return;
      }

      const combo = formatKey(e);
      if (!combo) return;

      // Check if this is a modifier-only press (no actual key)
      const isModifierOnly =
        ["Control", "Meta", "Shift", "Alt"].includes(e.key);

      // Allow modifier keys to be added to combo
      // Also allow standalone modifier display
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;

      // If we have a modifier + a key, or just a modifier, record it
      if (hasModifier || !isModifierOnly) {
        setPreview(combo);
      }
    },
    [recording, onChange, value]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      setRecording((prev) => !prev);
      setPreview("");
    },
    [disabled]
  );

  useEffect(() => {
    if (!recording) return;

    // Capture keydown events during recording
    const listener = (e: KeyboardEvent) => {
      handleKeyDown(e);
    };
    document.addEventListener("keydown", listener, true);
    return () => document.removeEventListener("keydown", listener, true);
  }, [recording, handleKeyDown]);

  const displayText = recording ? (preview || "按 Esc 退出, Del 回车确认") : value;

  return (
    <button
      onMouseDown={handleMouseDown}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm font-mono transition-colors ${
        recording
          ? "border-primary bg-primary/10 text-primary animate-pulse"
          : "border-input bg-muted hover:bg-muted/80 text-foreground"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {displayText.split("+").map((key, i) => (
        <span key={i}>
          {i > 0 && <span className="text-muted-foreground mx-0.5">+</span>}
          <kbd className="px-1.5 py-0.5 bg-background border rounded text-xs">
            {key}
          </kbd>
        </span>
      ))}
    </button>
  );
}
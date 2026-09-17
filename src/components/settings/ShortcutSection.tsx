import { useState, useEffect } from "react";
import { getShortcuts, updateShortcuts } from "@/storage";
import type { ShortcutConfig } from "@/types/shortcuts";
import { ShortcutRecorder } from "../ShortcutRecorder";

interface ShortcutSectionProps {
  registerRef: (id: string) => (el: HTMLDivElement | null) => void;
}

export function ShortcutSection({ registerRef }: ShortcutSectionProps) {
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>({ translate: "", show_main: "" });
  const [shortcutsLoaded, setShortcutsLoaded] = useState(false);

  useEffect(() => {
    const loadShortcuts = async () => {
      try {
        const config = await getShortcuts<ShortcutConfig>();
        setShortcuts(config);
      } catch {
        setShortcutsLoaded(true);
      }
    };
    loadShortcuts();
  }, []);

  const updateShortcut = (key: keyof ShortcutConfig, value: string) => {
    const updated = { ...shortcuts, [key]: value };
    setShortcuts(updated);
    updateShortcuts(updated);
  };

  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold mb-3 text-foreground">快捷键</h3>

      <div
        id="section-shortcut-translate"
        ref={registerRef("section-shortcut-translate")}
        className="py-2.5 border-b border-border/50"
      >
        <div className="text-sm font-medium text-foreground mb-2">翻译快捷键</div>
        <div className="text-xs text-muted-foreground mb-2">双击目标键触发翻译</div>
        <ShortcutRecorder
          value={shortcuts.translate}
          onChange={(value) => updateShortcut("translate", value)}
          disabled={!shortcutsLoaded}
        />
      </div>

      <div
        id="section-shortcut-show-main"
        ref={registerRef("section-shortcut-show-main")}
        className="py-3"
      >
        <div className="text-sm font-medium text-foreground mb-2">显示主窗口</div>
        <div className="text-xs text-muted-foreground mb-2">双击目标键唤起主窗口</div>
        <ShortcutRecorder
          value={shortcuts.show_main}
          onChange={(value) => updateShortcut("show_main", value)}
          disabled={!shortcutsLoaded}
        />
      </div>
    </div>
  );
}
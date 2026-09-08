import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { mockSettings } from "@/mocks";
import type { AppSettings } from "@/types/settings";
import type { ShortcutConfig } from "@/types/shortcuts";
import { SUPPORTED_LANGUAGES, ENGINE_OPTIONS } from "@/types/translation";
import { ShortcutRecorder } from "./ShortcutRecorder";

interface SettingsPanelProps {
  onClose?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  sectionId: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: "通用",
    items: [
      { id: "launch", label: "开机自启", sectionId: "section-general" },
      { id: "close-behavior", label: "关闭行为", sectionId: "section-close-behavior" },
      { id: "auto-update", label: "自动更新", sectionId: "section-auto-update" },
    ],
  },
  {
    title: "翻译",
    items: [
      { id: "source-lang", label: "默认源语言", sectionId: "section-source-lang" },
      { id: "target-lang", label: "默认目标语言", sectionId: "section-target-lang" },
      { id: "default-engine", label: "默认引擎", sectionId: "section-default-engine" },
      { id: "api-keys", label: "API Key", sectionId: "section-api-keys" },
      { id: "auto-detect", label: "自动检测", sectionId: "section-auto-detect" },
    ],
  },
  {
    title: "模型",
    items: [
      { id: "llm-endpoint", label: "请求地址", sectionId: "section-llm-endpoint" },
      { id: "llm-key", label: "API Key", sectionId: "section-llm-key" },
    ],
  },
  {
    title: "外观",
    items: [
      { id: "theme", label: "主题", sectionId: "section-theme" },
      { id: "font-size", label: "字体大小", sectionId: "section-font-size" },
      { id: "opacity", label: "不透明度", sectionId: "section-opacity" },
      { id: "hide-delay", label: "自动隐藏延迟", sectionId: "section-hide-delay" },
      { id: "dict-dir", label: "词典目录", sectionId: "section-dict-dir" },
      { id: "dict-order", label: "词典顺序", sectionId: "section-dict-order" },
    ],
  },
  {
    title: "快捷键",
    items: [
      { id: "shortcut-translate", label: "翻译", sectionId: "section-shortcut-translate" },
      { id: "shortcut-show-main", label: "显示主窗口", sectionId: "section-shortcut-show-main" },
    ],
  },
];

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings>(mockSettings);
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>({ translate: "", show_main: "" });
  const [shortcutsLoaded, setShortcutsLoaded] = useState(false);
  const [activeNavId, setActiveNavId] = useState<string>("launch");
  const [isDraggingNav, setIsDraggingNav] = useState(false);
  const [draggedNavId, setDraggedNavId] = useState<string | null>(null);
  const [dropOverId, setDropOverId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    invoke<ShortcutConfig>("get_shortcuts_cmd")
      .then((config) => {
        setShortcuts(config);
        setShortcutsLoaded(true);
      })
      .catch(() => setShortcutsLoaded(true));

    invoke<string>("get_close_behavior_cmd")
      .then((behavior) => {
        setSettings((prev) => ({
          ...prev,
          general: { ...prev.general, closeBehavior: behavior as "minimizeToTray" | "exit" },
        }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const content = contentRef.current;
      if (!content) return;
      const sections = content.getBoundingClientRect();

      let closestId = navGroups[0].items[0].sectionId;
      let closestDistance = Infinity;

      navGroups.forEach((group) => {
        group.items.forEach((item) => {
          const el = sectionRefs.current[item.sectionId];
          if (el) {
            const rect = el.getBoundingClientRect();
            const distance = Math.abs(rect.top - sections.top);
            if (distance < closestDistance) {
              closestDistance = distance;
              closestId = item.sectionId;
            }
          }
        });
      });

      const activeItem = navGroups
        .flatMap((g) => g.items)
        .find((item) => item.sectionId === closestId);
      if (activeItem) {
        setActiveNavId(activeItem.id);
      }
    };

    const content = contentRef.current;
    if (content) {
      content.addEventListener("scroll", handleScroll);
      return () => content.removeEventListener("scroll", handleScroll);
    }
  }, []);

  useEffect(() => {
    const handleNavMouseDown = (event: MouseEvent) => {
      const button = event.target as HTMLElement;
      if (button.className.includes("hover:bg-muted")) {
        setDraggedNavId(button.id);
        setIsDraggingNav(true);
        setDropOverId(null);
        // Capture mouse to receive up events even when leaving the element
        document.addEventListener("mousemove", handleNavMouseMove);
        document.addEventListener("mouseup", handleNavMouseUp);
      }
    };

    const handleNavMouseMove = (event: MouseEvent) => {
      // Calculate which nav item is under the mouse
      const allNavs = document.querySelectorAll(
        `.w-56 .flex.flex-col > button.w-full.text-left.px-3.py-2`
      );
      let overId = null;
      
      allNavs.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        ) {
          overId = el.getAttribute("id");
        }
      });
      
      setDropOverId(overId);
    };

    const handleNavMouseUp = () => {
      setIsDraggingNav(false);
      setDraggedNavId(null);
      setDropOverId(null);
      document.removeEventListener("mousemove", handleNavMouseMove);
      document.removeEventListener("mouseup", handleNavMouseUp);
    };

    // Add mousedown listeners to nav buttons
    const navButtons = document.querySelectorAll(
      `.w-56 .flex.flex-col > button.w-full.text-left.px-3.py-2`
    );
    navButtons.forEach((button) => {
      button.addEventListener("mousedown", handleNavMouseDown);
    });

    return () => {
      navButtons.forEach((button) => {
        button.removeEventListener("mousedown", handleNavMouseDown);
      });
      document.removeEventListener("mousemove", handleNavMouseMove);
      document.removeEventListener("mouseup", handleNavMouseUp);
    };
  }, []);

  const scrollToSection = useCallback((sectionId: string) => {
    const el = sectionRefs.current[sectionId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const updateGeneral = (key: keyof AppSettings["general"], value: boolean | string) => {
    setSettings((prev) => ({
      ...prev,
      general: { ...prev.general, [key]: value },
    }));
    if (key === "closeBehavior") {
      invoke("update_close_behavior_cmd", { behavior: value });
    }
  };

  const updateTranslation = (key: keyof AppSettings["translation"], value: unknown) => {
    setSettings((prev) => ({
      ...prev,
      translation: { ...prev.translation, [key]: value },
    }));
  };

  const updateAppearance = (key: keyof AppSettings["appearance"], value: unknown) => {
    setSettings((prev) => ({
      ...prev,
      appearance: { ...prev.appearance, [key]: value },
    }));
    if (key === "hideDelay") {
      localStorage.setItem("hideDelay", String(value));
    }
  };

  const updateLlm = (key: keyof AppSettings["llm"], value: string) => {
    setSettings((prev) => ({
      ...prev,
      llm: { ...prev.llm, [key]: value },
    }));
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <h2 className="text-lg font-semibold">设置</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
        >
          ×
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
<div className="w-56 border-r flex flex-col py-3 overflow-y-auto shrink-0">
              {navGroups.map((group, groupIndex) => (
              <div key={group.title} className="mb-1">
                <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.title}
                </div>
                {groupIndex > 0 && <hr className="my-2 border-border bg-muted/20" />}
                {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveNavId(item.id);
                    scrollToSection(item.sectionId);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    activeNavId === item.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div ref={contentRef} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div id="section-general" ref={(el) => { sectionRefs.current["section-general"] = el; }}>
            <h3 className="font-semibold text-base mb-3">开机自启</h3>
            <div className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm text-muted-foreground">系统启动时自动运行</div>
              </div>
              <input
                type="checkbox"
                checked={settings.general.launchAtStartup}
                onChange={(e) => updateGeneral("launchAtStartup", e.target.checked)}
                className="h-4 w-4"
              />
            </div>
          </div>

          <div id="section-close-behavior" ref={(el) => { sectionRefs.current["section-close-behavior"] = el; }}>
            <h3 className="font-semibold text-base mb-3">关闭行为</h3>
            <div className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm text-muted-foreground">点击关闭按钮时的行为</div>
              </div>
              <select
                value={settings.general.closeBehavior}
                onChange={(e) => updateGeneral("closeBehavior", e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                <option value="minimizeToTray">最小化到托盘</option>
                <option value="exit">退出程序</option>
              </select>
            </div>
          </div>

          <div id="section-auto-update" ref={(el) => { sectionRefs.current["section-auto-update"] = el; }}>
            <h3 className="font-semibold text-base mb-3">自动更新</h3>
            <div className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm text-muted-foreground">检查并安装更新</div>
              </div>
              <input
                type="checkbox"
                checked={settings.general.checkUpdates}
                onChange={(e) => updateGeneral("checkUpdates", e.target.checked)}
                className="h-4 w-4"
              />
            </div>
          </div>

          <div id="section-source-lang" ref={(el) => { sectionRefs.current["section-source-lang"] = el; }}>
            <h3 className="font-semibold text-base mb-3">默认源语言</h3>
            <select
              value={settings.translation.defaultSourceLang}
              onChange={(e) => updateTranslation("defaultSourceLang", e.target.value)}
              className="w-full mt-2 px-3 py-2 border rounded-md text-sm"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
          </div>

          <div id="section-target-lang" ref={(el) => { sectionRefs.current["section-target-lang"] = el; }}>
            <h3 className="font-semibold text-base mb-3">默认目标语言</h3>
            <select
              value={settings.translation.defaultTargetLang}
              onChange={(e) => updateTranslation("defaultTargetLang", e.target.value)}
              className="w-full mt-2 px-3 py-2 border rounded-md text-sm"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
          </div>

          <div id="section-default-engine" ref={(el) => { sectionRefs.current["section-default-engine"] = el; }}>
            <h3 className="font-semibold text-base mb-3">默认翻译引擎</h3>
            <select
              value={settings.translation.defaultEngine}
              onChange={(e) => updateTranslation("defaultEngine", e.target.value)}
              className="w-full mt-2 px-3 py-2 border rounded-md text-sm"
            >
              {ENGINE_OPTIONS.map((engine) => (
                <option key={engine.value} value={engine.value}>{engine.label}</option>
              ))}
            </select>
          </div>

          <div id="section-api-keys" ref={(el) => { sectionRefs.current["section-api-keys"] = el; }}>
            <h3 className="font-semibold text-base mb-3">API Key</h3>
            <div className="space-y-3">
              {ENGINE_OPTIONS.map((engine) => (
                <div key={engine.value} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{engine.label}:</span>
                    <input
                      type="text"
                      value={settings.translation.apiKeys[engine.value]}
                      onChange={(e) => updateTranslation("apiKeys", { ...settings.translation.apiKeys, [engine.value]: e.target.value })}
                      className="flex-1 px-2 py-2 border rounded-md text-sm w-full"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {engine.label === "google" ? "获取方式: Google AI Studio" : engine.label === "deepl" ? "获取方式: DeepL Developer Portal" : engine.label === "baidu" ? "获取方式: Baidu AI Cloud" : "获取方式: 有道开放平台"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div id="section-auto-detect" ref={(el) => { sectionRefs.current["section-auto-detect"] = el; }}>
            <h3 className="font-semibold text-base mb-3">自动检测语言</h3>
            <div className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm text-muted-foreground">自动识别源语言</div>
              </div>
              <input
                type="checkbox"
                checked={settings.translation.autoDetect}
                onChange={(e) => updateTranslation("autoDetect", e.target.checked)}
                className="h-4 w-4"
              />
            </div>
          </div>

          <div id="section-llm-endpoint" ref={(el) => { sectionRefs.current["section-llm-endpoint"] = el; }}>
            <h3 className="font-semibold text-base mb-3">模型请求地址</h3>
            <input
              type="text"
              value={settings.llm.endpoint}
              onChange={(e) => updateLlm("endpoint", e.target.value)}
              className="w-full px-2 py-2 border rounded-md text-sm mt-1"
              placeholder="http://localhost:11434/api/generate"
            />
          </div>

          <div id="section-llm-key" ref={(el) => { sectionRefs.current["section-llm-key"] = el; }}>
            <h3 className="font-semibold text-base mb-3">模型 API Key</h3>
            <input
              type="text"
              value={settings.llm.apiKey}
              onChange={(e) => updateLlm("apiKey", e.target.value)}
              className="w-full px-2 py-2 border rounded-md text-sm mt-1"
              placeholder="输入大模型 API Key"
            />
          </div>

          <div id="section-theme" ref={(el) => { sectionRefs.current["section-theme"] = el; }}>
            <h3 className="font-semibold text-base mb-3">主题</h3>
            <select
              value={settings.appearance.theme}
              onChange={(e) => updateAppearance("theme", e.target.value)}
              className="w-full mt-2 px-3 py-2 border rounded-md text-sm"
            >
              <option value="light">浅色</option>
              <option value="dark">深色</option>
              <option value="system">跟随系统</option>
            </select>
          </div>

          <div id="section-font-size" ref={(el) => { sectionRefs.current["section-font-size"] = el; }}>
            <h3 className="font-semibold text-base mb-3">字体大小</h3>
            <select
              value={settings.appearance.fontSize}
              onChange={(e) => updateAppearance("fontSize", e.target.value)}
              className="w-full mt-2 px-3 py-2 border rounded-md text-sm"
            >
              <option value="small">小</option>
              <option value="medium">中</option>
              <option value="large">大</option>
            </select>
          </div>

          <div id="section-opacity" ref={(el) => { sectionRefs.current["section-opacity"] = el; }}>
            <h3 className="font-semibold text-base mb-3">不透明度: {settings.appearance.opacity}%</h3>
            <input
              type="range"
              min="50"
              max="100"
              value={settings.appearance.opacity}
              onChange={(e) => updateAppearance("opacity", parseInt(e.target.value))}
              className="w-full mt-2"
            />
          </div>

          <div id="section-dict-dir" ref={(el) => { sectionRefs.current["section-dict-dir"] = el; }}>
            <h3 className="font-semibold text-base mb-3">词典目录</h3>
            <input
              type="file"
              {...({ webkitdirectory: true, directory: "" } as any)}
              value={settings.appearance.dictionaryDirectory || ""}
              onChange={(e) => updateAppearance("dictionaryDirectory", e.target.value)}
              className="w-full px-2 py-2 border rounded-md text-sm mt-1"
            />
          </div>

          <div id="section-hide-delay" ref={(el) => { sectionRefs.current["section-hide-delay"] = el; }}>
            <h3 className="font-semibold text-base mb-3">自动隐藏延迟</h3>
            <div className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm text-muted-foreground">鼠标离开弹窗后自动隐藏</div>
              </div>
              <select
                value={settings.appearance.hideDelay}
                onChange={(e) => updateAppearance("hideDelay", Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                <option value={0}>不隐藏</option>
                <option value={3}>3 秒</option>
                <option value={5}>5 秒</option>
                <option value={10}>10 秒</option>
              </select>
            </div>
          </div>

          <div id="section-dict-order" ref={(el) => { sectionRefs.current["section-dict-order"] = el; }}>
            <h3 className="font-semibold text-base mb-3">词典显示顺序</h3>
            <div className="space-y-2">
              {ENGINE_OPTIONS.map((engine, index) => (
                <div key={engine.value} className="flex items-center justify-between">
                  <span className="font-medium">{engine.label}</span>
                  <select
                    value={String(settings.appearance.dictionaryOrder[index] || index)}
                    onChange={(e) => {
                      const order = [...settings.appearance.dictionaryOrder];
                      order[index] = Number(e.target.value);
                      updateAppearance("dictionaryOrder", order);
                    }}
                    className="ml-2 px-2 py-2 border rounded-md text-sm w-20"
                  >
                    <option value={0}>默认</option>
                    <option value={1}>优先</option>
                    <option value={2}>次级</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div id="section-shortcut-translate" ref={(el) => { sectionRefs.current["section-shortcut-translate"] = el; }}>
            <h3 className="font-semibold text-base mb-3">翻译快捷键</h3>
            <div className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm text-muted-foreground">选中文本后触发翻译</div>
              </div>
              <ShortcutRecorder
                value={shortcuts.translate}
                onChange={(value) => {
                  const updated = { ...shortcuts, translate: value };
                  setShortcuts(updated);
                  invoke("update_shortcuts_cmd", { config: updated });
                }}
                disabled={!shortcutsLoaded}
              />
            </div>
          </div>

          <div id="section-shortcut-show-main" ref={(el) => { sectionRefs.current["section-shortcut-show-main"] = el; }}>
            <h3 className="font-semibold text-base mb-3">显示主窗口</h3>
            <div className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm text-muted-foreground">快速唤起主窗口</div>
              </div>
              <ShortcutRecorder
                value={shortcuts.show_main}
                onChange={(value) => {
                  const updated = { ...shortcuts, show_main: value };
                  setShortcuts(updated);
                  invoke("update_shortcuts_cmd", { config: updated });
                }}
                disabled={!shortcutsLoaded}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-t">
        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium"
        >
          保存设置
        </button>
      </div>
    </div>
  );
}

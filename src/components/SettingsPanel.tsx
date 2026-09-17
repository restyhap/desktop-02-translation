import { useState, useEffect, useRef, useCallback } from "react";
import { getSettings, saveSettings } from "@/storage";
import { DEFAULT_SETTINGS, type AppSettings } from "@/types/settings";
import { GeneralSection } from "./settings/GeneralSection";
import { TranslationSection } from "./settings/TranslationSection";
import { AppearanceSection } from "./settings/AppearanceSection";
import { DictionarySection } from "./settings/DictionarySection";
import { ShortcutSection } from "./settings/ShortcutSection";

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
      { id: "api-keys", label: "API Key", sectionId: "section-api-keys" },
      { id: "auto-detect", label: "自动检测", sectionId: "section-auto-detect" },
    ],
  },
  {
    title: "外观",
    items: [
      { id: "theme", label: "主题", sectionId: "section-theme" },
      { id: "font-size", label: "字体大小", sectionId: "section-font-size" },
      { id: "opacity", label: "不透明度", sectionId: "section-opacity" },
      { id: "hide-delay", label: "自动隐藏延迟", sectionId: "section-hide-delay" },
    ],
  },
  {
    title: "词典",
    items: [
      { id: "dict-paths", label: "词典目录", sectionId: "section-dict-paths" },
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
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeNavId, setActiveNavId] = useState<string>("launch");
  const [loadError, setLoadError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const registerRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    sectionRefs.current[id] = el;
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await getSettings<any>();
        let loadedSettings: AppSettings = { ...DEFAULT_SETTINGS };

        if (result && typeof result === "object") {
          const r = result as any;
          if (r.general) loadedSettings.general = { ...DEFAULT_SETTINGS.general, ...r.general };
          if (r.translation) loadedSettings.translation = { ...DEFAULT_SETTINGS.translation, ...r.translation };
          if (r.appearance) loadedSettings.appearance = { ...DEFAULT_SETTINGS.appearance, ...r.appearance };
          if (r.shortcuts) {
            const sc = r.shortcuts;
            loadedSettings.shortcuts = { ...DEFAULT_SETTINGS.shortcuts, translate: sc.translate, show_main: sc.showMain || (sc as unknown as Record<string, string>).showMain };
          }
          if (r.llm) loadedSettings.llm = { ...DEFAULT_SETTINGS.llm, ...r.llm };
        }

        setSettings(loadedSettings);
        setLoadError(null);
      } catch (error) {
        console.error("[Settings] 加载设置失败:", error);
        setLoadError(error instanceof Error ? error.message : "加载失败");
        setSettings(DEFAULT_SETTINGS);
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const content = contentRef.current;
      if (!content) return;

      let closestId = navGroups[0].items[0].sectionId;
      let closestDistance = Infinity;

      navGroups.forEach((group) => {
        group.items.forEach((item) => {
          const el = sectionRefs.current[item.sectionId];
          if (el) {
            const rect = el.getBoundingClientRect();
            const distance = Math.abs(rect.top - content.getBoundingClientRect().top);
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

  const scrollToSection = useCallback((sectionId: string) => {
    const el = sectionRefs.current[sectionId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const updateSetting = (section: keyof AppSettings, key: string, value: any) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        [section]: { ...prev[section], [key]: value },
      };
      // 单项即保存
      saveSettings(updated).catch(() => {});
      return updated;
    });
  };

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-muted-foreground mb-2">加载中...</div>
          {loadError && <div className="text-xs text-red-500 mt-2">{loadError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border overflow-hidden">
      {/* 标题栏 - 固定高度 56px */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <h2 className="text-lg font-semibold">设置</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
        >
          ×
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧导航 - 固定宽度 224px */}
        <div className="w-56 border-r flex flex-col py-4 overflow-y-auto shrink-0 bg-muted/20">
          {navGroups.map((group, groupIndex) => (
            <div key={group.title} className="mb-2">
              {groupIndex > 0 && <div className="border-t border-border/50 mx-3 my-3" />}
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {group.title}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveNavId(item.id);
                    scrollToSection(item.sectionId);
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                    activeNavId === item.id
                      ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* 右侧内容区 */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-8 flex justify-center">
          <div className="w-full max-w-xl">
            <GeneralSection
              general={settings.general}
              onChange={(key, value) => updateSetting("general", key, value)}
              registerRef={registerRef}
            />
            <TranslationSection
              translation={settings.translation}
              settings={settings}
              onChange={(key, value) => updateSetting("translation", key, value)}
              onUpdateSettings={setSettings}
              registerRef={registerRef}
            />
            <AppearanceSection
              appearance={settings.appearance}
              onChange={(key, value) => updateSetting("appearance", key, value)}
              registerRef={registerRef}
            />
            <DictionarySection registerRef={registerRef} />
            <ShortcutSection registerRef={registerRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
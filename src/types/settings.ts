import type { Language, TranslationEngine } from "./translation";

export interface AppSettings {
  general: GeneralSettings;
  translation: TranslationSettings;
  llm: LlmSettings;
  appearance: AppearanceSettings;
  shortcuts: ShortcutSettings;
  /** 词典页 chips 显示顺序（id 列表；后端 settings_store 为 JSON 透传，可选字段） */
  dictOrder?: number[];
}

export interface LlmSettings {
  endpoint: string;
  apiKey: string;
}

export interface GeneralSettings {
  launchAtStartup: boolean;
  closeBehavior: "minimizeToTray" | "exit";
  checkUpdates: boolean;
  language: "zh" | "en";
}

export interface TranslationSettings {
  defaultSourceLang: Language;
  defaultTargetLang: Language;
  defaultEngine: TranslationEngine;
  autoDetect: boolean;
  pasteToTranslate: boolean;
}

export interface AppearanceSettings {
  theme: "light" | "dark" | "system";
  fontSize: "small" | "medium" | "large";
  opacity: number;
  hideDelay: number;
}

export interface ShortcutSettings {
  translate: string;
  show_main: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    launchAtStartup: false,
    closeBehavior: "minimizeToTray",
    checkUpdates: true,
    language: "zh",
  },
  translation: {
    defaultSourceLang: "en",
    defaultTargetLang: "zh",
    defaultEngine: "google",
    autoDetect: true,
    pasteToTranslate: false,
  },
  appearance: {
    theme: "system",
    fontSize: "medium",
    opacity: 100,
    hideDelay: 5,
  },
  shortcuts: {
    translate: "⌘+C+C",
    show_main: "⌘+C+V",
  },
  llm: {
    endpoint: "",
    apiKey: "",
  },
};
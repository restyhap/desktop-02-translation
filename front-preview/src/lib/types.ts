/** 语言代码 — 与 src/types/translation.ts 对齐 */
export type Language = "zh" | "en" | "ja" | "ko" | "fr" | "de" | "es" | "ru";

/** 翻译引擎：api_keys 表驱动，允许自定义名称 */
export type TranslationEngine = string;

export interface ApiKeyOption {
  service_name: string;
  display_name: string;
  url: string;
  requires_app_id: boolean;
  requires_api_key: boolean;
}

/** 数据库查询结果：translation_history 表记录 */
export interface TranslationRecord {
  id: string;
  source_text: string;
  translated_text: string;
  source_lang: string;
  target_lang: string;
  engine: string;
  timestamp: number;
  favorite: number;
}

/** UI 形态的翻译结果 */
export interface TranslationResult {
  id: string;
  sourceText: string;
  translatedText: string;
  sourceLang: Language;
  targetLang: Language;
  engine: TranslationEngine;
  timestamp: number;
  favorite: boolean;
}

export interface LanguageOption {
  code: Language;
  name: string;
  nativeName: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "zh", name: "中文", nativeName: "中文" },
  { code: "en", name: "English", nativeName: "English" },
  { code: "ja", name: "日本語", nativeName: "日本語" },
  { code: "ko", name: "한국어", nativeName: "한국어" },
  { code: "fr", name: "Français", nativeName: "Français" },
  { code: "de", name: "Deutsch", nativeName: "Deutsch" },
  { code: "es", name: "Español", nativeName: "Español" },
  { code: "ru", name: "Русский", nativeName: "Русский" },
];

/* ==================== 生词本 ==================== */

export interface VocabularyGroup {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface VocabularyWord {
  id: string;
  word: string;
  translation: string;
  phonetic?: string;
  example?: string;
  groupId: string;
  createdAt: number;
  reviewCount: number;
  lastReviewedAt?: number;
}

/* ==================== 词典 ==================== */

export interface DictInfo {
  id: number;
  name: string;
  entry_count: number;
}

export interface DictEntry {
  word: string;
  word_raw: string;
  definition: string;
  audio_ref?: string | null;
}

export interface DictLine {
  type: "pos" | "group" | "sense" | "subsense" | "example" | "meta" | "text";
  label?: string;
  html: string;
}

/* ==================== 设置 ==================== */

export interface AppSettings {
  general: {
    launchAtStartup: boolean;
    closeBehavior: "minimizeToTray" | "exit";
    checkUpdates: boolean;
    language: "zh" | "en";
  };
  translation: {
    defaultSourceLang: Language;
    defaultTargetLang: Language;
    defaultEngine: TranslationEngine;
    autoDetect: boolean;
    pasteToTranslate: boolean;
  };
  appearance: {
    theme: "light" | "dark" | "system";
    fontSize: "small" | "medium" | "large";
    opacity: number;
    hideDelay: number;
  };
  shortcuts: {
    translate: string;
    show_main: string;
  };
  llm: {
    endpoint: string;
    apiKey: string;
  };
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

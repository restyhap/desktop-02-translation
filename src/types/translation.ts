export type Language = "zh" | "en" | "ja" | "ko" | "fr" | "de" | "es" | "ru";

/**
 * 翻译引擎标识：自定义字符串，由 api_keys 表驱动
 * 用户可在设置中自定义添加翻译机制（如 baidu / caiyun / 自定义名称）
 */
export type TranslationEngine = string;

export interface EngineInfo {
  service_name: string;
  display_name: string;
  url: string;
  requires_app_id: boolean;
  requires_api_key: boolean;
}

/** api_keys 表记录（与 Rust 端 ApiKeyRecord 对齐） */
export interface ApiKeyRecord {
  service_name: string;
  display_name: string;
  app_id?: string | null;
  api_key: string;
  sort: number;
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

export interface TranslationRequest {
  text: string;
  sourceLang: Language;
  targetLang: Language;
  engine: TranslationEngine;
}

export interface TranslationHistory {
  items: TranslationResult[];
  total: number;
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
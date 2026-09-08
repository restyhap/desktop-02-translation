export type Language = "zh" | "en" | "ja" | "ko" | "fr" | "de" | "es" | "ru";

export type TranslationEngine = "google" | "deepl" | "baidu" | "youdao";

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

export const ENGINE_OPTIONS: { value: TranslationEngine; label: string }[] = [
  { value: "google", label: "Google 翻译" },
  { value: "deepl", label: "DeepL" },
  { value: "baidu", label: "百度翻译" },
  { value: "youdao", label: "有道翻译" },
];

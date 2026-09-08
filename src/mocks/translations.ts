import type { TranslationResult, Language, TranslationEngine } from "@/types/translation";

const now = Date.now();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const mockTranslations: TranslationResult[] = [
  {
    id: "1",
    sourceText: "Hello, world!",
    translatedText: "你好，世界！",
    sourceLang: "en",
    targetLang: "zh",
    engine: "google",
    timestamp: now - 5 * MINUTE,
    favorite: true,
  },
  {
    id: "2",
    sourceText: "The quick brown fox jumps over the lazy dog.",
    translatedText: "敏捷的棕色狐狸跳过了懒狗。",
    sourceLang: "en",
    targetLang: "zh",
    engine: "google",
    timestamp: now - 30 * MINUTE,
    favorite: false,
  },
  {
    id: "3",
    sourceText: "こんにちは",
    translatedText: "Hello",
    sourceLang: "ja",
    targetLang: "en",
    engine: "deepl",
    timestamp: now - 2 * HOUR,
    favorite: false,
  },
  {
    id: "4",
    sourceText: "Bonjour, comment allez-vous aujourd'hui?",
    translatedText: "你好，你今天怎么样？",
    sourceLang: "fr",
    targetLang: "zh",
    engine: "google",
    timestamp: now - 1 * DAY,
    favorite: true,
  },
  {
    id: "5",
    sourceText: "Die Sonne scheint heute sehr hell.",
    translatedText: "今天太阳非常明亮。",
    sourceLang: "de",
    targetLang: "zh",
    engine: "baidu",
    timestamp: now - 2 * DAY,
    favorite: false,
  },
  {
    id: "6",
    sourceText: "El arte de la programación es el arte de organizar la complejidad.",
    translatedText: "编程的艺术是组织复杂性的艺术。",
    sourceLang: "es",
    targetLang: "zh",
    engine: "google",
    timestamp: now - 3 * DAY,
    favorite: false,
  },
  {
    id: "7",
    sourceText: "Москва — столица России.",
    translatedText: "莫斯科是俄罗斯的首都。",
    sourceLang: "ru",
    targetLang: "zh",
    engine: "youdao",
    timestamp: now - 4 * DAY,
    favorite: false,
  },
  {
    id: "8",
    sourceText: "Steam Deck 是 Valve 推出的便携式游戏电脑。",
    translatedText: "Steam Deck is a portable gaming computer launched by Valve.",
    sourceLang: "zh",
    targetLang: "en",
    engine: "deepl",
    timestamp: now - 5 * DAY,
    favorite: true,
  },
];

export function generateMockTranslation(
  sourceText: string,
  sourceLang: Language = "en",
  targetLang: Language = "zh",
  engine: TranslationEngine = "google"
): TranslationResult {
  return {
    id: crypto.randomUUID(),
    sourceText,
    translatedText: `[翻译] ${sourceText}`,
    sourceLang,
    targetLang,
    engine,
    timestamp: Date.now(),
    favorite: false,
  };
}

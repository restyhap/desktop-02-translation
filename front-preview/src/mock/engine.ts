/**
 * Mock 翻译引擎
 *
 * 假联想 + 假翻译，输出即时；接口形状与 src 的 translateAndSave / dictSuggest 一致。
 * filePath 约定: components 只 import 此文件的函数，不得直接 import mock 数据。
 */
import type { Language, TranslationResult } from "@/lib/types";
import { tr } from "@/lib/i18n";

const SUGGEST_POOL = [
  "serendipity", "ephemeral", "luminous", "avant-garde", " resonant",
  "solitude", "eloquent", "petrichor", "wanderlust", "halcyon",
  "effervescent", "ethereal", "idyllic", "mellifluous", "quintessence",
];

const FAKE_TRANSLATIONS: Record<string, string> = {
  "The mountains are calling and I must go.":
    "群山在呼唤，我必须启程。",
  "Time you enjoy wasting is not wasted time.":
    "你认为浪费的时光，其实并不浪费。",
  hello: "你好",
};

/** 延迟工具: 让 loading 态可见 */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 与 src/storage/dict.ts 的 dictSuggest 签名一致 */
export async function dictSuggest(text: string): Promise<{ words: string[] }> {
  await sleep(120);
  const q = text.trim().toLowerCase();
  if (!q) return { words: [] };
  const words = SUGGEST_POOL.map((w) => w.trim())
    .filter((w) => w.toLowerCase().includes(q))
    .slice(0, 8);
  return { words };
}

/**
 * 与 src/storage/translation.ts 的 translateAndSave 签名一致
 * (预览版不落历史，调用方自行把结果 addHistory)
 */
export async function mockTranslate(
  text: string,
  sourceLang: Language,
  targetLang: Language,
  engine: string
): Promise<TranslationResult> {
  await sleep(480 + Math.random() * 360); // 模拟网络
  const known = FAKE_TRANSLATIONS[text.trim()];
  // mock 样态也走词典（mock.previewTag），跟随界面语言切换
  const translated =
    known != null
      ? known
      : tr("mock.previewTag", {
          engine,
          from: sourceLang,
          to: targetLang,
          text: text.trim().slice(0, 60),
        });
  return {
    id: crypto.randomUUID(),
    sourceText: text,
    translatedText: translated,
    sourceLang,
    targetLang,
    engine,
    timestamp: Date.now(),
    favorite: false,
  };
}

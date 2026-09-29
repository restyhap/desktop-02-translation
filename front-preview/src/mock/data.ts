/**
 * Mock 数据源 — 与 src/storage/index.ts 的 **查询签名** 对齐
 *
 * 移植时：把本文件 import 替换为 @/storage 即可，组件零改动。
 * 数据形状对齐 Rust 端 Record (snake_case 字段)。
 */
import type {
  DictEntry,
  DictInfo,
  TranslationRecord,
  VocabularyGroup,
  VocabularyWord,
} from "@/lib/types";
import { parseDefinition } from "@/lib/parseDefinition";

// ==================== 翻译历史 ====================

const now = Date.now();
const H = (h: number) => now - h * 3600_000;

const HISTORY_RECORDS: TranslationRecord[] = [
  {
    id: "h1",
    source_text: "The mountains are calling and I must go.",
    translated_text: "群山在呼唤，我必须启程。",
    source_lang: "en",
    target_lang: "zh",
    engine: "openai",
    timestamp: H(2),
    favorite: 1,
  },
  {
    id: "h2",
    source_text: "Time you enjoy wasting is not wasted time.",
    translated_text: "你认为浪费的时光，其实并不浪费。",
    source_lang: "en",
    target_lang: "zh",
    engine: "baidu",
    timestamp: H(5),
    favorite: 1,
  },
  {
    id: "h3",
    source_text: "Advanced usage examples",
    translated_text: "高级用法示例",
    source_lang: "en",
    target_lang: "zh",
    engine: "google",
    timestamp: H(26),
    favorite: 0,
  },
  {
    id: "h4",
    source_text: "Le chat noir dort sur le toit.",
    translated_text: "黑猫睡在屋顶上。",
    source_lang: "fr",
    target_lang: "zh",
    engine: "openai",
    timestamp: H(27),
    favorite: 0,
  },
  {
    id: "h5",
    source_text: "人生の目的は自分で見つけるものだ。",
    translated_text: "人生的目的需要自己去寻找。",
    source_lang: "ja",
    target_lang: "zh",
    engine: "caiyun",
    timestamp: H(49),
    favorite: 0,
  },
  {
    id: "h6",
    source_text: " estate planning for small businesses",
    translated_text: "小型企业遗产规划",
    source_lang: "en",
    target_lang: "zh",
    engine: "google",
    timestamp: H(50),
    favorite: 0,
  },
];

export function getTranslations(): TranslationRecord[] {
  return [...HISTORY_RECORDS];
}

// ==================== 生词本 ====================

export function getVocabularyGroups(): VocabularyGroup[] {
  return [
    { id: "g1", name: "书桌" , color: "#2b5cdb", createdAt: now - 8 * 86400_000 },
    { id: "g2", name: "GRE", color: "#cd4d3f", createdAt: now - 20 * 86400_000 },
    { id: "g3", name: "日常", color: "#2e8a4c", createdAt: now - 40 * 86400_000 },
  ];
}

export function getVocabularyWords(): VocabularyWord[] {
  return [
    { id: "w1", word: "serendipity", translation: "意外发现珍宝的运气；机缘巧合", phonetic: "/ˌserənˈdɪpəti/", example: "Finding this café was pure serendipity.", groupId: "g1", createdAt: H(3), reviewCount: 4, lastReviewedAt: H(1) },
    { id: "w2", word: "ephemeral", translation: "短暂的，朝生暮死的", phonetic: "/ɪˈfem.ər.əl/", example: "Fame is ephemeral.", groupId: "g1", createdAt: H(30), reviewCount: 7, lastReviewedAt: H(20) },
    { id: "w3", word: "wanderlust", translation: "漫游欲；旅行癖", phonetic: "/ˈwɒn.də.lʌst/", example: "A wanderlust that took her to 40 countries.", groupId: "g2", createdAt: H(72), reviewCount: 2, lastReviewedAt: H(30) },
    { id: "w4", word: "halcyon", translation: "太平的；美好的（常指往昔）", phonetic: "/ˈhæl.si.ən/", example: "the halcyon days of youth", groupId: "g2", createdAt: H(100), reviewCount: 5, lastReviewedAt: H(10) },
    { id: "w5", word: "petrichor", translation: "雨后泥土的芬芳", phonetic: "/ˈpet.rɪ.kɔːr/", example: "Petrichor rose from the warm asphalt.", groupId: "g3", createdAt: H(120), reviewCount: 1, lastReviewedAt: H(48) },
    { id: "w6", word: "mellifluous", translation: "声音甜美流畅的", phonetic: "/meˈlɪf.lu.əs/", example: "a mellifluous voice", groupId: "g3", createdAt: H(150), reviewCount: 3, lastReviewedAt: H(60) },
  ];
}

/** 与 src/storage/dict.ts 的 listDicts 返回子集签名一致 */
export function listDicts(): { dictionaries: DictInfo[] } {
  return {
    dictionaries: [
      { id: 1, name: "MW11", entry_count: 214_962 },
      { id: 2, name: "OALD8", entry_count: 108_224 },
    ],
  };
}

// ==================== 词典词条 ====================

const ENTRY_SERENDIPITY = [
  "ser·en·dip·i·ty /ˌserənˈdɪpəti/ <i>noun</i>",
  "<b>[uncountable]</b>",
  "<b>1.</b> the fact of finding valuable things by accident",
  "• <i>Finding this café was pure serendipity.</i>",
  "<b>2.</b> the occurrence of events by chance in a happy way",
  "<b>DERIVATIVES:</b> <i>serendipitous ~ adj.</i>",
].join("<br>");

const ENTRY_MOUNTAIN = [
  "<b><i>noun</i></b>",
  "<b>1.</b> a very high hill",
  "• <i>the highest mountain in the world</i>",
  "<b>2.</b> (mountains) a very large amount or number",
  "• <i>We face mountains of paperwork.</i>",
].join("<br>");

/** 与 src/storage/dict.ts 的 dictGet 签名一致 */
export function dictGet(word: string): DictEntry | null {
  const w = word.trim().toLowerCase();
  if (w === "serendipity") {
    return {
      word: "serendipity",
      word_raw: "serendipity",
      definition: ENTRY_SERENDIPITY,
      audio_ref: null,
    };
  }
  if (w === "mountain" || w === "mountains") {
    return { word: "mountain", word_raw: "mountain", definition: ENTRY_MOUNTAIN, audio_ref: null };
  }
  return null;
}

/** 词条释义解析后行 (供 DictEntryView 渲染) */
export function parsedLines(html: string) {
  return parseDefinition(html);
}

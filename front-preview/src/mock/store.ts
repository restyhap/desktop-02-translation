/**
 * Mock 可控内存数据库 — 与 src/storage/index.ts 的全部命令签名对齐
 *
 * 移植时：把组件里的 `@/mock/store` 替换为 `@/storage` 即可，组件零改动。
 * 数据形状为 snake_case（Rust 端风格），与真实 invoke 返回一致。
 */
import type {
  AppSettings,
  ApiKeyOption,
  DictEntry,
  DictInfo,
  Language,
  TranslationRecord,
  VocabularyGroup,
  VocabularyWord,
} from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { parseDefinition } from "@/lib/parseDefinition";

/** 可变深拷贝工具 */
const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ==================== 数据库初始化 ====================

/** get_db_status_cmd / init_database_cmd 的 mock：恒定可用 */
export async function getDbStatus(): Promise<"ok" | "missing"> {
  await sleep(60);
  return "ok";
}
export async function initDatabase(): Promise<void> {
  await sleep(120);
}

// ==================== 翻译历史 ====================

const now = Date.now();
const H = (h: number) => now - h * 3600_000;

interface Db {
  history: TranslationRecord[];
  groups: VocabularyGroup[];
  words: VocabularyWord[];
  dicts: (DictInfo & { built: boolean })[];
  apiKeys: { service: string; display_name: string }[];
  settings: AppSettings;
  dictPaths: string[];
}

const db: Db = {
  history: [
    { id: "h1", source_text: "The mountains are calling and I must go.", translated_text: "群山在呼唤，我必须启程。", source_lang: "en", target_lang: "zh", engine: "openai", timestamp: H(2), favorite: 1 },
    { id: "h2", source_text: "Time you enjoy wasting is not wasted time.", translated_text: "你认为浪费的时光，其实并不浪费。", source_lang: "en", target_lang: "zh", engine: "baidu", timestamp: H(5), favorite: 1 },
    { id: "h3", source_text: "Advanced usage examples", translated_text: "高级用法示例", source_lang: "en", target_lang: "zh", engine: "google", timestamp: H(26), favorite: 0 },
    { id: "h4", source_text: "Le chat noir dort sur le toit.", translated_text: "黑猫睡在屋顶上。", source_lang: "fr", target_lang: "zh", engine: "openai", timestamp: H(27), favorite: 0 },
    { id: "h5", source_text: "人生の目的は自分で見つけるものだ。", translated_text: "人生的目的需要自己去寻找。", source_lang: "ja", target_lang: "zh", engine: "caiyun", timestamp: H(49), favorite: 0 },
    { id: "h6", source_text: "estate planning for small businesses", translated_text: "小型企业遗产规划", source_lang: "en", target_lang: "zh", engine: "google", timestamp: H(50), favorite: 0 },
  ],
  groups: [
    { id: "g1", name: "书桌", color: "#2b5cdb", createdAt: now - 8 * 86400_000 },
    { id: "g2", name: "GRE", color: "#cd4d3f", createdAt: now - 20 * 86400_000 },
    { id: "g3", name: "日常", color: "#2e8a4c", createdAt: now - 40 * 86400_000 },
  ],
  words: [
    { id: "w1", word: "serendipity", translation: "意外发现珍宝的运气；机缘巧合", phonetic: "/ˌserənˈdɪpəti/", example: "Finding this café was pure serendipity.", groupId: "g1", createdAt: H(3), reviewCount: 4, lastReviewedAt: H(1) },
    { id: "w2", word: "ephemeral", translation: "短暂的，朝生暮死的", phonetic: "/ɪˈfem.ər.əl/", example: "Fame is ephemeral.", groupId: "g1", createdAt: H(30), reviewCount: 7, lastReviewedAt: H(20) },
    { id: "w3", word: "wanderlust", translation: "漫游欲；旅行癖", phonetic: "/ˈwɒn.də.lʌst/", example: "A wanderlust that took her to 40 countries.", groupId: "g2", createdAt: H(72), reviewCount: 2, lastReviewedAt: H(30) },
    { id: "w4", word: "halcyon", translation: "太平的；美好的（常指往昔）", phonetic: "/ˈhæl.si.ən/", example: "the halcyon days of youth", groupId: "g2", createdAt: H(100), reviewCount: 5, lastReviewedAt: H(10) },
    { id: "w5", word: "petrichor", translation: "雨后泥土的芬芳", phonetic: "/ˈpet.rɪ.kɔːr/", example: "Petrichor rose from the warm asphalt.", groupId: "g3", createdAt: H(120), reviewCount: 1, lastReviewedAt: H(48) },
    { id: "w6", word: "mellifluous", translation: "声音甜美流畅的", phonetic: "/meˈlɪf.lu.əs/", example: "a mellifluous voice", groupId: "g3", createdAt: H(150), reviewCount: 3, lastReviewedAt: H(60) },
  ],
  dicts: [
    { id: 1, name: "MW11", entry_count: 214_962, built: true },
    { id: 2, name: "OALD8", entry_count: 108_224, built: true },
    { id: 3, name: " Collins Thesaurus", entry_count: 0, built: false },
  ],
  apiKeys: [
    { service: "openai", display_name: "OpenAI" },
    { service: "baidu", display_name: "百度翻译" },
    { service: "caiyun", display_name: "彩云小译" },
  ],
  settings: deepClone(DEFAULT_SETTINGS),
  dictPaths: ["/Users/resty/Library/GoldenDict/dsl"],
};

let nextHistory = 1;
void nextHistory;
// 组/词 id 已改用时间戳生成（见 addVocabularyGroup/addVocabularyWord）

/** get_translations_cmd */
export function getTranslations(): TranslationRecord[] {
  return [...db.history].sort((a, b) => b.timestamp - a.timestamp);
}
/** translate_history_cmd（translateAndSave 落历史） */
export function saveTranslation(rec: TranslationRecord): void {
  db.history.unshift(rec);
}
/** toggle_favorite_cmd — 返回新状态 */
export function toggleFavorite(id: string): 0 | 1 {
  const rec = db.history.find((r) => r.id === id);
  if (!rec) return 0;
  rec.favorite = rec.favorite === 1 ? 0 : 1;
  return rec.favorite as 0 | 1;
}
/** delete_translation_cmd */
export function deleteTranslation(id: string): void {
  db.history = db.history.filter((r) => r.id !== id);
}

// ==================== 生词本 ====================

/** get_vocabulary_groups_cmd */
export function getVocabularyGroups(): VocabularyGroup[] {
  return [...db.groups];
}
/** get_vocabulary_words_cmd */
export function getVocabularyWords(): VocabularyWord[] {
  return [...db.words];
}
/** add_vocabulary_group_cmd（id 用时间戳保证唯一，避免与预置组撞 key） */
export function addVocabularyGroup(name: string, color: string): VocabularyGroup {
  const g: VocabularyGroup = {
    id: `g-${Date.now().toString(36)}`,
    name,
    color,
    createdAt: Date.now(),
  };
  db.groups.push(g);
  return g;
}
/** delete_vocabulary_group_cmd — 同时删除组内词条 */
export function deleteVocabularyGroup(id: string): void {
  db.groups = db.groups.filter((g) => g.id !== id);
  db.words = db.words.filter((w) => w.groupId !== id);
}
/** add_vocabulary_word_cmd */
export function addVocabularyWord(input: {
  word: string;
  translation: string;
  group_id: string;
  phonetic?: string;
  example?: string;
}): VocabularyWord {
  const w: VocabularyWord = {
    id: `w-${Date.now().toString(36)}`,
    word: input.word,
    translation: input.translation,
    phonetic: input.phonetic,
    example: input.example,
    groupId: input.group_id,
    createdAt: Date.now(),
    reviewCount: 0,
  };
  db.words.push(w);
  return w;
}
/** delete_vocabulary_word_cmd */
export function deleteVocabularyWord(id: string): void {
  db.words = db.words.filter((w) => w.id !== id);
}

// ==================== 翻译服务（API Key / 引擎） ====================

export interface ApiKeyItem {
  service: string;
  display_name: string;
  app_id: string | null;
  key_tail: string;
}

const API_KEYS: ApiKeyItem[] = [
  { service: "openai", display_name: "OpenAI", app_id: null, key_tail: "3f2a" },
  { service: "baidu", display_name: "百度翻译", app_id: "20240101", key_tail: "b7c9" },
  { service: "caiyun", display_name: "彩云小译", app_id: null, key_tail: "91aa" },
];

/** 内置 7 引擎（对齐 src ApiKeySection 的 BOOTSTRAP_ENGINES） */
export const BOOTSTRAP_ENGINES: Array<
  ApiKeyOption & { service_name: string }
> = [
  { service_name: "google", display_name: "Google 翻译", url: "https://translate.googleapis.com", requires_app_id: false, requires_api_key: false },
  { service_name: "deepl", display_name: "DeepL", url: "https://api-free.deepl.com", requires_app_id: false, requires_api_key: true },
  { service_name: "baidu", display_name: "百度翻译", url: "https://fanyi-api.baidu.com", requires_app_id: true, requires_api_key: true },
  { service_name: "youdao", display_name: "有道翻译", url: "https://openapi.youdao.com", requires_app_id: true, requires_api_key: true },
  { service_name: "caiyun", display_name: "彩云小译", url: "https://api.interpreter.caiyunai.com", requires_app_id: false, requires_api_key: true },
  { service_name: "ali", display_name: "阿里翻译", url: "https://mt.aliyuncs.com", requires_app_id: true, requires_api_key: true },
  { service_name: "volcano", display_name: "火山翻译", url: "https://translate.volcengineapi.com", requires_app_id: true, requires_api_key: true },
];

/** list_api_keys_cmd */
export function listApiKeys(): ApiKeyItem[] {
  return [...API_KEYS];
}
/** add_api_key_cmd（+ add_engine_cmd） */
export function addApiKey(input: {
  service: string;
  display_name: string;
  app_id?: string;
  key: string;
}): void {
  API_KEYS.push({
    service: input.service,
    display_name: input.display_name,
    app_id: input.app_id ?? null,
    key_tail: input.key.slice(-4),
  });
}
/** delete_api_key_cmd（+ delete_engine_cmd） */
export function deleteApiKey(service: string): void {
  const i = API_KEYS.findIndex((k) => k.service === service);
  if (i >= 0) API_KEYS.splice(i, 1);
}
/** reorder_api_keys_cmd — 前端传完整有序数组 */
export function reorderApiKeys(orderedServices: string[]): void {
  API_KEYS.sort(
    (a, b) =>
      orderedServices.indexOf(a.service) - orderedServices.indexOf(b.service),
  );
}
/** get_engines_cmd */
export function getEngines(): ApiKeyOption[] {
  return BOOTSTRAP_ENGINES;
}

// ==================== 词典 ====================

const ENTRY_DB: Record<string, { def: string; dictIds: number[] }> = {
  serendipity: {
    dictIds: [1, 2],
    def: [
      "ser·en·dip·i·ty /ˌserənˈdɪpəti/ <i>noun</i>",
      "<b>[uncountable]</b>",
      "<b>1.</b> the fact of finding valuable things by accident",
      "• <i>Finding this café was pure serendipity.</i>",
      "<b>2.</b> the occurrence of events by chance in a happy way",
      "<b>DERIVATIVES:</b> <i>serendipitous ~ adj.</i>",
    ].join("<br>"),
  },
  mountain: {
    dictIds: [1, 2],
    def: [
      "<b><i>noun</i></b>",
      "<b>1.</b> a very high hill",
      "• <i>the highest mountain in the world</i>",
      "<b>2.</b> (mountains) a very large amount or number",
      "• <i>We face mountains of paperwork.</i>",
    ].join("<br>"),
  },
  ephemeral: {
    dictIds: [2],
    def: [
      "<b><i>adjective</i></b> <i>(formal)</i>",
      "lasting for only a short time",
      "• <i>ephemeral pleasures</i>",
      "<b>DERIVATIVES:</b> <i>ephemerally ~ adv. / ephemerality ~ n.</i>",
    ].join("<br>"),
  },
  wanderlust: {
    dictIds: [1, 2],
    def: [
      "<b><i>noun</i></b> <b>[uncountable]</b> <i>(usually humorous)</i>",
      "a strong desire to travel",
      "• <i>a wanderlust that took her to 40 countries</i>",
    ].join("<br>"),
  },
};

/** dict_has_db_cmd */
export function dictHasDb(): boolean {
  return true;
}
/** dict_list_cmd */
export function listDicts(): { dictionaries: DictInfo[] } {
  return {
    dictionaries: db.dicts.map(({ built, ...rest }) => {
      void built;
      return rest;
    }),
  };
}
/** dict_lookup_cmd {word, dictionaryId} — 单本词典查询 */
export function dictLookup(word: string, dictionaryId: number): DictEntry | null {
  const e = ENTRY_DB[word.trim().toLowerCase()];
  if (!e || !e.dictIds.includes(dictionaryId)) return null;
  const d = db.dicts.find((x) => x.id === dictionaryId);
  return {
    word: word.trim().toLowerCase(),
    word_raw: word.trim(),
    definition: e.def,
    audio_ref: null,
    dictionary_name: d?.name,
  } as DictEntry & { dictionary_name?: string };
}
/** dict_suggest_cmd {query, dictionaryId} */
export async function dictSuggest(query: string): Promise<{ words: string[] }> {
  await sleep(100);
  const q = query.trim().toLowerCase();
  if (!q) return { words: [] };
  const pool = new Set([
    ...Object.keys(ENTRY_DB),
    "luminous", "solitude", "eloquent", "effervescent", "ethereal",
    "idyllic", "quintessence", "resonant", "avant-garde", "halcyon",
    "petrichor", "mellifluous", "ephemeral", "wanderlust", "serendipity",
  ]);
  return {
    words: [...pool].filter((w) => w.includes(q)).sort().slice(0, 8),
  };
}

/** dict_build_cmd — 模拟构建进度（回调逐阶段推进） */
export function dictBuild(
  dictionaryId: number,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const d = db.dicts.find((x) => x.id === dictionaryId);
  return (async () => {
    for (let pct = 0; pct <= 100; pct += 10) {
      await sleep(140);
      onProgress?.(pct);
    }
    if (d) {
      d.built = true;
      d.entry_count = d.entry_count || 46_000;
    }
  })();
}

/** dict_load_resource_cmd {word} — 资源清单懒加载 */
export interface DictResource {
  kind: "audio" | "image";
  label: string;
  zipFile: string;
  filename: string;
}
export async function dictLoadResource(word: string): Promise<DictResource[]> {
  await sleep(320);
  const w = word.trim().toLowerCase();
  const res: DictResource[] = [];
  if (ENTRY_DB[w]?.dictIds.includes(1)) {
    res.push({ kind: "audio", label: "美音", zipFile: "mw-audio.zip", filename: `${w}.mp3` });
  }
  if (ENTRY_DB[w]?.dictIds.includes(2)) {
    res.push({ kind: "image", label: "插图", zipFile: "oald-img.zip", filename: `${w}.png` });
  }
  return res;
}
/** dict_get_resource_cmd {zipFile, filename} — 返回 base64 data URL */
export async function dictGetResource(res: DictResource): Promise<string | null> {
  await sleep(260);
  if (res.kind === "image") {
    // 1x1 蓝色占位 PNG
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJgYEBAA+CAQHmP8FxAAAAAElFTkSuQmCC";
  }
  return null; // 音频 ресур mock 无真实数据，返回 null 时 UI 提示不可播
}

// ==================== 词典目录（设置·词典分节） ====================

/** get_dict_paths_cmd */
export function getDictPaths(): string[] {
  return [...db.dictPaths];
}
/** save_dict_paths_cmd */
export function saveDictPaths(paths: string[]): void {
  db.dictPaths = [...paths];
}

// ==================== 设置 ====================

/** get_all_settings_cmd（逐节与 DEFAULT_SETTINGS 深合并） */
export function getSettings(): AppSettings {
  return deepClone(db.settings);
}
/** save_all_settings_cmd */
export function saveAllSettings(settings: AppSettings): void {
  db.settings = deepClone(settings);
}

// ==================== 通用 ====================

/** check_update — mock：已是最新版本 */
export function checkUpdate(): Promise<string> {
  return sleep(900).then(() => "");
}

// ==================== 词条解析包装 ====================

export function parsedLines(html: string) {
  return parseDefinition(html);
}

/** 语言自动检测（mock autoDetect） */
export function detectLanguage(text: string): Language {
  const t = text.trim();
  if (!t) return "en";
  if (/[\u3040-\u30ff]/.test(t)) return "ja";
  if (/[\uac00-\ud7af]/.test(t)) return "ko";
  if (/[\u4e00-\u9fff]/.test(t)) return "zh";
  if (/[а-яё]/i.test(t)) return "ru";
  if (/é|è|ç|à|â|ê|î|ô|û/i.test(t)) return "fr";
  if (/ä|ö|ü|ß/i.test(t)) return "de";
  if (/ñ|¿|¡/i.test(t)) return "es";
  if (/^[a-z0-9 .,?!'";:()\-@#$%^&*_/\\]+$/i.test(t)) return "en";
  return "en";
}

import { invoke } from "@tauri-apps/api/core";
import type { TranslationRecord } from "@/types/translation";
import type { VocabularyGroup, VocabularyWord } from "@/types/vocabulary";

// ==================== Database Operations ====================

export interface DbInitStatus {
  initialized: boolean;
  db_path: string;
  tables_created: string[];
}

export async function initDB(): Promise<DbInitStatus> {
  return invoke("init_database_cmd");
}

export async function getDBStatus(): Promise<boolean> {
  return invoke("get_db_status_cmd");
}

// ==================== Translation History ====================

export async function getTranslations(): Promise<TranslationRecord[]> {
  return invoke<TranslationRecord[]>("get_translations_cmd");
}

export async function toggleFavorite(id: string): Promise<void> {
  await invoke("toggle_favorite_cmd", { id });
}

export async function deleteTranslation(id: string): Promise<void> {
  await invoke("delete_translation_cmd", { id });
}

/**
 * 清理过期历史，返回删除条数。
 * days <= 0 表示永久保留（Rust 侧直接返回 0，不删除）。
 * 收藏记录不会被清理。
 */
export async function purgeOldHistory(days: number): Promise<number> {
  return invoke<number>("purge_history_cmd", { days });
}

export async function saveTranslationHistory(record: TranslationRecord): Promise<void> {
  await invoke("translate_history_cmd", { translation: record });
}

// ==================== Vocabulary ====================

export interface VocabularyGroupRecord {
  id: string;
  name: string;
  color: string;
  created_at: number;
}

export interface VocabularyWordRecord {
  id: string;
  word: string;
  translation: string;
  phonetic?: string | null;
  example?: string | null;
  group_id: string;
  created_at: number;
  review_count: number;
  last_reviewed_at?: number | null;
}

function toVocabularyGroup(r: VocabularyGroupRecord): import("../types/vocabulary").VocabularyGroup {
  return { id: r.id, name: r.name, color: r.color, createdAt: r.created_at };
}

function toVocabularyWord(r: VocabularyWordRecord): import("../types/vocabulary").VocabularyWord {
  return {
    id: r.id, word: r.word, translation: r.translation,
    phonetic: r.phonetic || undefined,
    example: r.example || undefined,
    groupId: r.group_id, createdAt: r.created_at,
    reviewCount: r.review_count,
    lastReviewedAt: r.last_reviewed_at || undefined,
  };
}

export async function getVocabularyGroups(): Promise<import("../types/vocabulary").VocabularyGroup[]> {
  const records = await invoke<VocabularyGroupRecord[]>("get_vocabulary_groups_cmd");
  return records.map(toVocabularyGroup);
}

export async function getVocabularyWords(): Promise<import("../types/vocabulary").VocabularyWord[]> {
  const records = await invoke<VocabularyWordRecord[]>("get_vocabulary_words_cmd");
  return records.map(toVocabularyWord);
}

export async function addVocabularyGroup(name: string, color: string): Promise<string> {
  return invoke<string>("add_vocabulary_group_cmd", { name, color });
}

/**
 * 确保存在「默认分组」（收藏兜底组）：已存在同名分组则复用，不重复创建。
 * Rust 侧 ensure_default_vocabulary_group_cmd 在单连接内查+插，天然幂等（多入口并发安全）。
 */
export async function ensureDefaultGroup(defaultName: string): Promise<void> {
  await invoke<string>("ensure_default_vocabulary_group_cmd", {
    name: defaultName,
    color: GROUP_COLORS_DEFAULT[0],
  });
}

const GROUP_COLORS_DEFAULT = ["#2563eb"];

export async function deleteVocabularyGroup(id: string): Promise<void> {
  await invoke("delete_vocabulary_group_cmd", { id });
}

export async function addVocabularyWord(
  word: string,
  translation: string,
  groupId: string,
  phonetic?: string,
  example?: string
): Promise<string> {
  return invoke<string>("add_vocabulary_word_cmd", { word, translation, groupId, phonetic, example });
}

export async function deleteVocabularyWord(id: string): Promise<void> {
  await invoke("delete_vocabulary_word_cmd", { id });
}

// ==================== API Key Management ====================

export async function addApiKey(
  service: string,
  displayName: string,
  appId: string | null,
  key: string,
  sort: number
): Promise<void> {
  await invoke("add_api_key_cmd", { service, displayName, appId, key, sort });
}

export async function getApiKey(service: string): Promise<string | null> {
  return invoke("get_api_key_cmd", { service });
}

/** API Key 列表项（与 Rust 端 ApiKeyRecord 对齐的子集） */
export interface ApiKeyOption {
  service_name: string;
  display_name: string;
}

export async function listApiKeys(): Promise<ApiKeyOption[]> {
  return invoke("list_api_keys_cmd");
}

export async function getEngines<T>(): Promise<T[]> {
  return invoke<T[]>("get_engines_cmd");
}

export async function deleteApiKey(service: string): Promise<void> {
  await invoke("delete_api_key_cmd", { service });
}

// ==================== Translation Engine ====================

export async function addEngine(
  serviceName: string,
  displayName: string,
  url: string,
  requiresAppId: boolean
): Promise<void> {
  await invoke("add_engine_cmd", {
    serviceName,
    displayName,
    url,
    requiresAppId,
    requiresApiKey: true,
  });
}

export async function deleteEngine(serviceName: string): Promise<void> {
  await invoke("delete_engine_cmd", { serviceName });
}

export async function reorderApiKeys(ordered: string[]): Promise<void> {
  await invoke("reorder_api_keys_cmd", { ordered });
}

// ==================== Dictionary Paths ====================

export async function getDictPaths(): Promise<string[]> {
  return invoke<string[]>("get_dict_paths_cmd");
}

export async function saveDictPaths(paths: string[]): Promise<void> {
  await invoke("save_dict_paths_cmd", { paths });
}

// ==================== Shortcuts ====================

export async function getShortcuts<T>(): Promise<T> {
  return invoke<T>("get_shortcuts_cmd");
}

export async function updateShortcuts<T extends object>(config: T): Promise<void> {
  await invoke("update_shortcuts_cmd", { config });
}

// ==================== Storage Abstraction Layer ====================

export class Store {
  async getTranslations(): Promise<TranslationRecord[]> {
    return getTranslations();
  }

  async toggleFavorite(id: string): Promise<void> {
    await toggleFavorite(id);
  }

  async deleteTranslation(id: string): Promise<void> {
    await deleteTranslation(id);
  }

  async saveTranslation(record: TranslationRecord): Promise<void> {
    await saveTranslationHistory(record);
  }

  async getVocabularyGroups(): Promise<VocabularyGroup[]> {
    return getVocabularyGroups();
  }

  async getVocabularyWords(): Promise<VocabularyWord[]> {
    return getVocabularyWords();
  }

  async addVocabularyGroup(name: string, color: string): Promise<string> {
    return addVocabularyGroup(name, color);
  }

  async deleteVocabularyGroup(id: string): Promise<void> {
    await deleteVocabularyGroup(id);
  }

  async addVocabularyWord(
    word: string,
    translation: string,
    groupId: string,
    phonetic?: string,
    example?: string
  ): Promise<string> {
    return addVocabularyWord(word, translation, groupId, phonetic, example);
  }

  async deleteVocabularyWord(id: string): Promise<void> {
    await deleteVocabularyWord(id);
  }

  async getApiKey(service: string): Promise<string | null> {
    return getApiKey(service);
  }

  async addApiKey(
    service: string,
    displayName: string,
    appId: string | null,
    key: string,
    sort: number
  ): Promise<void> {
    await addApiKey(service, displayName, appId, key, sort);
  }

  async listApiKeys(): Promise<any[]> {
    return listApiKeys();
  }

  async deleteApiKey(service: string): Promise<void> {
    await deleteApiKey(service);
  }

  async getSettings(): Promise<any> {
    return invoke("get_all_settings_cmd");
  }

  async saveSettings(settings: Record<string, any>): Promise<void> {
    await invoke("save_all_settings_cmd", { settings });
  }
}

export async function getSettings<T = Record<string, any>>(): Promise<T> {
  return invoke("get_all_settings_cmd");
}

export async function saveSettings(settings: Record<string, any>): Promise<void> {
  await invoke("save_all_settings_cmd", { settings });
}

// ==================== 语音模型（MOSS-TTS） ====================

export interface TtsStatus {
  downloaded: boolean;
  version: string | null;
  size_bytes: number | null;
}

export interface TtsDownloadProgress {
  downloaded_bytes: number;
  total_bytes: number;
  file: string;
}

/** 查询语音模型下载状态（目录完整性由 Rust 侧按文件清单校验） */
export async function getTtsStatus(): Promise<TtsStatus> {
  return invoke("tts_model_status_cmd");
}

/** 开始后台下载（hf-mirror 镜像），进度经事件 tts-download-progress 推送 */
export async function downloadTtsModel(): Promise<void> {
  await invoke("tts_model_download_cmd");
}

/** 删除语音模型（完全可逆，删除后可再次下载） */
export async function deleteTtsModel(): Promise<void> {
  await invoke("tts_model_delete_cmd");
}

/** 合成试听 PCM（48kHz 双声道交错 f32）。voice 为空时用默认 Junhao；模型未下载时 Rust 返回明确错误 */
export async function ttsSynthesize(text: string, voice?: string): Promise<number[]> {
  return invoke("tts_synthesize_cmd", { text, voice: voice ?? null });
}

/** 内置音色清单（18 个；voice 为 set_voice 所需名字，group 供前端分组） */
export interface TtsVoiceInfo {
  voice: string;
  group: string;
}

export async function listTtsVoices(): Promise<TtsVoiceInfo[]> {
  return invoke("tts_list_voices_cmd");
}

/** 切换当前音色（引擎已加载则即时生效；未下载模型返回错误） */
export async function setTtsVoice(voice: string): Promise<void> {
  await invoke("tts_set_voice_cmd", { voice });
}

export const store = new Store();
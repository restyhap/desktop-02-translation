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
  return invoke<string>("add_vocabulary_word_cmd", { word, translation, group_id: groupId, phonetic, example });
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
  await invoke("add_api_key_cmd", { service, display_name: displayName, app_id: appId, key, sort });
}

export async function getApiKey(service: string): Promise<string | null> {
  return invoke("get_api_key_cmd", { service });
}

export async function listApiKeys(): Promise<any[]> {
  return invoke("list_api_keys_cmd");
}

export async function deleteApiKey(service: string): Promise<void> {
  await invoke("delete_api_key_cmd", { service });
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

export const store = new Store();
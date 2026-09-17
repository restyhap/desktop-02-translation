import { invoke } from "@tauri-apps/api/core";

// ==================== Dictionary Operations ====================

export interface DictInfo {
  id: number;
  name: string;
  lang_from: string;
  lang_to: string;
  entry_count: number;
}

export interface DictLookupResult<T = unknown> {
  found: boolean;
  entry: T | null;
}

export interface DictResource {
  kind: string;
  filename: string;
  zip_file: string;
}

export interface DictResourceData {
  mime: string;
  data_base64: string;
}

export async function dictHasDb(): Promise<boolean> {
  return invoke("dict_has_db_cmd");
}

export async function listDicts(): Promise<{ dictionaries: DictInfo[] }> {
  return invoke("dict_list_cmd");
}

export async function dictLookup<T>(word: string, dictionaryId: number): Promise<DictLookupResult<T>> {
  return invoke("dict_lookup_cmd", { word, dictionaryId });
}

export async function dictSuggest(query: string, dictionaryId?: number | null): Promise<{ words: string[] }> {
  return invoke("dict_suggest_cmd", { query, dictionaryId });
}

export async function dictBuild(): Promise<void> {
  await invoke("dict_build_cmd");
}

export async function dictLoadResources(word: string): Promise<DictResource[]> {
  return invoke("dict_load_resource_cmd", { word });
}

export async function dictGetResource(zipFile: string, filename: string): Promise<DictResourceData> {
  return invoke("dict_get_resource_cmd", { zipFile, filename });
}
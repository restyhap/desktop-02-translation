export type DictionaryFormat = "mdx" | "stardict" | "dsl";

export interface Dictionary {
  id: string;
  name: string;
  format: DictionaryFormat;
  path: string;
  wordCount: number;
  enabled: boolean;
  lastUpdated: number;
}

export interface DictionaryEntry {
  word: string;
  phonetic?: string;
  definitions: DictionaryDefinition[];
  examples?: string[];
  synonyms?: string[];
  antonyms?: string[];
}

export interface DictionaryDefinition {
  partOfSpeech: string;
  meaning: string;
  example?: string;
}

export interface DictionarySearchResult {
  query: string;
  entries: DictionaryEntry[];
  dictionaries: string[];
  searchTime: number;
}

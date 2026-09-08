import type { Dictionary, DictionarySearchResult } from "@/types/dictionary";

export const mockDictionaries: Dictionary[] = [
  {
    id: "1",
    name: "Oxford Advanced Learner's Dictionary",
    format: "mdx",
    path: "/dictionaries/oald.mdx",
    wordCount: 120000,
    enabled: true,
    lastUpdated: Date.now() - 30 * 24 * 60 * 60 * 1000,
  },
  {
    id: "2",
    name: "Collins COBUILD Advanced English-Chinese Dictionary",
    format: "mdx",
    path: "/dictionaries/collins.mdx",
    wordCount: 85000,
    enabled: true,
    lastUpdated: Date.now() - 60 * 24 * 60 * 60 * 1000,
  },
  {
    id: "3",
    name: "LDOCE5 (Longman Dictionary of Contemporary English)",
    format: "stardict",
    path: "/dictionaries/ldoce5",
    wordCount: 110000,
    enabled: false,
    lastUpdated: Date.now() - 90 * 24 * 60 * 60 * 1000,
  },
  {
    id: "4",
    name: "GoldenDict Russian-Chinese Dictionary",
    format: "dsl",
    path: "/dictionaries/rus-chi.dsl",
    wordCount: 45000,
    enabled: true,
    lastUpdated: Date.now() - 120 * 24 * 60 * 60 * 1000,
  },
];

export const mockDictionaryEntries: Record<string, DictionarySearchResult> = {
  hello: {
    query: "hello",
    entries: [
      {
        word: "hello",
        phonetic: "/həˈləʊ/",
        definitions: [
          { partOfSpeech: "noun", meaning: "a greeting, especially on meeting someone", example: "She gave him a big hello and a kiss." },
          { partOfSpeech: "verb", meaning: "to greet someone by saying hello", example: "She helloed him from across the room." },
        ],
        synonyms: ["hi", "hey", "howdy"],
      },
    ],
    dictionaries: ["Oxford", "Collins"],
    searchTime: 12,
  },
  world: {
    query: "world",
    entries: [
      {
        word: "world",
        phonetic: "/wɜːld/",
        definitions: [
          { partOfSpeech: "noun", meaning: "the earth, together with all of its countries and peoples", example: "He traveled the world." },
          { partOfSpeech: "noun", meaning: "a particular area of activity or interest", example: "The world of finance" },
        ],
        synonyms: ["earth", "globe", "planet"],
      },
    ],
    dictionaries: ["Oxford", "LDOCE5"],
    searchTime: 8,
  },
};

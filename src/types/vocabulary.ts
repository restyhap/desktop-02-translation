export interface VocabularyGroup {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface VocabularyWord {
  id: string;
  word: string;
  translation: string;
  phonetic?: string;
  example?: string;
  groupId: string;
  createdAt: number;
  reviewCount: number;
  lastReviewedAt?: number;
}

export interface VocabularyState {
  groups: VocabularyGroup[];
  words: VocabularyWord[];
}

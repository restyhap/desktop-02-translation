import { useState } from "react";
import { mockVocabularyGroups, mockVocabularyWords } from "@/mocks";
import type { VocabularyGroup, VocabularyWord } from "@/types/vocabulary";

export function VocabularyPanel() {
  const [groups] = useState<VocabularyGroup[]>(mockVocabularyGroups);
  const [words] = useState<VocabularyWord[]>(mockVocabularyWords);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const filteredWords = selectedGroupId
    ? words.filter((w) => w.groupId === selectedGroupId)
    : words;

  const getGroupById = (id: string) => groups.find((g) => g.id === id);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="text-sm font-semibold mb-2">生词本</div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setSelectedGroupId(null)}
            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
              selectedGroupId === null
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            全部
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => setSelectedGroupId(group.id)}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                selectedGroupId === group.id
                  ? "text-white"
                  : "text-muted-foreground hover:opacity-80"
              }`}
              style={{
                backgroundColor:
                  selectedGroupId === group.id ? group.color : `${group.color}20`,
              }}
            >
              {group.name}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {filteredWords.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            暂无生词
          </div>
        ) : (
          filteredWords.map((word) => {
            const group = getGroupById(word.groupId);
            return (
              <div
                key={word.id}
                className="p-3 border rounded-lg mb-2 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">{word.word}</div>
                  {group && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: group.color }}
                    >
                      {group.name}
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {word.translation}
                </div>
                {word.phonetic && (
                  <div className="text-xs text-muted-foreground/70 mt-0.5">
                    {word.phonetic}
                  </div>
                )}
                {word.example && (
                  <div className="text-xs text-muted-foreground mt-2 italic">
                    "{word.example}"
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground/60">
                  <span>复习 {word.reviewCount} 次</span>
                  {word.lastReviewedAt && (
                    <span>
                      最近复习:{" "}
                      {new Date(word.lastReviewedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

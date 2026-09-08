import { useState } from "react";
import { mockDictionaries, mockDictionaryEntries } from "@/mocks";
import type { Dictionary, DictionarySearchResult } from "@/types/dictionary";

interface DictionaryPanelProps {
  onSearch?: (word: string, result: DictionarySearchResult | null) => void;
}

export function DictionaryPanel({ onSearch }: DictionaryPanelProps) {
  const [word, setWord] = useState("");
  const [dictionaries] = useState<Dictionary[]>(mockDictionaries);

  const handleSearch = () => {
    if (word.trim()) {
      const result = mockDictionaryEntries[word.trim().toLowerCase()] || null;
      onSearch?.(word.trim(), result);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="输入单词查询..."
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            查询
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-sm font-medium mb-3">已加载词典</div>
        {dictionaries.map((dict) => (
          <div
            key={dict.id}
            className="p-3 border rounded-lg mb-2 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm">{dict.name}</div>
              <div
                className={`w-2 h-2 rounded-full ${
                  dict.enabled ? "bg-green-500" : "bg-gray-300"
                }`}
              />
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span className="uppercase">{dict.format}</span>
              <span>·</span>
              <span>{(dict.wordCount / 1000).toFixed(0)}K 词条</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

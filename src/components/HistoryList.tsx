import { useState } from "react";
import { mockTranslations } from "@/mocks";
import type { TranslationResult } from "@/types/translation";

interface HistoryListProps {
  onSelect?: (item: TranslationResult) => void;
}

export function HistoryList({ onSelect }: HistoryListProps) {
  const [search, setSearch] = useState("");

  const filtered = mockTranslations.filter(
    (item) =>
      item.sourceText.toLowerCase().includes(search.toLowerCase()) ||
      item.translatedText.toLowerCase().includes(search.toLowerCase())
  );

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    return `${days} 天前`;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <input
          type="text"
          placeholder="搜索翻译历史..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            暂无翻译记录
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelect?.(item)}
              className="p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="text-sm font-medium truncate">{item.sourceText}</div>
              <div className="text-sm text-muted-foreground truncate mt-1">
                {item.translatedText}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">
                  {item.sourceLang.toUpperCase()} → {item.targetLang.toUpperCase()}
                </span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">
                  {formatTime(item.timestamp)}
                </span>
                {item.favorite && (
                  <span className="text-xs text-yellow-500">★</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

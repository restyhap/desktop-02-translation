import { useState, useEffect } from "react";
import { store } from "@/storage";
import type { TranslationResult } from "@/types/translation";

interface HistoryListProps {
  onSelect?: (item: TranslationResult) => void;
  onUpdate?: () => void;
}

export function HistoryList({ onSelect, onUpdate }: HistoryListProps) {
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState<TranslationResult[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const records = await store.getTranslations();
      const translations: TranslationResult[] = records.map(r => ({
        id: r.id,
        sourceText: r.source_text,
        translatedText: r.translated_text,
        sourceLang: r.source_lang as TranslationResult["sourceLang"],
        targetLang: r.target_lang as TranslationResult["targetLang"],
        engine: r.engine,
        timestamp: r.timestamp,
        favorite: r.favorite === 1,
      }));
      setHistory(translations);
    } catch (error) {
      console.error("[HistoryList] 加载历史失败:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleToggleFavorite = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await store.toggleFavorite(id);
      setHistory(prev => prev.map(item =>
        item.id === id ? { ...item, favorite: !item.favorite } : item
      ));
      onUpdate?.();
    } catch (error) {
      console.error("[HistoryList] 切换收藏失败:", error);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await store.deleteTranslation(id);
      setHistory(prev => prev.filter(item => item.id !== id));
      onUpdate?.();
    } catch (error) {
      console.error("[HistoryList] 删除记录失败:", error);
    }
  };

  const filtered = history.filter(
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
        {loading ? (
          <div className="p-4 text-center text-muted-foreground text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            暂无翻译记录
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelect?.(item)}
              className="p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors group"
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
                <div className="flex-1" />
                <button
                  onClick={(e) => handleToggleFavorite(e, item.id)}
                  className={`text-sm opacity-0 group-hover:opacity-100 transition-opacity ${
                    item.favorite ? "text-yellow-500 opacity-100" : "text-muted-foreground hover:text-yellow-500"
                  }`}
                  title={item.favorite ? "取消收藏" : "收藏"}
                >
                  {item.favorite ? "★" : "☆"}
                </button>
                <button
                  onClick={(e) => handleDelete(e, item.id)}
                  className="text-sm text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"
                  title="删除"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

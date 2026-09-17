import { useState } from "react";

export interface DictInfo {
  id: number;
  name: string;
  lang_from: string;
  lang_to: string;
  entry_count: number;
}

interface DictionaryPanelProps {
  dicts: DictInfo[];
  activeDict: number | null;
  onSelect: (id: number) => void;
  hasDb: boolean;
  building: boolean;
  onBuild: () => void;
}

// 词典卡片列表: 点击选中词典, 右侧输入框联动查询
export function DictionaryPanel({ dicts, activeDict, onSelect, hasDb, building, onBuild }: DictionaryPanelProps) {
  const [open, setOpen] = useState(false);

  if (!hasDb) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center text-sm text-muted-foreground">
          <div className="mb-2">📚 词典未初始化</div>
          <div className="text-xs">请先构建词典数据库</div>
          <button
            onClick={onBuild}
            disabled={building}
            className="mt-2 px-4 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {building ? "⏳ 构建中..." : "🔨 构建词典"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-3 pt-3 pb-1 text-xs text-muted-foreground">选择词典</div>
      <div className="flex-1 overflow-y-auto px-3 space-y-2">
        {dicts.map((d) => {
          const selected = activeDict === d.id;
          return (
            <button
              key={d.id}
              onClick={() => onSelect(d.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                selected
                  ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30"
                  : "bg-card border-border hover:border-primary/40 hover:bg-muted/40"
              }`}
            >
              <div className={`text-sm font-medium truncate ${selected ? "text-primary" : "text-foreground"}`}>
                {d.name}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {d.entry_count > 0 ? `${(d.entry_count / 10000).toFixed(1)} 万词` : "无数据"}
                {d.lang_from && ` · ${d.lang_from}→${d.lang_to || "?"}`}
              </div>
            </button>
          );
        })}
        {dicts.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-6">
            暂无词典，请在设置中添加目录后构建
          </div>
        )}
      </div>

      <div className="p-3 border-t">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-1 transition-colors"
        >
          {open ? "▾ 收起" : "▸ 更多"}
        </button>
        {open && (
          <button
            onClick={onBuild}
            disabled={building}
            className="w-full mt-1 px-3 py-2 text-sm bg-muted hover:bg-muted/80 rounded-md disabled:opacity-50 transition-colors"
          >
            {building ? "⏳ 构建中..." : "🔨 重新构建词典"}
          </button>
        )}
      </div>
    </div>
  );
}
import { useState, useEffect } from "react";
import type { TranslationResult } from "@/types/translation";
import { listApiKeys, type ApiKeyOption } from "@/storage";
import { TTSButton } from "@/components/TTSButton";
import { DictEntryView, type DictEntry } from "@/components/DictEntryView";

interface TranslationResultProps {
  result: TranslationResult | null;
  loading?: boolean;
  error?: string | null;
  currentEngine?: string;
  onEngineChange?: (engine: string) => void;
  dictEntry?: DictEntry | null;
  dictLoading?: boolean;
  dictError?: string | null;
}

export function TranslationResultPanel({ result, loading = false, error = null, currentEngine, onEngineChange, dictEntry = null, dictLoading = false, dictError = null }: TranslationResultProps) {
  const [engines, setEngines] = useState<ApiKeyOption[]>([]);
  const [engineLoading, setEngineLoading] = useState(true);

  useEffect(() => {
    listApiKeys().then(keys => {
      setEngines(keys);
      if (keys.length > 0 && !currentEngine) {
        onEngineChange?.(keys[0].service_name);
      }
      setEngineLoading(false);
    }).catch(() => {
      setEngines([]);
      setEngineLoading(false);
    });
  }, []);

  if (engineLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        加载中...
      </div>
    );
  }

  if (engines.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          暂无翻译服务，请在设置中配置
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b px-3">
        {engines.map((opt) => (
          <button
            key={opt.service_name}
            onClick={() => onEngineChange?.(opt.service_name)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              currentEngine === opt.service_name
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.display_name}
          </button>
        ))}
      </div>
      <div className="flex-1 relative">
        {dictLoading && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            词典查询中...
          </div>
        )}
        {dictEntry && !dictLoading && (
          <div className="w-full h-full overflow-y-auto p-3">
            <DictEntryView entry={dictEntry} />
          </div>
        )}
        {dictError && !dictEntry && !dictLoading && (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-center text-sm text-muted-foreground">{dictError}</div>
          </div>
        )}
        {!dictEntry && !dictError && !dictLoading && (
          <>
        {loading && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <div>翻译中...</div>
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-center text-sm text-destructive">
              <div className="font-medium mb-1">翻译失败</div>
              <div className="text-xs text-muted-foreground">{error}</div>
            </div>
          </div>
        )}
        {!result && !loading && !error && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            输入文本并点击翻译按钮
          </div>
        )}
        {result && (
          <div className="w-full h-full overflow-y-auto p-3 border rounded-md">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs px-2 py-1 bg-muted rounded">
                {result.sourceLang.toUpperCase()}
              </span>
              <span className="text-xs text-muted-foreground">→</span>
              <span className="text-xs px-2 py-1 bg-muted rounded">
                {result.targetLang.toUpperCase()}
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                {result.engine}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">翻译</div>
            <div className="text-sm font-medium leading-relaxed text-primary">
              {result.translatedText}
            </div>
          </div>
        )}
        <div className="absolute bottom-4 left-4">
          <TTSButton text={result?.translatedText || ""} lang={result?.targetLang || ""} />
        </div>
        </>
        )}
      </div>
    </div>
  );
}

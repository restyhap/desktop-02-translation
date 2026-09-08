import { useState } from "react";
import type { TranslationResult } from "@/types/translation";
import type { DictionarySearchResult } from "@/types/dictionary";

interface TranslationResultProps {
  result: TranslationResult | null;
  dictResult?: DictionarySearchResult | null;
}

export function TranslationResultPanel({ result, dictResult }: TranslationResultProps) {
  const [activeDict, setActiveDict] = useState(0);

  if (dictResult && dictResult.entries.length > 0) {
    const dictNames = dictResult.dictionaries;
    const entries = dictResult.entries;
    const entry = entries[activeDict];

    return (
      <div className="flex flex-col h-full p-4">
        <div className="flex gap-1 mb-3 border-b">
          {dictNames.map((name, i) => (
            <button
              key={name}
              onClick={() => setActiveDict(i)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                activeDict === i ? "border-primary text-primary" : "border-transparent text-muted-foreground"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        {entry && (
          <div className="flex-1 overflow-y-auto">
            <div className="text-lg font-semibold mb-1">{entry.word}</div>
            {entry.phonetic && <div className="text-sm text-muted-foreground mb-3">{entry.phonetic}</div>}
            {entry.definitions.map((def, i) => (
              <div key={i} className="mb-3">
                <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{def.partOfSpeech}</span>
                <div className="text-sm mt-1">{def.meaning}</div>
                {def.example && (
                  <div className="text-xs text-muted-foreground mt-1 italic">"{def.example}"</div>
                )}
              </div>
            ))}
            {entry.synonyms && entry.synonyms.length > 0 && (
              <div className="mt-3 text-xs text-muted-foreground">
                同类词: {entry.synonyms.join(", ")}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        输入文本并点击翻译按钮
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4">
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
      <div className="mb-4">
        <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">原文</div>
        <div className="text-sm leading-relaxed">{result.sourceText}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">翻译</div>
        <div className="text-sm font-medium leading-relaxed text-primary">
          {result.translatedText}
        </div>
      </div>
    </div>
  );
}

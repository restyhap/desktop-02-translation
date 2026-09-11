import { useState } from "react";
import { SUPPORTED_LANGUAGES } from "@/types/translation";
import type { Language, TranslationEngine } from "@/types/translation";

interface TranslationInputProps {
  onTranslate?: (text: string, sourceLang: Language, targetLang: Language, engine: TranslationEngine) => void;
  defaultText?: string;
  engine?: TranslationEngine;
}

export function TranslationInput({ onTranslate, defaultText, engine }: TranslationInputProps) {
  const [text, setText] = useState(defaultText || "");
  const [sourceLang, setSourceLang] = useState<Language>("en");
  const [targetLang, setTargetLang] = useState<Language>("zh");

  const handleTranslate = () => {
    if (text.trim() && engine) {
      onTranslate?.(text.trim(), sourceLang, targetLang, engine);
    }
  };

  const handleSwapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b">
        <select
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value as Language)}
          className="flex-1 px-3 py-2 text-sm border rounded-md"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleSwapLanguages}
          className="p-2 hover:bg-muted rounded-md transition-colors"
          title="交换语言"
        >
          ⇄
        </button>
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value as Language)}
          className="flex-1 px-3 py-2 text-sm border rounded-md"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="输入要翻译的文本..."
          className="w-full h-full resize-none p-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="p-3 border-t">
        <button
          onClick={handleTranslate}
          disabled={!text.trim() || !engine}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          翻译
        </button>
      </div>
    </div>
  );
}

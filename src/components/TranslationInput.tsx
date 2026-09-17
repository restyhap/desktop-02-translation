import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SUPPORTED_LANGUAGES } from "@/types/translation";
import { TTSButton } from "@/components/TTSButton";
import type { Language, TranslationEngine } from "@/types/translation";

interface TranslationInputProps {
  onTranslate?: (text: string, sourceLang: Language, targetLang: Language, engine: TranslationEngine) => void;
  onDictLookup?: (text: string) => void;
  defaultText?: string;
  engine?: TranslationEngine;
  lang?: string;
  dictionaryId?: number | null;
}

export function TranslationInput({ onTranslate, onDictLookup, defaultText, engine, lang, dictionaryId }: TranslationInputProps) {
  const [text, setText] = useState(defaultText || "");
  const [sourceLang, setSourceLang] = useState<Language>("en");
  const [targetLang, setTargetLang] = useState<Language>("zh");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    setText(defaultText || "");
  }, [defaultText]);

  const handleSuggest = useCallback(async (text: string) => {
    if (text.trim().length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const seq = ++seqRef.current;
    try {
      const result = await invoke<{ words: string[] }>("dict_suggest_cmd", {
        query: text.trim(),
        dictionaryId,
      });
      if (seq === seqRef.current) {
        setSuggestions(result.words.slice(0, 8));
        setShowSuggestions(true);
      }
    } catch {
      if (seq === seqRef.current) {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }
  }, [dictionaryId]);

  const debounceRef = useRef<number>(0);
  const handleTextChange = (value: string) => {
    setText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => handleSuggest(value), 200);
  };

  // 词典切换后, 若当前输入是单词则重新查询
  useEffect(() => {
    const t = text.trim();
    if (t && /^[a-zA-Z']+$/.test(t) && t.length <= 32) {
      onDictLookup?.(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictionaryId]);

  const selectSuggestion = (word: string) => {
    setText(word);
    setSuggestions([]);
    setShowSuggestions(false);
    onDictLookup?.(word);
  };

  const handleTranslate = () => {
    if (text.trim() && engine) {
      onTranslate?.(text.trim(), sourceLang, targetLang, engine);
    }
  };

  const handleSwapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    const t = text.trim();
    if (!t) return;
    e.preventDefault();
    const isWord = t.length <= 32 && /^[a-zA-Z']+$/.test(t);
    if (isWord && onDictLookup) {
      onDictLookup(t);
    } else if (!isWord) {
      handleTranslate();
    }
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

      <div className="flex-1 p-3 relative">
        <textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入单词查词典，或输入段落翻译..."
          className="w-full h-full resize-none p-3 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-20 w-full bg-white border rounded-md shadow-lg mt-1 max-h-48 overflow-auto">
            {suggestions.map((word) => (
              <li
                key={word}
                onClick={() => selectSuggestion(word)}
                className="px-3 py-2 hover:bg-primary/10 cursor-pointer text-sm transition-colors"
              >
                {word}
              </li>
            ))}
          </ul>
        )}
        <div className="absolute bottom-4 left-4">
          <TTSButton text={text} lang={lang} />
        </div>
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
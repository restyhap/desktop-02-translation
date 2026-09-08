import { useState } from "react";
import { HistoryList } from "@/components/HistoryList";
import { DictionaryPanel } from "@/components/DictionaryPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TranslationInput } from "@/components/TranslationInput";
import { TranslationResultPanel } from "@/components/TranslationResultPanel";
import { VocabularyPanel } from "@/components/VocabularyPanel";
import { generateMockTranslation } from "@/mocks";
import type { TranslationResult, Language, TranslationEngine } from "@/types/translation";
import type { DictionarySearchResult } from "@/types/dictionary";

type SidebarTab = "history" | "dictionary" | "vocabulary" | "settings";

function App() {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("history");
  const [translationResult, setTranslationResult] = useState<TranslationResult | null>(null);
  const [dictResult, setDictResult] = useState<DictionarySearchResult | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [text, setText] = useState("");

  const handleTranslate = (text: string, sourceLang: Language, targetLang: Language, engine: TranslationEngine) => {
    const result = generateMockTranslation(text, sourceLang, targetLang, engine);
    setTranslationResult(result);
  };

  const handleHistorySelect = (item: TranslationResult) => {
    setTranslationResult(item);
    setText(item.sourceText);
  };

  const handleDictSearch = (_word: string, result: DictionarySearchResult | null) => {
    setDictResult(result);
  };

  if (showSettings) {
    return (
      <div className="h-screen bg-background p-2.5">
        <SettingsPanel onClose={() => setShowSettings(false)} />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background p-2.5 gap-2.5">
      <div className="w-14 flex flex-col items-center py-3 border bg-muted/20 gap-2 rounded-lg">
        <button
          onClick={() => setSidebarTab("history")}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
            sidebarTab === "history" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
          title="翻译历史"
        >
          📝
        </button>
        <button
          onClick={() => setSidebarTab("dictionary")}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
            sidebarTab === "dictionary" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
          title="词典"
        >
          📖
        </button>
        <button
          onClick={() => setSidebarTab("vocabulary")}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
            sidebarTab === "vocabulary" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
          title="生词本"
        >
          📚
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowSettings(true)}
          className="w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          title="设置"
        >
          ⚙️
        </button>
      </div>

      <div className="w-72 border flex flex-col rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">
            {sidebarTab === "history"
              ? "翻译历史"
              : sidebarTab === "dictionary"
              ? "词典"
              : sidebarTab === "vocabulary"
              ? "生词本"
              : "设置"}
          </h2>
        </div>
        <div className="flex-1 overflow-hidden">
          {sidebarTab === "history" && <HistoryList onSelect={handleHistorySelect} />}
          {sidebarTab === "dictionary" && <DictionaryPanel onSearch={handleDictSearch} />}
          {sidebarTab === "vocabulary" && <VocabularyPanel />}
        </div>
      </div>

      <div className="flex-1 flex flex-col rounded-lg overflow-hidden border">
        <div className="h-1/2 border-b">
          <TranslationInput onTranslate={handleTranslate} defaultText={text} />
        </div>
        <div className="h-1/2">
          <TranslationResultPanel result={translationResult} dictResult={dictResult} />
        </div>
      </div>
    </div>
  );
}

export default App;

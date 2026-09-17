import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { initDB, saveTranslationHistory } from "@/storage";
import { HistoryList } from "@/components/HistoryList";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TranslationInput } from "@/components/TranslationInput";
import { TranslationResultPanel } from "@/components/TranslationResultPanel";
import { VocabularyPanel } from "@/components/VocabularyPanel";
import { DictionaryPanel, type DictInfo } from "@/components/DictionaryPanel";
import type { DictEntry as DictEntryType } from "@/components/DictEntryView";
import { translate } from "@/storage/translation";
import logoUrl from "@/assets/logo.png";
import type { TranslationResult, Language, TranslationEngine, TranslationRecord } from "@/types/translation";

type SidebarTab = "history" | "vocabulary" | "settings" | "dictionary";

function App() {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("history");
  const [translationResult, setTranslationResult] = useState<TranslationResult | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [text, setText] = useState("");
  const [sourceLang, setSourceLang] = useState<Language>("zh");
  const [dbError, setDbError] = useState<string | null>(null);
  const [currentEngine, setCurrentEngine] = useState<string>("");
  const [historyVersion, setHistoryVersion] = useState(0);
  const [dicts, setDicts] = useState<DictInfo[]>([]);
  const [activeDict, setActiveDict] = useState<number | null>(null);
  const [dictEntry, setDictEntry] = useState<DictEntryType | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  const [dictBuilding, setDictBuilding] = useState(false);
  const [dictHasDb, setDictHasDb] = useState(true);

  const loadDicts = async () => {
    try {
      const has = await invoke<boolean>("dict_has_db_cmd");
      setDictHasDb(has);
      if (has) {
        const r = await invoke<{ dictionaries: DictInfo[] }>("dict_list_cmd");
        const withData = r.dictionaries.filter((d) => d.entry_count > 0);
        const list = withData.length > 0 ? withData : r.dictionaries;
        setDicts(list);
        setActiveDict((prev) => {
          if (prev !== null && list.some((d) => d.id === prev)) return prev;
          return list.length > 0 ? list[0].id : null;
        });
      }
    } catch (err) {
      console.error("[App] 加载词典列表失败:", err);
    }
  };

  useEffect(() => {
    loadDicts();
  }, []);

  useEffect(() => {
    let cancelled = false;
    
    // 等待 Tauri IPC 就绪
    const initWhenReady = async () => {
      try {
        await invoke("get_db_status_cmd");
        if (!cancelled) {
          initDB().catch((err) => {
            console.error("[App] 数据库初始化失败:", err);
            setDbError(err instanceof Error ? err.message : String(err));
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[App] Tauri API 尚未就绪，等待重试:", err);
        }
      }
    };
    
    // 监听 Tauri 就绪事件
    listen("__tauri__init", () => {
      initWhenReady();
    }).catch(() => {
      // 如果没有该事件，直接尝试初始化
      setTimeout(initWhenReady, 100);
    });
    
    // 如果上面失败，500ms 后重试
    const timer = setTimeout(() => {
      initWhenReady();
    }, 500);
    
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

  const handleTranslate = async (text: string, sourceLang: Language, targetLang: Language, engine: TranslationEngine) => {
    setTranslationLoading(true);
    setTranslationError(null);
    setDictEntry(null);
    setDictError(null);
    try {
      const result = await import("@/storage/translation").then(m => m.translate(text, sourceLang, targetLang, engine));
      const translationRecord: TranslationRecord = {
        id: crypto.randomUUID(),
        source_text: text,
        translated_text: result.text,
        source_lang: result.source_lang,
        target_lang: result.target_lang,
        engine: result.engine,
        timestamp: Date.now(),
        favorite: 0,
      };
      await saveTranslationHistory(translationRecord);
      setSourceLang(sourceLang);
      setHistoryVersion(v => v + 1);
      setTranslationResult({
        id: translationRecord.id,
        sourceText: translationRecord.source_text,
        translatedText: translationRecord.translated_text,
        sourceLang: sourceLang as Language,
        targetLang: targetLang as Language,
        engine: translationRecord.engine as TranslationEngine,
        timestamp: translationRecord.timestamp,
        favorite: translationRecord.favorite === 1,
      });
    } catch (error) {
      console.error("[App] 翻译失败:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      setTranslationError(errorMsg);
    } finally {
      setTranslationLoading(false);
    }
  };

  const handleHistorySelect = (item: TranslationResult) => {
    setTranslationResult(item);
    setText(item.sourceText);
    setSourceLang(item.sourceLang as Language);
    setCurrentEngine(item.engine);
    setDictEntry(null);
    setDictError(null);
  };

  const handleDictTranslate = async (text: string) => {
    try {
      const result = await translate(text, sourceLang, "zh", currentEngine || "google");
      const translationRecord: TranslationRecord = {
        id: crypto.randomUUID(),
        source_text: text,
        translated_text: result.text,
        source_lang: result.source_lang,
        target_lang: result.target_lang,
        engine: result.engine,
        timestamp: Date.now(),
        favorite: 0,
      };
      await saveTranslationHistory(translationRecord);
      setHistoryVersion((v) => v + 1);
      setTranslationResult({
        id: translationRecord.id,
        sourceText: translationRecord.source_text,
        translatedText: translationRecord.translated_text,
        sourceLang: sourceLang as Language,
        targetLang: translationRecord.target_lang as Language,
        engine: translationRecord.engine as TranslationEngine,
        timestamp: translationRecord.timestamp,
        favorite: translationRecord.favorite === 1,
      });
    } catch (error) {
      console.error("[App] 词典段落翻译失败:", error);
    }
  };

  // 右侧输入框联动: 单词 → 查词典显示释义; 段落 → 翻译
  const handleDictLookup = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    const isWord = t.length <= 32 && /^[a-zA-Z']+$/.test(t);
    if (!isWord) {
      handleDictTranslate(t);
      return;
    }
    if (activeDict === null) return;
    setDictLoading(true);
    setDictError(null);
    try {
      const result = await invoke<{ found: boolean; entry: DictEntryType | null }>("dict_lookup_cmd", {
        word: t,
        dictionaryId: activeDict,
      });
      if (result.found && result.entry) {
        setDictEntry(result.entry);
      } else {
        setDictEntry(null);
        setDictError(`「${t}」在所选词典中未找到`);
      }
    } catch (err) {
      setDictEntry(null);
      setDictError(`查询失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDictLoading(false);
    }
  };

  const handleDictSelect = (id: number) => {
    setActiveDict(id);
  };

  const handleDictBuild = async () => {
    setDictBuilding(true);
    try {
      await invoke("dict_build_cmd");
      await loadDicts();
    } catch (err) {
      console.error("[App] 词典构建失败:", err);
    } finally {
      setDictBuilding(false);
    }
  };

  if (dbError) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-lg font-semibold mb-2">数据库初始化失败</div>
          <div className="text-sm text-muted-foreground">{dbError}</div>
        </div>
      </div>
    );
  }

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
        <img
          src={logoUrl}
          alt="Desktop Translation"
          className="w-10 h-10 rounded-lg mb-1 select-none"
          draggable={false}
        />
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
          onClick={() => setSidebarTab("vocabulary")}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
            sidebarTab === "vocabulary" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
          title="生词本"
        >
          📚
        </button>
        <button
          onClick={() => setSidebarTab("dictionary")}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
            sidebarTab === "dictionary" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
          title="词典"
        >
          🔍
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
            {sidebarTab === "history" ? "翻译历史" : sidebarTab === "vocabulary" ? "生词本" : "设置"}
          </h2>
        </div>
        <div className="flex-1 overflow-hidden">
          {sidebarTab === "history" && <HistoryList key={historyVersion} onSelect={handleHistorySelect} />}
          {sidebarTab === "vocabulary" && <VocabularyPanel />}
          {sidebarTab === "dictionary" && (
            <DictionaryPanel
              dicts={dicts}
              activeDict={activeDict}
              onSelect={handleDictSelect}
              hasDb={dictHasDb}
              building={dictBuilding}
              onBuild={handleDictBuild}
            />
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col rounded-lg overflow-hidden border relative">
        <div className="h-1/2 border-b">
          <TranslationInput
            onTranslate={handleTranslate}
            defaultText={text}
            engine={currentEngine}
            lang={sourceLang}
            dictionaryId={activeDict}
            onDictLookup={handleDictLookup}
          />
        </div>
        <div className="h-1/2">
          <TranslationResultPanel
            result={translationResult}
            loading={translationLoading}
            error={translationError}
            currentEngine={currentEngine}
            onEngineChange={setCurrentEngine}
            dictEntry={dictEntry}
            dictLoading={dictLoading}
            dictError={dictError}
          />
        </div>
      </div>
    </div>
  );
}

export default App;

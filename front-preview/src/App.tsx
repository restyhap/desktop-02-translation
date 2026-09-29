/**
 * 主窗口宿主 — v2 重设计：去三栏
 *
 * 左：Sidebar 64px rail（导航身份：主页/历史/生词本/词典 + 底部主题/设置）
 * 右：全宽度「单页单焦点」舞台 —— 每次只渲染一个 tab 的整页主题，
 *     不设常驻中栏；设置不再是 overlay，而是舞台内整页视图。
 * 主页：max-w-[760px] 居中 hero（衬线大标题 + 一体化翻译卡 +
 *       词典芯片条 + 回信卡 + 最近历史条带）。
 * 红线：mock 泄漏文案只出现在底部 footer 声明区。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useTranslationState } from "@/hooks/useTranslationState";
import { useAppLocale } from "@/lib/i18n";
import { Sidebar, type SidebarTab, type ViewTab } from "@/components/Sidebar";
import { PageHeader } from "@/components/PageHeader";
import { LanguagesIcon } from "@/components/icons";
import { TranslationInput } from "@/components/TranslationInput";
import { TranslationResultPanel } from "@/components/TranslationResultPanel";
import { RecentStrip } from "@/components/RecentStrip";
import { HistoryPanel } from "@/pages/HistoryPanel";
import { VocabularyPanel } from "@/pages/VocabularyPanel";
import { DictionaryPanel } from "@/pages/DictionaryPanel";
import { SettingsPanel } from "@/pages/SettingsPanel";
import { TranslatePopup } from "@/components/TranslatePopup";
import { TranslateChipsRow } from "@/components/TranslateChipsRow";
import { emitShowTranslate, onShowTranslate } from "@/mock/bus";
import type { DictEntry, Language, TranslationEngine, TranslationRecord } from "@/lib/types";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/types";
import {
  getSettings,
  saveAllSettings,
  initDatabase,
  getDbStatus,
  listApiKeys,
  listDicts,
  dictHasDb,
  dictLookup,
  dictBuild,
  getTranslations,
  type ApiKeyItem,
} from "@/mock/store";

type EngineLike = TranslationEngine;

/** 数据库状态错误的哨兵值：真正消息在渲染时按当前语言取词条 */
const DB_STATUS_ERR = "__db_status__";

export default function App() {
  /* ---------- 界面语言 ---------- */
  const { t } = useAppLocale();

  /* ---------- 主题 + 设置 ---------- */
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      // getSettings 返回深拷贝；首帧同步取，避免闪默认
      return getSettings();
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const themeMode = settings.appearance.theme;
  useTheme(themeMode);

  const changeSettings = (next: AppSettings) => {
    setSettings(next);
    saveAllSettings(next);
  };

  /* ---------- 数据库初始化（对齐 src 启动流程） ---------- */
  const [dbError, setDbError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const st = await getDbStatus();
      if (cancelled) return;
      if (st !== "ok") {
        setDbError(DB_STATUS_ERR);
        return;
      }
      try {
        await initDatabase();
      } catch (e) {
        if (!cancelled) setDbError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ---------- 词典状态 ---------- */
  const [dicts, setDicts] = useState(() => listDicts().dictionaries);
  const [activeDict, setActiveDict] = useState<number | null>(null);
  const [dictEntry, setDictEntry] = useState<(DictEntry & { dictionary_name?: string }) | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  const [dictBuildingId, setDictBuildingId] = useState<number | null>(null);
  const [buildProgress, setBuildProgress] = useState(0);
  const [hasDb] = useState(() => dictHasDb());

  useEffect(() => {
    // 挂载：加载词典，取第一个有数据的为默认可查词典
    const list = listDicts().dictionaries.filter((d) => d.entry_count > 0);
    const usable = list.length > 0 ? list : listDicts().dictionaries;
    setDicts(usable);
    setActiveDict((prev) => prev ?? usable[0]?.id ?? null);
  }, []);

  const handleDictBuild = useCallback(async (id: number) => {
    setDictBuildingId(id);
    setBuildProgress(0);
    await dictBuild(id, (pct) => setBuildProgress(pct));
    const list = listDicts().dictionaries.filter((d) => d.entry_count > 0);
    setDicts(list.length > 0 ? list : listDicts().dictionaries);
    setDictBuildingId(null);
  }, []);

  /* ---------- 翻译流程 ---------- */
  const { result, error, loading, historyVersion, translateAndApply } = useTranslationState();
  const [sidebarTab, setSidebarTab] = useState<ViewTab>("translate");
  const [text, setText] = useState("");
  const [sourceLang, setSourceLang] = useState<Language>("en");
  const [currentEngine, setCurrentEngine] = useState<EngineLike>("");
  const apiKeys = useMemo<ApiKeyItem[]>(() => listApiKeys(), []);
  const engines = useMemo(
    () => apiKeys.map((k) => ({ service: k.service, label: k.display_name })),
    [apiKeys],
  );
  // 未选引擎时取默认（对齐 src：keys 非空自动选第一个）
  useEffect(() => {
    if (!currentEngine && engines.length > 0) {
      const def = settings.translation.defaultEngine;
      setCurrentEngine(def && engines.some((e) => e.service === def) ? def : engines[0].service);
    }
  }, [currentEngine, engines, settings.translation.defaultEngine]);
  // 引擎列表变化时贴回有效值
  useEffect(() => {
    if (currentEngine && engines.length > 0 && !engines.some((e) => e.service === currentEngine)) {
      setCurrentEngine(engines[0].service);
    }
  }, [engines, currentEngine]);

  const handleTranslate = useCallback(
    async (t: string, src: Language, tgt: Language) => {
      setDictEntry(null);
      setDictError(null);
      const res = await translateAndApply(t, src, tgt, currentEngine || "google");
      if (res) setSourceLang(res.sourceLang);
    },
    [currentEngine, translateAndApply],
  );

  const handleHistorySelect = useCallback((record: TranslationRecord) => {
    // 回填输入与词典状态清理（对齐 src；翻译结果保留展示）
    setText(record.source_text);
    setDictEntry(null);
    setDictError(null);
  }, []);

  /** 词典查词（对齐 App.handleDictLookup 判词规则：非词 → 静默翻译） */
  const handleDictLookup = useCallback(
    async (word: string) => {
      if (!/^[a-zA-Z']+$/.test(word) || word.length > 32) {
        void handleTranslate(word, settings.translation.defaultSourceLang, settings.translation.defaultTargetLang);
        return;
      }
      if (activeDict == null) {
        setDictError(t("app.selectDictFirst"));
        return;
      }
      setDictLoading(true);
      setDictError(null);
      const t0 = Date.now();
      const entry = await Promise.resolve(dictLookup(word, activeDict));
      // 至少 220ms 过渡，避免闪烁
      const pad = 220 - (Date.now() - t0);
      if (pad > 0) await new Promise((r) => setTimeout(r, pad));
      setDictLoading(false);
      if (entry) {
        setDictEntry(entry);
      } else {
        setDictError(t("app.wordNotFound", { word }));
      }
    },
    [activeDict, handleTranslate, t, settings.translation.defaultSourceLang, settings.translation.defaultTargetLang],
  );

  /* ---------- 最近历史条带数据（随 historyVersion 刷新） ---------- */
  const recent = useMemo(
    () => getTranslations().slice(0, 5),
    [historyVersion],
  );

  /* ---------- 划词弹窗（bus 事件） ---------- */
  const [popupText, setPopupText] = useState<string | null>(null);
  useEffect(() => onShowTranslate(({ text: t }) => setPopupText(t)), []);

  if (dbError) {
    return (
      <div className="grid h-full w-full place-items-center bg-bg text-ink">
        <div className="text-center">
          <p className="text-sm font-medium text-red">{t("boot.dbError")}</p>
          {dbError !== DB_STATUS_ERR && (
            <p className="mt-1 text-xs text-ink-3">{dbError}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-bg text-ink">
      <Sidebar
        tab={sidebarTab}
        onTab={setSidebarTab}
        themeMode={themeMode}
        onTheme={(m) => changeSettings({ ...settings, appearance: { ...settings.appearance, theme: m } })}
      />

      {/* 舞台：全宽度单页单焦点（v2 去中栏）；设置页走非滚动容器（自身双栏、右列独立滚动） */}
      {sidebarTab === "settings" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <SettingsPanel settings={settings} onClose={() => setSidebarTab("translate")} onChange={changeSettings} />
        </div>
      ) : (
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {sidebarTab === "translate" && (
            <div className="rise-in mx-auto flex w-full max-w-[760px] flex-col px-6 py-10">
              {/* hero 构图：衬线大标题 */}
              {/* 页头：统一规格（羽毛笔 chip + 翻译标题；无副说明保持聚焦） */}
              <PageHeader icon={<LanguagesIcon size={16} />} title={t("nav.home")} />

              {/* 一体化翻译卡 */}
              <TranslationInput
                text={text}
                onTextChange={setText}
                onTranslate={handleTranslate}
                loading={loading}
                sourceLang={sourceLang}
                defaultSourceLang={settings.translation.defaultSourceLang}
                defaultTargetLang={settings.translation.defaultTargetLang}
              />

              {/* 芯片行：独立一档，仅引擎（单词查询去词典页，主页不混排） */}
              <TranslateChipsRow
                engine={currentEngine}
                engines={engines}
                onEngineChange={setCurrentEngine}
              />

              {/* 结果区：回信卡（纯译文；词典条目走词典页） */}
              <div className="mt-7">
                <TranslationResultPanel
                  result={result}
                  error={error}
                  loading={loading}
                  currentEngine={currentEngine}
                />
              </div>

              {/* 最近历史条带（空态隐藏） */}
              <RecentStrip recent={recent} onPick={handleHistorySelect} className="mt-10 pb-2" />
            </div>
          )}

          {sidebarTab === "history" && (
            <HistoryPanel key={`hist-${historyVersion}`} onSelect={handleHistorySelect} />
          )}

          {sidebarTab === "vocabulary" && (
            <VocabularyPanel
              onWordPick={(w) => {
                setText(w);
                setSidebarTab("translate");
              }}
            />
          )}

          {sidebarTab === "dictionary" && (
            <DictionaryPanel
              dicts={dicts}
              activeDict={activeDict}
              hasDb={hasDb}
              buildingId={dictBuildingId}
              buildProgress={buildProgress}
              onSelect={(id) => setActiveDict(id)}
              onBuild={handleDictBuild}
              entry={dictEntry}
              entryLoading={dictLoading}
              entryError={dictError}
              onLookup={handleDictLookup}
              onCloseEntry={() => setDictEntry(null)}
            />
          )}
        </div>

        {/* footer 声明区：mock 文案只允许在此出现（红线） */}
        <footer className="flex h-8 shrink-0 items-center gap-2 border-t border-line px-4 text-[10px] text-ink-3">
          <span>{t("footer.notice")}</span>
          <button
            onClick={() => emitShowTranslate("serendipity")}
            className="ml-auto text-[10px] text-accent hover:underline"
            title={t("footer.popupPreviewTip")}
          >
            {t("footer.popupPreview")}
          </button>
        </footer>
      </div>
      )}

      {/* 划词弹窗预览 */}      {popupText != null && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/25 backdrop-blur-[2px]"
          onClick={() => setPopupText(null)}
        >
          <div className="rise-in" onClick={(e) => e.stopPropagation()}>
            <TranslatePopup
              initialText={popupText}
              settings={settings}
              engines={engines}
              onClose={() => setPopupText(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** 侧栏 tab 类型冗余导出（保持 App 内部一致性） */
export type { SidebarTab };

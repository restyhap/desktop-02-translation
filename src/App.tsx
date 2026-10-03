/**
 * 主窗口宿主 — v2 重设计：去三栏（front-preview 布局壳 × src 业务层）
 *
 * 左：Sidebar 64px rail（导航身份：主页/历史/生词本/词典 + 底部主题/设置）
 * 右：全宽度「单页单焦点」舞台 —— 每次只渲染一个 tab 的整页主题；
 *     设置不再是 overlay，而是舞台内整页视图。
 * 主页：max-w-[760px] 居中 hero（一体化翻译卡 + 引擎芯片行 + 回信卡 + 最近历史条带）。
 *
 * 业务保留（与迁移前 src 语义一致）：
 * - 启动初始化：listen("__tauri__init") + getDBStatus/initDB + 500ms 重试兜底
 * - 词典状态机：loadDicts（dictHasDb/listDicts）+ dictLookup 判词规则 + 全库 dictBuild
 * - 翻译主流程：useTranslationState.translateAndApply（含 silent 的词典联动翻译）
 * - 历史回填：setResult + input/语言/引擎回填
 * - 设置：getSettings 深合并默认值；单项改动 saveSettings 全量落库；主题三态 useTheme
 
 */
import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { dictBuild, dictHasDb as hasDictDb, dictLookup, listDicts, type DictInfo } from "@/storage/dict";
import { getDBStatus, initDB, getTranslations, listApiKeys, getSettings, saveSettings, getVocabularyWords, deleteVocabularyWord } from "@/storage";
import { mapRecordToUi } from "@/storage/translation";
import { Sidebar, type ViewTab } from "@/components/Sidebar";
import { PageHeader } from "@/components/PageHeader";
import { TitleBar } from "@/components/TitleBar";
import { LanguagesIcon, StarIcon } from "@/components/icons";
import { TranslationInput, type EngineChip } from "@/components/TranslationInput";
import { TranslationResultPanel } from "@/components/TranslationResultPanel";
import { SaveToVocabDialog } from "@/components/SaveToVocabDialog";
import { RecentStrip } from "@/components/RecentStrip";
import { TranslateChipsRow } from "@/components/TranslateChipsRow";
import { ShortcutPermBanner } from "@/components/ShortcutPermBanner";
import { HistoryPanel } from "@/pages/HistoryPanel";
import { VocabularyPanel } from "@/pages/VocabularyPanel";
import { DictionaryPanel } from "@/pages/DictionaryPanel";
import { SettingsPanel } from "@/pages/SettingsPanel";
import { useTranslationState } from "@/hooks/useTranslationState";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/components/ui/Toast";
import { useAppLocale } from "@/lib/i18n";

import type { DictEntry } from "@/components/DictEntryView";
import type { AppSettings } from "@/types/settings";
import type { Language, TranslationResult } from "@/types/translation";
import { DEFAULT_SETTINGS } from "@/types/settings";

/** 设置 JSON 深合并默认值（Rust 端结构为 AppSettings 分节 camelCase） */
function mergeSettings(raw: Partial<AppSettings>): AppSettings {
  return {
    general: { ...DEFAULT_SETTINGS.general, ...raw.general },
    translation: { ...DEFAULT_SETTINGS.translation, ...raw.translation },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...raw.appearance },
    shortcuts: {
      translate: raw.shortcuts?.translate ?? DEFAULT_SETTINGS.shortcuts.translate,
      show_main: raw.shortcuts?.show_main ?? DEFAULT_SETTINGS.shortcuts.show_main,
    },
    llm: { ...DEFAULT_SETTINGS.llm, ...raw.llm },
    tts: { ...DEFAULT_SETTINGS.tts, ...raw.tts },
  };
}

function App() {
  const { t } = useAppLocale();

  /* ---------- 主题 + 设置 ---------- */
  const [settings, setSettings] = useState<AppSettings>(() => DEFAULT_SETTINGS);
  const themeMode = settings.appearance.theme;
  useTheme(themeMode);

  useEffect(() => {
    let alive = true;
    getSettings<Partial<AppSettings>>()
      .then((raw) => {
        if (alive && raw && typeof raw === "object") setSettings(mergeSettings(raw));
      })
      .catch((err: unknown) => {
        console.error("[App] 加载设置失败（沿用默认设置）:", err);
      });
    return () => {
      alive = false;
    };
  }, []);

  const changeSettings = useCallback(
    (next: AppSettings) => {
      setSettings(next);
      saveSettings(next).catch((err: unknown) => {
        console.error("[App] 保存设置失败:", err);
      });
    },
    [],
  );

  /* ---------- 数据库初始化（对齐 src 启动流程，语义零改动） ---------- */
  const [dbError, setDbError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;

    // 等待 Tauri IPC 就绪
    const initWhenReady = async () => {
      try {
        await getDBStatus();
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

  /* ---------- 词典状态机（对齐 src loadDicts + 判词规则） ---------- */
  const [dicts, setDicts] = useState<DictInfo[]>([]);
  const [activeDict, setActiveDict] = useState<number | null>(null);
  const [dictEntry, setDictEntry] = useState<DictEntry | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  const [dictBuildingId, setDictBuildingId] = useState<number | null>(null);
  const [dictHasDb, setDictHasDb] = useState(true);
  // B 方案（设置页保存路径）触发的全量重建状态：词典页据此覆盖 loading 态
  const [dictRebuilding, setDictRebuilding] = useState(false);

  const loadDicts = async () => {
    try {
      const has = await hasDictDb();
      setDictHasDb(has);
      if (has) {
        const r = await listDicts();
        const withData = r.dictionaries.filter((d) => d.entry_count > 0);
        const list = withData.length > 0 ? withData : r.dictionaries;
        // 词典顺序：settings.dictOrder 优先（拖拽排序落库后的持久化顺序）
        const order = settings.dictOrder ?? [];
        const sorted = order
          ? [...list].sort(
              (a, b) =>
                (order.indexOf(a.id) < 0 ? 1e9 : order.indexOf(a.id)) -
                (order.indexOf(b.id) < 0 ? 1e9 : order.indexOf(b.id)),
            )
          : list;
        setDicts(sorted);
        setActiveDict((prev) => {
          if (prev !== null && sorted.some((d) => d.id === prev)) return prev;
          return sorted.length > 0 ? sorted[0].id : null;
        });
      }
    } catch (err) {
      console.error("[App] 加载词典列表失败:", err);
    }
  };

  useEffect(() => {
    loadDicts();
  }, []);

  // 对齐 src：dict_build_cmd 为全库构建（无 per-dict / 进度），buildingId 仅作视觉记账
  const handleDictBuild = async (buildingId: number) => {
    setDictBuildingId(buildingId);
    try {
      await dictBuild();
      await loadDicts();
    } catch (err) {
      console.error("[App] 词典构建失败:", err);
    } finally {
      setDictBuildingId(null);
    }
  };

  /* ---------- 翻译流程 ---------- */
  const {
    result: translationResult,
    setResult: setTranslationResult,
    loading: translationLoading,
    error: translationError,
    historyVersion,
    setHistoryVersion,
    translateAndApply,
  } = useTranslationState();
  const { showToast } = useToast();

  /** 收藏入生词本弹窗草稿（原文+译文），非空时渲染 SaveToVocabDialog */
  const [favDraft, setFavDraft] = useState<{ text: string; translation: string } | null>(
    null,
  );
  /** 当前翻译结果是否已入生词本（收藏态真实来源：查生词本是否存在 sourceText） */
  const [favActive, setFavActive] = useState(false);
  /** 收藏态查询令牌：翻译结果/生词本变更后重新判定 */
  const [favCheckToken, setFavCheckToken] = useState(0);
  /** 收藏态刷新：由当前 translationResult 是否在生词本中决定（新建记录 favorite 恒 0，不可依赖该字段） */
  useEffect(() => {
    let cancelled = false;
    const src = translationResult?.sourceText?.trim();
    if (!src) {
      setFavActive(false);
      return;
    }
    void (async () => {
      try {
        const words = await getVocabularyWords();
        if (!cancelled) setFavActive(words.some((w) => w.word.trim() === src));
      } catch (err) {
        console.error("[App] 收藏态查询失败:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [translationResult?.sourceText, favCheckToken]);

  /** 收藏按钮点击：未收藏→开弹窗；已收藏→从生词本移除该条目（取消收藏） */
  const handleFavClick = useCallback(() => {
    if (!translationResult) return;
    const src = translationResult.sourceText.trim();
    if (!src) return;
    if (favActive) {
      // 已收藏：取消——删除生词本中该词条（多分组同词时全删，保持按钮态一致）
      void (async () => {
        try {
          const words = await getVocabularyWords();
          const matched = words.filter((w) => w.word.trim() === src);
          for (const w of matched) await deleteVocabularyWord(w.id);
          setFavActive(false);
          setFavCheckToken((n) => n + 1);
          showToast(t("toast.removedFromVocab"), "info");
        } catch (err) {
          console.error("[App] 取消收藏失败:", err);
          showToast(err instanceof Error ? err.message : String(err), "error");
        }
      })();
      return;
    }
    setFavDraft({ text: src, translation: translationResult.translatedText });
  }, [translationResult, favActive, showToast, t]);

  const [sidebarTab, setSidebarTab] = useState<ViewTab>("translate");
  const [text, setText] = useState("");
  const [sourceLang, setSourceLang] = useState<Language>("en");
  const [currentEngine, setCurrentEngine] = useState<string>("");

  const [engines, setEngines] = useState<EngineChip[]>([]);
  // 引擎列表可被设置页增/删，抽成可重入的加载函数（挂载加载 + 设置页变更后刷新）
  const loadEngines = useCallback(() => {
    listApiKeys()
      .then((keys) => {
        setEngines(keys.map((k) => ({ service: k.service_name, label: k.display_name })));
      })
      .catch((err: unknown) => {
        console.error("[App] 引擎列表加载失败:", err);
        setEngines([]);
      });
  }, []);
  useEffect(loadEngines, [loadEngines]);

  // 未选引擎或所选引擎已被删除时重新取默认（keys 非空自动选第一个，对齐 src 语义）
  useEffect(() => {
    if (engines.length === 0) {
      if (currentEngine) setCurrentEngine("");
      return;
    }
    if (!currentEngine || !engines.some((e) => e.service === currentEngine)) {
      const def = settings.translation.defaultEngine;
      setCurrentEngine(def && engines.some((e) => e.service === def) ? def : engines[0].service);
    }
  }, [currentEngine, engines, settings.translation.defaultEngine]);

  const handleTranslate = async (input: string, from: Language, to: Language) => {
    setDictEntry(null);
    setDictError(null);
    await translateAndApply(input, from, to, currentEngine || "google");
    setSourceLang(from);
  };

  const handleHistorySelect = (item: TranslationResult) => {
    // 对齐 src：回填输入 + 结果直接展示 + 引擎贴合该记录
    setTranslationResult(item);
    setText(item.sourceText);
    setSourceLang(item.sourceLang);
    setCurrentEngine(item.engine);
    setDictEntry(null);
    setDictError(null);
    // 对齐 src：点击历史后切回主页展示回填结果
    setSidebarTab("translate");
  };

  // 右侧输入框联动: 单词 → 查词典显示释义; 段落 → 翻译（对齐 src handleDictTranslate 判词规则）
  const handleDictLookup = async (input: string) => {
    const tt = input.trim();
    if (!tt) return;
    const isWord = tt.length <= 32 && /^[a-zA-Z']+$/.test(tt);
    if (!isWord) {
      await translateAndApply(tt, sourceLang, "zh", currentEngine || "google", { silent: true });
      return;
    }
    if (activeDict === null) {
      setDictError(t("app.selectDictFirst"));
      return;
    }
    setDictLoading(true);
    setDictError(null);
    try {
      const result = await dictLookup<DictEntry>(tt, activeDict);
      if (result.found && result.entry) {
        setDictEntry(result.entry);
      } else {
        setDictEntry(null);
        setDictError(t("app.wordNotFound", { word: tt }));
      }
    } catch (err) {
      setDictEntry(null);
      setDictError(`查询失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDictLoading(false);
    }
  };

  /* ---------- 最近历史条带数据（随 historyVersion 刷新） ---------- */
  const [recent, setRecent] = useState<TranslationResult[]>([]);
  useEffect(() => {
    let alive = true;
    getTranslations()
      .then((rows) => {
        if (alive) setRecent(rows.map(mapRecordToUi).slice(0, 5));
      })
      .catch((err: unknown) => {
        console.error("[App] 最近历史加载失败:", err);
      });
    return () => {
      alive = false;
    };
  }, [historyVersion]);

  if (dbError) {
    return (
      <div className="grid h-full w-full place-items-center bg-bg text-ink">
        <div className="text-center">
          <p className="text-sm font-medium text-red">{t("boot.dbError")}</p>
          <p className="mt-1 text-xs text-ink-3">{dbError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full bg-bg pt-7 text-ink">
      {/* 自绘标题栏：绝对定位铺满顶部（TitleBar 内部自带 absolute），pt-7 为其预留 28px。
          用绝对定位而非多包一层 flex，是为了不给下面 ~170 行 JSX 引入无谓缩进变动。 */}
      <TitleBar />
      <Sidebar
        tab={sidebarTab}
        onTab={setSidebarTab}
        themeMode={themeMode}
        onTheme={(m) =>
          changeSettings({
            ...settings,
            appearance: { ...settings.appearance, theme: m },
          })
        }
      />

      {/* 舞台：全宽度单页单焦点（v2 去中栏）；设置页走非滚动容器（自身双栏、右列独立滚动） */}
      {sidebarTab === "settings" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <SettingsPanel
            settings={settings}
            onClose={() => setSidebarTab("translate")}
            onChange={changeSettings}
            onDictsRebuilt={loadDicts}
            onDictsRebuilding={setDictRebuilding}
            onEnginesChanged={loadEngines}
            onHistoryChanged={() => setHistoryVersion((v) => v + 1)}
          />
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {sidebarTab === "translate" && (
              <div className="rise-in mx-auto flex w-full max-w-[760px] flex-col px-6 py-10">
                {/* 页头：统一规格（语言 chip + 翻译标题）；最右侧=收藏入生词本（放大显眼） */}
                <PageHeader
                  icon={<LanguagesIcon size={16} />}
                  title={t("nav.home")}
                  right={
                    <button
                      onClick={handleFavClick}
                      disabled={!translationResult}
                      title={favActive ? t("action.unfavorite") : t("action.favorite")}
                      aria-label={favActive ? t("action.unfavorite") : t("action.favorite")}
                      aria-pressed={favActive}
                      className={`grid h-8 w-8 cursor-pointer place-items-center rounded-md transition-colors ${
                        !translationResult
                          ? "cursor-not-allowed opacity-40"
                          : favActive
                            ? "bg-gold/10 text-gold"
                            : "text-ink-3 hover:bg-hover hover:text-gold"
                      }`}
                    >
                      <StarIcon size={16} filled={favActive} />
                    </button>
                  }
                />

                {/* 授权故障横幅：未获「输入监控」时全局快捷键完全无反应，
                    提示必须放在主页（用户真正卡住的地方），设置页只负责改配置 */}
                <ShortcutPermBanner onGoToSettings={() => setSidebarTab("settings")} />

                {/* 一体化翻译卡（与页头留一档间距，对齐历史页节奏） */}
                <div className="mt-5">
                <TranslationInput
                  text={text}
                  onTextChange={setText}
                  onTranslate={handleTranslate}
                  loading={translationLoading}
                  sourceLang={sourceLang}
                  defaultSourceLang={settings.translation.defaultSourceLang}
                  defaultTargetLang={settings.translation.defaultTargetLang}
                />
                </div>

                {/* 芯片行：独立一档，仅引擎（单词查询去词典页，主页不混排） */}
                <TranslateChipsRow
                  engine={currentEngine}
                  engines={engines}
                  onEngineChange={setCurrentEngine}
                />

                {/* 结果区：回信卡（纯译文；词典条目走词典页）。
                    未翻译时用「最近翻译」条带填充结果区 —— 与背景一致无底板，
                    点击翻译后先显示"翻译中"，结果返回后被译文卡替换。 */}
                <div className="mt-5">
                  <TranslationResultPanel
                    result={translationResult}
                    error={translationError}
                    loading={translationLoading}
                    currentEngine={currentEngine}
                    idleContent={
                      recent.length > 0 ? (
                        <RecentStrip
                          recent={recent}
                          onPick={handleHistorySelect}
                        />
                      ) : undefined
                    }
                  />
                </div>
              </div>
            )}

            {sidebarTab === "history" && (
              <HistoryPanel
                key={`hist-${historyVersion}`}
                onSelect={handleHistorySelect}
                onStar={(r) =>
                  setFavDraft({ text: r.sourceText, translation: r.translatedText })
                }
              />
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
                onReorder={(ids) => {
                  setDicts((prev) => {
                    const map = new Map(prev.map((d) => [d.id, d]));
                    const next = ids.map((id) => map.get(id)).filter((d): d is DictInfo => !!d);
                    // 新增词典（重建后）按 id 补到尾部
                    for (const d of prev) if (!ids.includes(d.id)) next.push(d);
                    return next;
                  });
                  // 持久化：settings.dictOrder（后端 settings_store 为 JSON 透传）
                  saveSettings({
                    ...settings,
                    dictOrder: ids,
                  }).catch((err: unknown) => console.error("[App] 词典顺序保存失败:", err));
                }}
                dicts={dicts}
                activeDict={activeDict}
                hasDb={dictHasDb}
                rebuilding={dictRebuilding}
                buildingId={dictBuildingId}
                buildProgress={0}
                onSelect={(id) => setActiveDict(id)}
                onBuild={handleDictBuild}
                entry={dictEntry}
                entryLoading={dictLoading}
                entryError={dictError}
                onLookup={handleDictLookup}
                onCloseEntry={() => setDictEntry(null)}
                onFavoriteEntry={(word) =>
                  setFavDraft({
                    text: word,
                    // 释义取当前词条的 definition 原文（若为空回退为词条名）
                    translation: dictEntry?.definition?.trim() || word,
                  })
                }
              />
            )}
          </div>

          {/* footer 声明区 */}
          <footer className="flex h-8 shrink-0 items-center gap-2 border-t border-line px-4 text-[10px] text-ink-3">
            <span>{t("footer.notice")}</span>
          </footer>
        </div>
      )}

      {/* 收藏入生词本弹窗（详情展开 + 分组选择 + 就地新建组）：
          absolute inset-0 相对根容器定位，整窗铺满遮罩 */}
      {favDraft && (
        <SaveToVocabDialog
          text={favDraft.text}
          translation={favDraft.translation}
          onClose={() => setFavDraft(null)}
          onSaved={() => {
            // 收藏成功：立即点亮按钮（金色填充）
            setFavActive(true);
            setFavCheckToken((n) => n + 1);
            showToast(t("toast.addedToVocab"), "success");
          }}
        />
      )}
    </div>
  );
}

export default App;

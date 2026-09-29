/**
 * 生词本页 — v2 重设计：整页分组画布（单页单焦点）
 *
 * 视觉：preview 组胶囊行（建组 6 色/删组 confirm）+ 词条大卡网格。
 * 数据：src 业务层 —— Store 六命令（async invoke）+ toast 反馈。
 */
import { useEffect, useMemo, useState } from "react";
import { store } from "@/storage";
import type { VocabularyGroup, VocabularyWord } from "@/types/vocabulary";
import { UI_LOCALE_TAGS, useAppLocale } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { NotebookIcon, XIcon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/Misc";

/** 组色取色器 6 色（对齐 src 预置调色板） */
const GROUP_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e",
  "#f59e0b", "#8b5cf6", "#ec4899",
];

interface VocabularyPanelProps {
  /** 把生词词送进主输入区并跳回主页 */
  onWordPick?: (word: string) => void;
}

export function VocabularyPanel({ onWordPick }: VocabularyPanelProps) {
  const { t, locale } = useAppLocale();
  const localeTag = UI_LOCALE_TAGS[locale];
  const { showToast } = useToast();
  const [groups, setGroups] = useState<VocabularyGroup[]>([]);
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | "all">("all");
  // 建组内嵌表单
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0]);
  // 加词内嵌表单
  const [showWordForm, setShowWordForm] = useState(false);
  const [wordText, setWordText] = useState("");
  const [wordTrans, setWordTrans] = useState("");
  const [wordPhon, setWordPhon] = useState("");
  const [wordExample, setWordExample] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([store.getVocabularyGroups(), store.getVocabularyWords()])
      .then(([g, w]) => {
        if (alive) {
          setGroups(g);
          setWords(w);
        }
      })
      .catch((err: unknown) => {
        console.error("[VocabularyPanel] 加载数据失败:", err);
      });
    return () => {
      alive = false;
    };
  }, []);

  const visible = useMemo(
    () => (selectedGroup === "all" ? words : words.filter((w) => w.groupId === selectedGroup)),
    [words, selectedGroup],
  );
  const groupOf = (id: string) => groups.find((g) => g.id === id);

  const createGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    store
      .addVocabularyGroup(name, newGroupColor)
      .then((id) => Promise.all([store.getVocabularyGroups(), Promise.resolve(id)]))
      .then(([gs, id]) => {
        setGroups(gs);
        setSelectedGroup(id);
        setShowGroupForm(false);
        setNewGroupName("");
        showToast(t("toast.groupCreated", { name }), "success");
      })
      .catch((err: unknown) => {
        console.error("[VocabularyPanel] 创建词组失败:", err);
      });
  };

  const removeGroup = (g: VocabularyGroup) => {
    if (!window.confirm(t("vocab.deleteGroupConfirm", { name: g.name }))) return;
    store
      .deleteVocabularyGroup(g.id)
      .then(() => Promise.all([store.getVocabularyGroups(), store.getVocabularyWords()]))
      .then(([gs, ws]) => {
        setGroups(gs);
        setWords(ws);
        if (selectedGroup === g.id) setSelectedGroup("all");
        showToast(t("toast.groupDeleted"), "success");
      })
      .catch((err: unknown) => {
        console.error("[VocabularyPanel] 删除词组失败:", err);
      });
  };

  const createWord = () => {
    if (!wordText.trim() || !wordTrans.trim()) {
      showToast(t("toast.wordRequireBoth"), "error");
      return;
    }
    if (selectedGroup === "all") {
      showToast(t("toast.pickGroupFirst"), "error");
      return;
    }
    store
      .addVocabularyWord(
        wordText.trim(),
        wordTrans.trim(),
        selectedGroup,
        wordPhon.trim() || undefined,
        wordExample.trim() || undefined,
      )
      .then(() => store.getVocabularyWords())
      .then((ws) => {
        setWords(ws);
        setShowWordForm(false);
        setWordText("");
        setWordTrans("");
        setWordPhon("");
        setWordExample("");
        showToast(t("toast.wordAdded"), "success");
      })
      .catch((err: unknown) => {
        console.error("[VocabularyPanel] 添加词条失败:", err);
      });
  };

  const removeWord = (id: string) => {
    store
      .deleteVocabularyWord(id)
      .then(() => store.getVocabularyWords())
      .then(setWords)
      .catch((err: unknown) => {
        console.error("[VocabularyPanel] 删除词条失败:", err);
      });
  };

  /** 组胶囊公共口径 */
  const pillClass = (active: boolean) =>
    `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs transition-colors ${
      active
        ? "bg-accent text-accent-fg"
        : "border border-line bg-bg-elevated text-ink-2 hover:bg-hover hover:text-ink"
    }`;

  return (
    <div className="mx-auto flex h-full w-full max-w-[920px] flex-col px-8 py-10">
      {/* 页头：统一规格（图标 chip + 标题 + 计数 + 副说明 + 右侧主操作） */}
      <PageHeader
        icon={<NotebookIcon size={16} />}
        title={t("vocab.title")}
        hint={t("vocab.pageHint")}
        right={
          <>
            <span className="mr-3">
              {t("vocab.stats", { words: words.length, groups: groups.length })}
            </span>
            <button
              onClick={() => setShowGroupForm((v) => !v)}
              className="flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-xs text-ink-2 transition-colors hover:border-accent/50 hover:text-accent"
            >
              {t("vocab.newGroup")}
            </button>
          </>
        }
      />

      {/* 组胶囊行 */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSelectedGroup("all")}
          className={pillClass(selectedGroup === "all")}
        >
          {t("common.all")} <span className="opacity-70">{words.length}</span>
        </button>
        {groups.map((g) => {
          const active = selectedGroup === g.id;
          const count = words.filter((w) => w.groupId === g.id).length;
          return (
            <span key={g.id} className="group relative inline-flex">
              <button onClick={() => setSelectedGroup(g.id)} className={pillClass(active)}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.color }} />
                {g.name} <span className="opacity-70">{count}</span>
              </button>
              {/* 删组：hover 出现的角标 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeGroup(g);
                }}
                title={t("vocab.deleteGroupTitle")}
                className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full border border-line bg-bg-elevated text-ink-3 opacity-0 shadow-sm transition-all group-hover:opacity-100 focus-visible:opacity-100 hover:text-red"
              >
                <XIcon size={8} />
              </button>
            </span>
          );
        })}
      </div>

      {/* 建组表单卡 */}
      {showGroupForm && (
        <div className="rise-in mt-3 rounded-xl border border-line bg-bg-elevated p-3.5 shadow-[var(--shadow-card)]">
          <input
            autoFocus
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createGroup();
            }}
            placeholder={t("vocab.groupNamePh")}
            className="h-9 w-full rounded-lg border border-line bg-bg px-3 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
          />
          <div className="mt-2.5 flex items-center gap-1.5">
            <span className="text-[11px] text-ink-3">{t("vocab.color")}</span>
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewGroupColor(c)}
                title={c}
                aria-label={t("vocab.colorAria", { color: c })}
                className={`h-4 w-4 rounded-full transition-transform ${
                  newGroupColor === c
                    ? "scale-110 ring-2 ring-line-strong ring-offset-1 ring-offset-bg-elevated"
                    : "hover:scale-110"
                }`}
                style={{ background: c }}
              />
            ))}
            <button
              onClick={() => setShowGroupForm(false)}
              className="ml-auto h-7 rounded-md border border-line px-3 text-[11px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={createGroup}
              className="ml-auto h-7 rounded-md bg-accent px-3 text-[11px] text-accent-fg transition-colors hover:bg-accent-hover"
            >
              {t("common.create")}
            </button>
          </div>
        </div>
      )}

      {/* 加词入口 */}
      <div className="mt-4">
        <button
          onClick={() => setShowWordForm((v) => !v)}
          className="flex h-10 w-full items-center justify-center gap-1 rounded-xl border border-dashed border-line text-xs text-ink-2 transition-colors hover:border-accent/50 hover:text-accent"
        >
          {selectedGroup !== "all" ? t("vocab.addWordToGroup") : t("vocab.addWordNoGroup")}
        </button>
      </div>

      {/* 加词表单 */}
      {showWordForm && (
        <div className="rise-in mt-2.5 rounded-xl border border-line bg-bg-elevated p-3.5 shadow-[var(--shadow-card)]">
          <input
            autoFocus
            value={wordText}
            onChange={(e) => setWordText(e.target.value)}
            placeholder={t("vocab.wordPh")}
            className="h-9 w-full rounded-lg border border-line bg-bg px-3 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
          />
          <input
            value={wordTrans}
            onChange={(e) => setWordTrans(e.target.value)}
            placeholder={t("vocab.defPh")}
            className="mt-1.5 h-9 w-full rounded-lg border border-line bg-bg px-3 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
          />
          <div className="mt-1.5 flex gap-1.5">
            <input
              value={wordPhon}
              onChange={(e) => setWordPhon(e.target.value)}
              placeholder={t("vocab.phoneticPh")}
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
            <input
              value={wordExample}
              onChange={(e) => setWordExample(e.target.value)}
              placeholder={t("vocab.examplePh")}
              className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-xs italic text-ink placeholder:not-italic placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
          </div>
          <button
            onClick={createWord}
            className="mt-2.5 h-8 w-full rounded-lg bg-accent text-xs text-accent-fg transition-colors hover:bg-accent-hover"
          >
            {t("vocab.addWordTo", {
              group: selectedGroup !== "all" ? groupOf(selectedGroup)?.name ?? "" : "",
            })}
          </button>
        </div>
      )}

      {/* 词条大卡网格 */}
      <div className="mt-5 min-h-0 flex-1 overflow-y-auto pb-10">
        {visible.length === 0 ? (
          <div className="min-h-60 rounded-xl border border-dashed border-line">
            <EmptyState
              icon={<NotebookIcon size={38} />}
              title={words.length === 0 ? t("vocab.emptyAll") : t("vocab.emptyGroup")}
              hint={words.length === 0 ? t("vocab.emptyAllHint") : undefined}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((w) => {
              const g = groupOf(w.groupId);
              return (
                <div
                  key={w.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onWordPick?.(w.word)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onWordPick?.(w.word);
                  }}
                  title={t("vocab.sendToInput")}
                  className="group relative flex cursor-pointer flex-col rounded-xl border border-line bg-bg-elevated px-4 py-3.5 shadow-[var(--shadow-card)] outline-none transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[var(--shadow-lift)] focus-visible:border-accent"
                >
                  {/* hover 删除通道 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeWord(w.id);
                    }}
                    title={t("vocab.deleteWord")}
                    className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-md opacity-0 transition-all group-hover:opacity-100 focus-visible:opacity-100 hover:bg-hover hover:text-red"
                  >
                    <XIcon size={11} />
                  </button>

                  <div className="flex items-baseline gap-2">
                    {g && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 self-center rounded-full"
                        style={{ background: g.color }}
                        title={g.name}
                      />
                    )}
                    <span className="font-display text-lg text-ink">{w.word}</span>
                    {w.phonetic && (
                      <span className="min-w-0 truncate font-mono text-[10px] text-ink-3">
                        {w.phonetic}
                      </span>
                    )}
                    {w.reviewCount >= 5 && (
                      <span className="rounded bg-gold-soft px-1.5 py-0.5 text-[10px] font-medium text-gold">
                        {t("vocab.mastery")}
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 text-sm leading-6 text-ink">{w.translation}</p>

                  {w.example && (
                    <p className="mt-1.5 line-clamp-2 border-l-2 border-line pl-2.5 text-xs italic leading-5 text-ink-3">
                      {w.example}
                    </p>
                  )}

                  <p className="mt-2 text-[10px] text-ink-3">
                    {t("vocab.reviewCount", { count: w.reviewCount })}
                    {w.lastReviewedAt
                      ? t("vocab.lastReviewed", {
                          date: new Date(w.lastReviewedAt).toLocaleDateString(localeTag, {
                            month: "numeric",
                            day: "numeric",
                          }),
                        })
                      : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

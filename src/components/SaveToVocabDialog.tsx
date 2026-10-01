/**
 * 收藏入生词本弹窗 — 展开展示词/句详情（原文+译文），选择目标分组，支持就地快速新建组。
 *
 * 数据源：storage/index.ts 的 getVocabularyGroups / addVocabularyGroup / addVocabularyWord。
 * 快速建组：分组 chips 区尾部「＋ 新建组」按钮 → 就地展开建组表单（沿用 VocabularyPanel 调色板/键位）。
 * 默认分组语义由调用方保证（无任何分组时自动建「默认分组」）。
 * onSaved：保存成功后回调（宿主据此刷新收藏态按钮），随后自动关闭。
 */
import { useEffect, useState } from "react";
import type { VocabularyGroup } from "@/types/vocabulary";
import { addVocabularyWord, getVocabularyGroups, ensureDefaultGroup, addVocabularyGroup } from "@/storage/index";
import { useAppLocale } from "@/lib/i18n";
import { BookIcon, XIcon } from "@/components/icons";

/** 组色取色器 6 色（与 VocabularyPanel 一致） */
const GROUP_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e",
  "#f59e0b", "#8b5cf6", "#ec4899",
];

interface SaveToVocabDialogProps {
  /** 要收藏的原文（词或句） */
  text: string;
  /** 译文（详情区展示并作为释义存入） */
  translation: string;
  onClose: () => void;
  /** 保存成功回调（宿主刷新收藏态）；不传则仅关闭 */
  onSaved?: () => void;
}

export function SaveToVocabDialog({ text, translation, onClose, onSaved }: SaveToVocabDialogProps) {
  const { t } = useAppLocale();
  const [groups, setGroups] = useState<VocabularyGroup[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [notice, setNotice] = useState<string | null>(null);
  /** 快速新建组：表单开合 + 名称 + 颜色 */
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // 挂载：取分组；无任何分组时自动建「默认分组」（内容收藏的总兜底组，Rust 侧幂等不重复建）
  useEffect(() => {
    void (async () => {
      await ensureDefaultGroup(t("vocab.defaultGroup"));
      const list = await getVocabularyGroups();
      // 同名分组只保留最早创建的一个（历史竞态可能留下重复的「默认分组」）
      const seen = new Set<string>();
      const deduped = list.filter((g) => {
        if (seen.has(g.name)) return false;
        seen.add(g.name);
        return true;
      });
      setGroups(deduped);
      if (deduped.length > 0) setSelected(deduped[0].id);
    })().catch((err) => console.error("[SaveToVocab] 分组加载失败:", err));
  }, []);

  /** 就地快速新建组：建成功后刷新列表并自动选中新组 */
  const createGroup = async () => {
    const name = newGroupName.trim();
    if (!name || creatingGroup) return;
    setCreatingGroup(true);
    setNotice(null);
    try {
      const id = await addVocabularyGroup(name, newGroupColor);
      const list = await getVocabularyGroups();
      setGroups(list);
      setSelected(id);
      setNewGroupName("");
      setShowGroupForm(false);
    } catch (err) {
      console.error("[SaveToVocab] 新建分组失败:", err);
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingGroup(false);
    }
  };

  const onSave = async () => {
    if (!text.trim() || !selected) return;
    try {
      await addVocabularyWord(text.trim(), translation.trim(), selected);
      onSaved?.();
      onClose();
    } catch (err) {
      console.error("[SaveToVocab] 保存失败:", err);
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-black/25 backdrop-blur-[2px]"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("vocab.saveTitle")}
        className="rise-in w-[420px] rounded-xl border border-line bg-bg-elevated p-5 shadow-[var(--shadow-popup)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h4 className="font-display text-base font-semibold text-ink">{t("vocab.saveTitle")}</h4>
          <button
            onClick={onClose}
            title={t("common.close")}
            className="grid h-6 w-6 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <XIcon size={13} />
          </button>
        </div>

        {/* 详情区：原文 + 译文 */}
        <div className="mt-3 rounded-lg bg-bg-inset px-3 py-2.5">
          <p className="text-sm text-ink">{text}</p>
          <p className="mt-1 text-xs leading-5 text-ink-2">{translation}</p>
        </div>

        {/* 分组选择 chips + 快速新建组入口 */}
        {groups === null ? (
          <p className="mt-4 text-xs text-ink-3">{t("common.loading")}</p>
        ) : (
          <div className="mt-4">
            <p className="text-[11px] text-ink-3">{t("vocab.pickGroup")}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelected(g.id)}
                  aria-pressed={selected === g.id}
                  className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors ${
                    selected === g.id
                      ? "border-transparent bg-accent text-accent-fg"
                      : "border-line text-ink-2 hover:bg-hover hover:text-ink"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
                  {g.name}
                </button>
              ))}
              {/* 快速新建组入口 */}
              <button
                onClick={() => setShowGroupForm((v) => !v)}
                aria-expanded={showGroupForm}
                className="flex h-7 items-center gap-1 rounded-full border border-dashed border-line px-2.5 text-xs text-ink-3 transition-colors hover:border-accent/50 hover:text-accent"
              >
                {t("vocab.newGroup")}
              </button>
            </div>

            {/* 就地建组表单（与生词本页同款：名称 + 6 色取色 + 取消/创建） */}
            {showGroupForm && (
              <div className="rise-in mt-2.5 rounded-lg border border-line bg-bg-inset p-3">
                <input
                  autoFocus
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createGroup();
                  }}
                  placeholder={t("vocab.groupNamePh")}
                  className="h-8 w-full rounded-lg border border-line bg-bg px-3 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                />
                <div className="mt-2 flex items-center gap-1.5">
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
                    disabled={!newGroupName.trim() || creatingGroup}
                    className="h-7 rounded-md bg-accent px-3 text-[11px] text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("common.create")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {notice && <p className="mt-2 text-xs text-red">{notice}</p>}

        <div className="mt-5 flex justify-end gap-1.5">
          <button
            onClick={onClose}
            className="h-8 rounded-md border border-line px-3 text-xs text-ink-2 transition-colors hover:bg-hover"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onSave}
            disabled={!selected}
            title={t("vocab.saveTo")}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-4 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <BookIcon size={13} />
            {t("vocab.saveTo")}
          </button>
        </div>
      </div>
    </div>
  );
}

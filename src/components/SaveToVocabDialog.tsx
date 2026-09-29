/**
 * 收藏入生词本弹窗 — 展开展示词/句详情（原文+译文），同时选择目标分组。
 *
 * 数据源：storage/index.ts 的 getVocabularyGroups / addVocabularyWord。
 * 无新建组——组管理在生词本页；默认分组语义由调用方保证（无任何分组时自动建「默认分组」）。
 */
import { useEffect, useState } from "react";
import type { VocabularyGroup } from "@/types/vocabulary";
import { addVocabularyWord, getVocabularyGroups, ensureDefaultGroup } from "@/storage/index";
import { useAppLocale } from "@/lib/i18n";
import { BookIcon, XIcon } from "@/components/icons";


interface SaveToVocabDialogProps {
  /** 要收藏的原文（词或句） */
  text: string;
  /** 译文（详情区展示并作为释义存入） */
  translation: string;
  onClose: () => void;
}

export function SaveToVocabDialog({ text, translation, onClose }: SaveToVocabDialogProps) {
  const { t } = useAppLocale();
  const [groups, setGroups] = useState<VocabularyGroup[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [notice, setNotice] = useState<string | null>(null);

  // 挂载：取分组；无任何分组时自动建「默认分组」（内容收藏的总兜底组）
  useEffect(() => {
    void (async () => {
      await ensureDefaultGroup(t("vocab.defaultGroup"));
      const list = await getVocabularyGroups();
      setGroups(list);
      if (list.length > 0) setSelected(list[0].id);
    })().catch((err) => console.error("[SaveToVocab] 分组加载失败:", err));
  }, []);

  const onSave = async () => {
    if (!text.trim() || !selected) return;
    try {
      await addVocabularyWord(text.trim(), translation.trim(), selected);
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

        {/* 分组选择 chips */}
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
            </div>
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

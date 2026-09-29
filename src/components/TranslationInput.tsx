/**
 * 一体化翻译卡 — v2 重设计（主页核心卡，职责收敛：纯句子翻译）
 *
 * 视觉：bg-elevated 圆角大卡，无内框的大号 textarea，卡内底部同一行 =
 * 源/目标语言 + 互换 + TTS + 字数 +「翻译」主按钮。
 * 行为：Enter 恒翻译（单词查询职责移交词典页，主页不做判词分流）。
 */
import { useState } from "react";
import type { Language } from "@/types/translation";
import { SUPPORTED_LANGUAGES } from "@/types/translation";
import { useAppLocale } from "@/lib/i18n";
import { Select } from "@/components/ui/Misc";
import { TTSButton } from "@/components/TTSButton";

export interface EngineChip {
  service: string;
  label: string;
}

interface TranslationInputProps {
  text: string;
  onTextChange: (text: string) => void;
  /** 段落翻译（App 内部负责加载/结果/落历史） */
  onTranslate: (text: string, sourceLang: Language, targetLang: Language) => void;
  loading: boolean;
  /** TTS 的源语言（历史回填时 App 更新） */
  sourceLang: Language;
  defaultSourceLang?: Language;
  defaultTargetLang?: Language;
}

/** 语言互换图标 */
function SwapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3 4 7l4 4" />
      <path d="M4 7h16" />
      <path d="m16 21 4-4-4-4" />
      <path d="M20 17H4" />
    </svg>
  );
}

export function TranslationInput({
  text, onTextChange, onTranslate,
  loading, sourceLang,
  defaultSourceLang = "en", defaultTargetLang = "zh",
}: TranslationInputProps) {
  const { t } = useAppLocale();
  const [sourceLangLocal, setSourceLangLocal] = useState<Language>(defaultSourceLang);
  const [targetLangLocal, setTargetLangLocal] = useState<Language>(defaultTargetLang);

  /** 主页职责收敛：Enter 恒翻译（单词查询走词典页，不在主页分流） */
  const run = () => {
    const s = text.trim();
    if (!s || loading) return;
    onTranslate(s, sourceLangLocal, targetLangLocal);
  };

  const swap = () => {
    const prev = sourceLangLocal;
    setSourceLangLocal(targetLangLocal);
    setTargetLangLocal(prev);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      run();
    }
  };

  return (
    <div className="rise-in rounded-xl border border-line bg-bg-elevated shadow-[var(--shadow-card)]">
      {/* 大号输入区（无内框） */}
      <textarea
        value={text}
        rows={4}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={onKey}
        placeholder={t("input.placeholder")}
        className="block w-full resize-none bg-transparent px-6 pb-2 pt-5 text-[18px] leading-8 text-ink outline-none placeholder:text-ink-3"
      />

      {/* 卡内底部同一行：语言对 + 互换 + 主按钮 */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-4 py-2.5">
        <Select
          aria-label={t("input.sourceLang")}
          value={sourceLangLocal}
          onChange={(e) => setSourceLangLocal(e.target.value as Language)}
          className="h-7 border-none bg-transparent pr-6 text-xs text-ink-2 hover:bg-hover"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.name}</option>
          ))}
        </Select>
        <button
          onClick={swap}
          title={t("input.swap")}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-accent"
        >
          <SwapIcon />
        </button>
        <Select
          aria-label={t("input.targetLang")}
          value={targetLangLocal}
          onChange={(e) => setTargetLangLocal(e.target.value as Language)}
          className="h-7 border-none bg-transparent pr-6 text-xs text-ink-2 hover:bg-hover"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.name}</option>
          ))}
        </Select>

        <TTSButton text={text} lang={sourceLang} />

        <span className="ml-auto text-[11px] text-ink-3">
          {t("input.charCount", { count: text.length })}
        </span>
        <button
          onClick={run}
          disabled={!text.trim() || loading}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-medium text-accent-fg shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? t("common.translating") : t("common.translate")}
          <kbd className="hidden rounded border border-white/25 px-1 text-[10px] font-normal sm:inline">↵</kbd>
        </button>
      </div>
    </div>
  );
}

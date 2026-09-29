/**
 * 归拢翻译流程状态（对齐 src/hooks/useTranslationState.ts）
 *
 * translateAndApply 成功后 bump historyVersion，
 * 调用方用 `key={historyVersion}` 强制 remount 历史列表（刷新数据）。
 */
import { useState } from "react";
import type { Language, TranslationRecord, TranslationResult } from "@/lib/types";
import { mockTranslate } from "@/mock/engine";
import { saveTranslation } from "@/mock/store";

export type EngineLike = string;

export interface TranslationState {
  result: TranslationResult | null;
  loading: boolean;
  error: string | null;
  historyVersion: number;
}

export function useTranslationState() {
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  /**
   * 翻译并落历史。
   * silent: 词典联动翻译用 —— 失败不弹错误（静默）。
   */
  async function translateAndApply(
    text: string,
    sourceLang: TranslationRecord["source_lang"],
    targetLang: TranslationRecord["target_lang"],
    engine: TranslationResult["engine"],
    opts?: { silent?: boolean },
  ): Promise<TranslationResult | null> {
    const sourceText = text.trim();
    if (!sourceText) return null;
    setLoading(true);
    setError(null);
    try {
      const res = await mockTranslate(
        sourceText,
        sourceLang as Language,
        targetLang as Language,
        engine,
      );
      // 记入 mock 历史（与 src 的 translate_history_cmd 对齐）
      const rec: TranslationRecord = {
        id: res.id,
        source_text: res.sourceText,
        translated_text: res.translatedText,
        source_lang: res.sourceLang,
        target_lang: res.targetLang,
        engine: res.engine,
        timestamp: res.timestamp,
        favorite: 0,
      };
      saveTranslation(rec);
      setResult(res);
      setHistoryVersion((v) => v + 1);
      return res;
    } catch (e) {
      if (!opts?.silent) {
        setError(e instanceof Error ? e.message : String(e));
      }
      return null;
    } finally {
      setLoading(false);
    }
  }

  /** errorResult：失败占位（不落历史），对齐 src/storage/translation.ts */
  function attachErrorResult(text: string, engine: string) {
    setError(null);
    setResult({
      id: "error",
      sourceText: text,
      translatedText: "",
      sourceLang: "en",
      targetLang: "zh",
      engine,
      timestamp: Date.now(),
      favorite: false,
    });
  }

  return {
    result,
    setResult,
    loading,
    setLoading,
    error,
    setError,
    historyVersion,
    setHistoryVersion,
    translateAndApply,
    attachErrorResult,
  };
}

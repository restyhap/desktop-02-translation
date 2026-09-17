import { useCallback, useState } from "react";
import { translateAndSave } from "@/storage/translation";
import type { Language, TranslationEngine, TranslationResult } from "@/types/translation";

/**
 * 翻译流程状态归拢：结果 / 加载 / 错误 / 历史版本号 + 统一执行函数
 * ponytail: 只归拢 App 翻译主流程所需状态；currentEngine 与输入/词典/历史选择交叉引用，
 *           抽入会导致 props 穿透，暂留在宿主组件。若第二入口复用此 hook 再加。
 */
export function useTranslationState() {
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  const translateAndApply = useCallback(
    async (
      text: string,
      sourceLang: Language,
      targetLang: Language,
      engine: TranslationEngine,
      opts?: { silent?: boolean }
    ) => {
      setLoading(true);
      if (!opts?.silent) setError(null);
      try {
        const r = await translateAndSave(text, sourceLang, targetLang, engine);
        setResult(r);
        setHistoryVersion((v) => v + 1);
      } catch (err) {
        console.error("[translation] 翻译失败:", err);
        if (!opts?.silent) setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { result, setResult, loading, error, setError, historyVersion, setHistoryVersion, translateAndApply };
}
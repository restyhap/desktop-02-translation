import { invoke } from "@tauri-apps/api/core";
import type { Language, TranslationEngine } from "@/types/translation";

export interface TranslationResult {
  text: string;
  source_lang: string;
  target_lang: string;
  engine: string;
}

/**
 * 调用翻译 API
 * @param text 要翻译的文本
 * @param sourceLang 源语言
 * @param targetLang 目标语言
 * @param engine 翻译引擎
 */
export async function translate(
  text: string,
  sourceLang: Language,
  targetLang: Language,
  engine: TranslationEngine
): Promise<TranslationResult> {
  return invoke("translate_cmd", {
    text,
    sourceLang,
    targetLang,
    engine,
  });
}

/**
 * 检查是否已配置 API Key
 */
export async function hasApiKey(engine: TranslationEngine): Promise<boolean> {
  try {
    const key = await invoke("get_api_key_cmd", { service: engine });
    return !!key;
  } catch {
    return false;
  }
}

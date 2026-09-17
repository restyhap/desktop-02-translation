import { invoke } from "@tauri-apps/api/core";
import type { Language, TranslationEngine, TranslationRecord, TranslationResult } from "@/types/translation";
import { saveTranslationHistory } from "@/storage";

/** translate_cmd 的原始响应（Rust 端 shape） */
export interface ApiTranslateResult {
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
): Promise<ApiTranslateResult> {
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

/**
 * 翻译并写入历史（translate + saveTranslationHistory 的组合）
 * @returns UI 形态的 TranslationResult（id 与历史记录一致）
 */
export async function translateAndSave(
  text: string,
  sourceLang: Language,
  targetLang: Language,
  engine: TranslationEngine
): Promise<TranslationResult> {
  const apiResult = await translate(text, sourceLang, targetLang, engine);
  const record: TranslationRecord = {
    id: crypto.randomUUID(),
    source_text: text,
    translated_text: apiResult.text,
    source_lang: apiResult.source_lang,
    target_lang: apiResult.target_lang,
    engine: apiResult.engine,
    timestamp: Date.now(),
    favorite: 0,
  };
  await saveTranslationHistory(record);
  return mapRecordToUi(record);
}

/** history/vocabulary Record → UI TranslationResult 的共享映射 */
export function mapRecordToUi(record: TranslationRecord): TranslationResult {
  return {
    id: record.id,
    sourceText: record.source_text,
    translatedText: record.translated_text,
    sourceLang: record.source_lang as TranslationResult["sourceLang"],
    targetLang: record.target_lang as TranslationResult["targetLang"],
    engine: record.engine,
    timestamp: record.timestamp,
    favorite: record.favorite === 1,
  };
}

/** 翻译失败时的占位 result（UI 直接展示，不落历史） */
export function errorResult(
  text: string,
  engine: TranslationEngine,
  sourceLang: Language = "en",
  targetLang: Language = "zh"
): TranslationResult {
  return {
    id: Date.now().toString(),
    sourceText: text,
    translatedText: "翻译失败: 未知错误",
    sourceLang,
    targetLang,
    engine,
    timestamp: Date.now(),
    favorite: false,
  };
}
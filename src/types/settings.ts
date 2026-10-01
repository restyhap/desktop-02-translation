import type { Language, TranslationEngine } from "./translation";

export interface AppSettings {
  general: GeneralSettings;
  translation: TranslationSettings;
  llm: LlmSettings;
  appearance: AppearanceSettings;
  shortcuts: ShortcutSettings;
  /** MOSS-TTS 语音参数（音色 + 播放参数，三处朗读共用） */
  tts: TtsSettings;
  /** 词典页 chips 显示顺序（id 列表；后端 settings_store 为 JSON 透传，可选字段） */
  dictOrder?: number[];
}

export interface LlmSettings {
  endpoint: string;
  apiKey: string;
}

export interface GeneralSettings {
  launchAtStartup: boolean;
  closeBehavior: "minimizeToTray" | "exit";
  language: "zh" | "en";
  /** 历史记录保存时效（天）；0 = 永久保留。过期非收藏记录在启动时与改设置时清理 */
  historyRetentionDays: number;
}

export interface TranslationSettings {
  defaultSourceLang: Language;
  defaultTargetLang: Language;
  defaultEngine: TranslationEngine;
  autoDetect: boolean;
  pasteToTranslate: boolean;
}

export interface AppearanceSettings {
  theme: "light" | "dark" | "system";
  fontSize: "small" | "medium" | "large";
  opacity: number;
  hideDelay: number;
}

export interface ShortcutSettings {
  translate: string;
  show_main: string;
}

/** MOSS-TTS 语音设置：音色 + 播放参数（语速/音调/音量） */
export interface TtsSettings {
  /** 内置音色名（18 个 preset 之一，默认 Junhao） */
  voice: string;
  /** 语速 0.5–2.0 */
  playbackRate: number;
  /** 音调 0.5–2.0（仅系统语音生效；MOSS 侧无模型层音调参数） */
  pitch: number;
  /** 音量 0–1 */
  volume: number;
}

/** 音色清单（Rust 侧 VOICES 同源；前端用于分组渲染与兜底） */
export interface TtsVoice {
  voice: string;
  group: string;
  display_name: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    launchAtStartup: false,
    closeBehavior: "minimizeToTray",
    language: "zh",
    historyRetentionDays: 30,
  },
  translation: {
    defaultSourceLang: "en",
    defaultTargetLang: "zh",
    defaultEngine: "google",
    autoDetect: true,
    pasteToTranslate: false,
  },
  appearance: {
    theme: "system",
    fontSize: "medium",
    opacity: 100,
    hideDelay: 5,
  },
  shortcuts: {
    translate: "⌘+C+C",
    show_main: "⌘+C+V",
  },
  llm: {
    endpoint: "",
    apiKey: "",
  },
  tts: {
    voice: "Junhao",
    playbackRate: 1.0,
    pitch: 1.0,
    volume: 1.0,
  },
};
import type { AppSettings } from "@/types/settings";

export const mockSettings: AppSettings = {
  general: {
    launchAtStartup: false,
    closeBehavior: "minimizeToTray",
    checkUpdates: true,
    language: "zh",
  },
  translation: {
    defaultSourceLang: "en",
    defaultTargetLang: "zh",
    defaultEngine: "google",
    autoDetect: true,
    pasteToTranslate: false,
    apiKeys: {
      google: "",
      deepl: "",
      baidu: "",
      youdao: "",
    },
  },
  appearance: {
    theme: "system",
    fontSize: "medium",
    opacity: 100,
    dictionaryDirectory: "",
    dictionaryOrder: [0, 1, 2, 3],
  },
  shortcuts: {
    translate: "Ctrl+C+C",
    showMain: "Ctrl+Shift+T",
  },
  llm: {
    endpoint: "",
    apiKey: "",
  },
};

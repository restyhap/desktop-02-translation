/**
 * Mock 事件总线 — 模拟 Tauri 的 `listen("show-translate")`
 *
 * 移植时：把 `onShowTranslate(cb)` 替换为
 * `getCurrentWindow().listen<...>("show-translate", cb)` 即可，组件零改动。
 */

export interface ShowTranslatePayload {
  text: string;
  cursorX: number;
  cursorY: number;
}

type Handler = (payload: ShowTranslatePayload) => void;

const handlers = new Set<Handler>();

export function onShowTranslate(cb: Handler): () => void {
  handlers.add(cb);
  return () => handlers.delete(cb);
}

/** 预览里手动派发划词事件（UI: 侧栏或主界面触发按钮） */
export function emitShowTranslate(text: string, cursorX = 0, cursorY = 0): void {
  const payload = { text, cursorX, cursorY };
  handlers.forEach((h) => h(payload));
}

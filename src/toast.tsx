/**
 * toast.tsx — 空剪贴板轻提示入口（独立透明小窗 label="toast"）
 *
 * Rust 侧剪贴板为空时：把本窗口左上角锚到光标处（圆角切点内退，与弹窗同口径）→ show → 约 1.2s 后 hide。
 * 本组件即窗口内容本体：铺满整个窗口（rounded-xl 与弹窗同款），保证「窗口左上角=胶囊圆角尖」；
 * 不抢焦点（focusable:false）、不与弹窗逻辑冲突；前端另在挂载时 hide 兜底（防状态恢复幽灵显示）。
 */
import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LocaleProvider, useAppLocale } from "./lib/i18n";
import "./styles.css";

document.documentElement.style.background = "transparent";
document.body.style.background = "transparent";
(document.getElementById("root") as HTMLElement).style.height = "100%";

function CenterToast() {
  const { t } = useAppLocale();

  // 生命周期完全由 Rust 侧控制：show() → 约 1.2s 后 hide()。
  // 前端侧兜底：挂载时强制隐藏一次，杜绝任何路径下（如历史窗口状态被恢复）
  // 出现「启动即显示、无人 hide」的幽灵 toast。
  useEffect(() => {
    const win = getCurrentWindow();
    win.hide().catch(() => {});
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none flex h-full w-full items-center justify-center rounded-xl border border-line bg-bg-elevated text-xs text-ink-2"
      style={{ opacity: 0.9 }}
    >
      {t("popup.toastEmpty")}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LocaleProvider>
      <CenterToast />
    </LocaleProvider>
  </React.StrictMode>
);

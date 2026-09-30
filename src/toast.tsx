/**
 * toast.tsx — 空剪贴板轻提示入口（独立透明小窗 label="toast"）
 *
 * Rust 侧剪贴板为空时：把本窗口左上角锚到光标处（圆角切点内退，与弹窗同口径）→ show → 约 1.1s 后 hide。
 * 本组件即窗口内容本体：铺满整个窗口（rounded-xl 与弹窗同款），保证「窗口左上角=胶囊圆角尖」；
 * 不抢焦点（focusable:false）、不与弹窗逻辑冲突。
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

  // 每次 Rust show 唤出后 1 秒自动隐藏（窗口本身 visible:false，安全兜底）
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    getCurrentWindow()
      .listen("show-toast", () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          getCurrentWindow().hide().catch(() => {});
        }, 1000);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      if (unlisten) unlisten();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none flex h-full w-full items-center justify-center rounded-xl border border-line bg-bg-elevated text-xs text-ink-2 shadow-[var(--shadow-popup)]"
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

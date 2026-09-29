/**
 * front-preview - 桌面翻译应用界面预览版
 *
 * 独立于主项目运行 (vite, port 1422)，数据来自本地 mock。
 * 移植方式：拷贝 src 下的 components/lib/styles.css，替换 @/mock 为真实 storage 调用。
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import { ToastProvider } from "@/components/ui/Toast";
import { LocaleProvider } from "@/lib/i18n";
import "@/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </LocaleProvider>
  </StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import TranslatePopup from "./TranslatePopup";
import { LocaleProvider } from "./lib/i18n";
import { ToastProvider } from "./components/ui/Toast";
import "./styles.css";

document.documentElement.style.background = "transparent";
document.body.style.background = "transparent";
// html/body/#root 高度撑满：resize 热区 absolute 定位依赖完整高度链，否则底边热区悬在内容中部
document.documentElement.style.height = "100%";
document.body.style.height = "100%";
(document.getElementById("root") as HTMLElement).style.height = "100%";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* 新增 Provider（弹窗 i18n 文案 + 复制 Toast）；透明窗口/高度链入口语义不变 */}
    <LocaleProvider>
      <ToastProvider>
        <TranslatePopup />
      </ToastProvider>
    </LocaleProvider>
  </React.StrictMode>
);

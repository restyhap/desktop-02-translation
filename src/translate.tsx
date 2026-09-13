import React from "react";
import ReactDOM from "react-dom/client";
import TranslatePopup from "./TranslatePopup";
import "./styles.css";

document.documentElement.style.background = "transparent";
document.body.style.background = "transparent";
// html/body/#root 高度撑满：resize 热区 absolute 定位依赖完整高度链，否则底边热区悬在内容中部
document.documentElement.style.height = "100%";
document.body.style.height = "100%";
(document.getElementById("root") as HTMLElement).style.height = "100%";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TranslatePopup />
  </React.StrictMode>
);

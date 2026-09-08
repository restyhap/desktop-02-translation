import React from "react";
import ReactDOM from "react-dom/client";
import TranslatePopup from "./TranslatePopup";
import "./styles.css";

document.documentElement.style.background = "transparent";
document.body.style.background = "transparent";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TranslatePopup />
  </React.StrictMode>
);

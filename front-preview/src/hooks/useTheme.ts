import { useEffect, useState } from "react";
import type { AppSettings } from "@/lib/types";

export type ThemeMode = AppSettings["appearance"]["theme"];

/**
 * 主题解析: light / dark / system
 * system → 跟随 prefers-color-scheme 媒体查询
 */
function resolved(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

/** 把解析后的主题写到 <html data-theme>，并返回当前生效值 */
export function useTheme(mode: ThemeMode): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() => resolved(mode));

  useEffect(() => {
    const next = resolved(mode);
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, [mode]);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const next = e.matches ? "dark" : "light";
      setTheme(next);
      document.documentElement.dataset.theme = next;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  return theme;
}

/**
 * TTS 朗读按钮 — 对齐 src/components/TTSButton.tsx（Web Speech，无 invoke）
 *
 * idle:    圆形喇叭按钮，点击开始播放
 * playing: 展开为胶囊（暂停/继续 + 停止）
 * paused:  点击"继续"恢复
 * 卸载时 cancel；不支持语音的环境显示禁用态。
 */
import { useEffect, useRef, useState } from "react";
import { useAppLocale } from "@/lib/i18n";
import { Volume2Icon, XIcon } from "@/components/icons";

export type TTSPhase = "idle" | "playing" | "paused";

interface TTSButtonProps {
  text: string;
  lang?: string;
  className?: string;
}

/** 语言代码 → BCP-47（对齐 src 映射） */
function mapLang(lang: string): string {
  if (lang.startsWith("en")) return "en-US";
  if (lang.startsWith("zh")) return "zh-CN";
  return lang;
}

export function TTSButton({ text, lang = "en", className = "" }: TTSButtonProps) {
  const { t } = useAppLocale();
  const [phase, setPhase] = useState<TTSPhase>("idle");
  const [unsupported, setUnsupported] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  // 环境探测 + 卸载清理
  useEffect(() => {
    setUnsupported(typeof speechSynthesis === "undefined");
    return () => {
      try {
        speechSynthesis.cancel();
      } catch {
        /* 某些环境下 speechSynthesis 已卸载，忽略 */
      }
    };
  }, []);

  const start = () => {
    if (!text.trim()) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = mapLang(lang);
      u.rate = 0.9;
      u.onend = () => setPhase("idle");
      u.onerror = () => setPhase("idle");
      utterRef.current = u;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      setPhase("playing");
    } catch {
      setUnsupported(true);
    }
  };

  const pauseOrResume = () => {
    try {
      if (phase === "playing") {
        speechSynthesis.pause();
        setPhase("paused");
      } else if (phase === "paused") {
        speechSynthesis.resume();
        setPhase("playing");
      }
    } catch {
      setPhase("idle");
    }
  };

  const stop = () => {
    try {
      speechSynthesis.cancel();
    } catch {
      /* noop */
    }
    setPhase("idle");
  };

  if (unsupported) {
    return (
      <button
        disabled
        title={t("tts.unsupported")}
        className={`grid h-7 w-7 place-items-center rounded-md text-ink-3 opacity-40 ${className}`}
      >
        <Volume2Icon size={14} />
      </button>
    );
  }

  if (!text.trim()) {
    return (
      <button
        disabled
        title={t("tts.empty")}
        className={`grid h-7 w-7 place-items-center rounded-md text-ink-3 opacity-40 ${className}`}
      >
        <Volume2Icon size={14} />
      </button>
    );
  }

  if (phase === "idle") {
    return (
      <button
        onClick={start}
        title={t("tts.speak")}
        className={`grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-accent ${className}`}
      >
        <Volume2Icon size={14} />
      </button>
    );
  }

  // playing / paused：展开为胶囊
  return (
    <span
      className={`inline-flex h-7 items-center gap-1 overflow-hidden rounded-full bg-bg-inset px-1.5 text-[11px] text-ink-2 ${className}`}
    >
      <button
        onClick={pauseOrResume}
        title={phase === "playing" ? t("tts.pause") : t("tts.resume")}
        className="rounded-full px-1.5 py-0.5 transition-colors hover:bg-hover hover:text-ink"
      >
        {phase === "playing" ? "⏸" : "▶"}
      </button>
      <button
        onClick={stop}
        title={t("tts.stop")}
        className="grid h-5 w-5 place-items-center rounded-full text-ink-3 transition-colors hover:bg-hover hover:text-red"
      >
        <XIcon size={10} />
      </button>
    </span>
  );
}

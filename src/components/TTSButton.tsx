import { useState, useEffect, useRef, useCallback } from "react";

export type TTSPhase = "idle" | "playing" | "paused";

interface TTSButtonProps {
  text: string;
  lang?: string;
}

function localeFromLang(lang?: string): string {
  if (!lang) return "zh-CN";
  if (lang === "en") return "en-US";
  if (lang === "zh") return "zh-CN";
  return lang;
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

export function TTSButton({ text, lang }: TTSButtonProps) {
  const [phase, setPhase] = useState<TTSPhase>("idle");
  const supported = typeof window !== "undefined" && !!window.speechSynthesis;
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const startSpeaking = useCallback(() => {
    if (!text.trim() || !supported) return;
    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = localeFromLang(lang);
    utterance.rate = 0.9;
    utteranceRef.current = utterance;
    setPhase("playing");

    utterance.onend = () => {
      if (utteranceRef.current === utterance) {
        setPhase("idle");
        utteranceRef.current = null;
      }
    };
    utterance.onerror = () => {
      if (utteranceRef.current === utterance) {
        setPhase("idle");
        utteranceRef.current = null;
      }
    };
    window.speechSynthesis.speak(utterance);
  }, [text, lang, supported]);

  const togglePause = useCallback(() => {
    if (!supported) return;
    if (phase === "playing") {
      window.speechSynthesis.pause();
      setPhase("paused");
    } else if (phase === "paused") {
      window.speechSynthesis.resume();
      setPhase("playing");
    }
  }, [phase, supported]);

  const stopSpeaking = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setPhase("idle");
    utteranceRef.current = null;
  }, [supported]);

  if (!supported) {
    return (
      <button
        disabled
        title="当前环境不支持语音播报"
        className="flex items-center justify-center w-10 h-10 rounded-full border bg-background/90 opacity-50 cursor-not-allowed"
      >
        <SpeakerIcon />
      </button>
    );
  }

  const isEmpty = !text.trim();
  const isPlaying = phase === "playing";
  const expanded = phase !== "idle";

  return (
    <div
      className={`flex items-center justify-center gap-1 overflow-hidden rounded-full border bg-background/90 transition-all duration-300 h-10 ${
        expanded ? "w-20 px-1" : "w-10 px-0"
      } ${isEmpty ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {expanded ? (
        <>
          <button
            onClick={togglePause}
            title={isPlaying ? "暂停" : "继续播放"}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted transition-colors"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            onClick={stopSpeaking}
            title="停止"
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted transition-colors"
          >
            <StopIcon />
          </button>
        </>
      ) : (
        <button
          onClick={isEmpty ? undefined : startSpeaking}
          disabled={isEmpty}
          title="语音播报"
          className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted disabled:opacity-50 transition-colors"
        >
          <SpeakerIcon />
        </button>
      )}
    </div>
  );
}

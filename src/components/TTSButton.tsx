/**
 * TTS 朗读按钮 — Web Speech 系统语音
 *
 * MOSS 神经语音已下线（0.1B 微型模型效果不理想，先不发布）：播放链路不再查模型状态、
 * 不再合成 PCM、不再预热缓存，点击即用系统语音朗读（应用语速/音调/音量参数）。
 * 相关资产（Rust tts 命令、VoiceSection、pcmPlayer、ttsCache）全部保留，
 * 若将来重启 MOSS，只需在此组件的 start() 分支里接回 ttsSynthesize + createPcmPlayer。
 *
 * 状态机：idle → playing / paused → idle（无 loading：系统语音 speak 是同步的）
 * playing/paused 展开为胶囊（暂停/继续 + 停止）；卸载时 cancel。
 */
import { useEffect, useState } from "react";
import { useAppLocale } from "@/lib/i18n";
import { getSettings } from "@/storage";
import { Volume2Icon, XIcon } from "@/components/icons";

export type TTSPhase = "idle" | "playing" | "paused";

interface TTSButtonProps {
  text: string;
  lang?: string;
  className?: string;
}

/** 播放参数（每次播放前从设置读取，确保设置页改动即生效） */
interface PlaybackPrefs {
  playbackRate: number;
  pitch: number;
  volume: number;
}

const DEFAULT_PREFS: PlaybackPrefs = { playbackRate: 1, pitch: 1, volume: 1 };

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
  const [prefs, setPrefs] = useState<PlaybackPrefs>(DEFAULT_PREFS);

  // 环境探测（无 Web Speech 时禁用）+ 读取播放参数 + 卸载清理
  useEffect(() => {
    setUnsupported(typeof speechSynthesis === "undefined");
    getSettings<{ tts?: Partial<PlaybackPrefs> }>()
      .then((s) => {
        if (s.tts) setPrefs({ ...DEFAULT_PREFS, ...s.tts });
      })
      .catch(() => {
        /* 默认值兜底 */
      });
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
    // 每次播放前刷新参数（设置页改动即生效），本次播放用局部变量，避免 state 异步
    let p = prefs;
    getSettings<{ tts?: Partial<PlaybackPrefs> }>()
      .then((s) => {
        if (s.tts) {
          p = { ...DEFAULT_PREFS, ...s.tts };
          setPrefs(p);
        }
      })
      .catch(() => {
        /* 读取失败沿用上次值 */
      });
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = mapLang(lang);
      u.rate = Math.max(0.1, p.playbackRate);
      u.pitch = p.pitch;
      u.volume = p.volume;
      u.onend = () => setPhase("idle");
      u.onerror = () => setPhase("idle");
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

  // 不可用 / 无内容：禁用态
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
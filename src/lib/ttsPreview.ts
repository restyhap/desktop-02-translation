/**
 * 试听播放链路（设置页「语音」分节专用，不侵入 TTSButton）
 *
 * - system：Web Speech API（speechSynthesis），零依赖
 * - neural：Rust 侧 MOSS-TTS 合成 48kHz 双声道交错 f32 PCM →
 *           createPcmPlayer（Web Audio）播放（可暂停/继续/停止）
 *
 * 播放器为单例：同一时刻只允许一个试听在播，切换即停前一个。
 */
import { ttsSynthesize } from "@/storage";
import { createPcmPlayer, type PlayerHandle, type PlaybackOptions } from "@/lib/pcmPlayer";

export type PreviewEngine = "system" | "neural";

export type { PlayerHandle };

/** 试听选项：voice=神经语音音色；playbackRate/pitch/volume=播放参数 */
export interface PreviewOptions extends PlaybackOptions {
  /** MOSS 音色名（如 Junhao/Xiaoyu），仅 neural 生效 */
  voice?: string;
  /** 音调（Web Audio 无原生变调，仅 system 生效） */
  pitch?: number;
}

let currentStop: (() => void) | null = null;

/** 停止当前试听（如有） */
export function stopPreview() {
  currentStop?.();
  currentStop = null;
}

/** Web Speech 试听（语速/音调/音量生效） */
function playSystem(text: string, lang: string, onEnd?: () => void, opts: PreviewOptions = {}): PlayerHandle {
  if (typeof speechSynthesis === "undefined") {
    throw new Error("当前环境不支持 Web Speech");
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = opts.playbackRate && opts.playbackRate > 0 ? opts.playbackRate : 0.9;
  u.pitch = opts.pitch != null ? opts.pitch : 1;
  u.volume = opts.volume != null ? opts.volume : 1;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  return {
    stop: () => speechSynthesis.cancel(),
    pause: () => speechSynthesis.pause(),
    resume: () => speechSynthesis.resume(),
    onEnd: () => {},
  };
}

/** 神经语音试听：MOSS 合成 PCM（带音色）→ 公共 PCM 播放器（语速/音量生效） */
async function playNeural(text: string, onEnd?: () => void, opts: PreviewOptions = {}): Promise<PlayerHandle> {
  const samples = await ttsSynthesize(text, opts.voice);
  const player = createPcmPlayer(samples, opts);
  if (onEnd) player.onEnd(onEnd);
  return player;
}

/**
 * 播放试听。返回句柄（stop/pause/resume/onEnd）；调用方负责停止。
 * 同时会先停掉之前的试听。onEnd 在自然播放结束时回调。
 */
export async function playPreview(
  engine: PreviewEngine,
  text: string,
  lang: string,
  onEnd?: () => void,
  opts?: PreviewOptions,
): Promise<PlayerHandle> {
  stopPreview();
  let player: PlayerHandle;
  if (engine === "system") {
    player = playSystem(text, lang, onEnd, opts);
  } else {
    player = await playNeural(text, onEnd, opts);
  }
  currentStop = player.stop;
  return player;
}
/**
 * PCM 播放器（非单例）— TTSButton / 设置页试听共用
 *
 * createPcmPlayer(samples)：48kHz 双声道交错 f32 → AudioBuffer → AudioBufferSourceNode。
 * 每个实例独立 AudioContext，互不干扰；配合 onEnd 注册自然结束回调。
 */
export interface PlayerHandle {
  stop: () => void;
  pause: () => void;
  resume: () => void;
  /** 注册自然播放结束（source.onended）回调；注册即替换前一个 */
  onEnd: (cb: () => void) => void;
}

const SAMPLE_RATE = 48000;

export interface PlaybackOptions {
  /** 语速（source.playbackRate），默认 1.0 */
  playbackRate?: number;
  /** 音量（GainNode gain 0~1），默认 1.0 */
  volume?: number;
}

/**
 * 播放 48kHz 双声道交错 f32 PCM，支持语速/音量。
 * stop() 会触发 onended → onEnd 回调；调用方停止播放时自行复位 UI 即可（重复回调无害）。
 */
export function createPcmPlayer(samples: number[], opts: PlaybackOptions = {}): PlayerHandle {
  if (samples.length === 0) {
    throw new Error("PCM 数据为空");
  }
  const Ctx = window.AudioContext;
  const ctx = new Ctx({ sampleRate: SAMPLE_RATE });
  const frames = samples.length >> 1;
  const buffer = ctx.createBuffer(2, frames, SAMPLE_RATE);
  const chL = buffer.getChannelData(0);
  const chR = buffer.getChannelData(1);
  for (let i = 0; i < frames; i++) {
    chL[i] = samples[i * 2] ?? 0;
    chR[i] = samples[i * 2 + 1] ?? 0;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = opts.playbackRate && opts.playbackRate > 0 ? opts.playbackRate : 1;
  // 音量经 GainNode 控制
  const gain = ctx.createGain();
  gain.gain.value = opts.volume != null ? opts.volume : 1;
  source.connect(gain);
  gain.connect(ctx.destination);
  let endCb: (() => void) | null = null;
  source.onended = () => {
    endCb?.();
    void ctx.close().catch(() => {});
  };
  source.start();
  return {
    stop: () => {
      try {
        source.stop();
      } catch {
        /* 已停止或从未播放 */
      }
    },
    pause: () => void ctx.suspend().catch(() => {}),
    resume: () => void ctx.resume().catch(() => {}),
    onEnd: (cb) => {
      endCb = cb;
    },
  };
}
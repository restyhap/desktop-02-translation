/**
 * TTS 预合成缓存 — 翻译发起/结果渲染后后台预热合成 PCM，点击朗读时直接播放
 *
 * 设计：
 * - 模块级 LRU 缓存（上限 2 条，插入序淘汰旧的），key = voice + "\u0000" + text。
 * - prewarmTts：MOSS 已下载才合成并缓存；同 key 在途或已缓存不重复合成。
 * - getTtsSamples：统一取样本入口 —— 命中缓存直接返回（不移除，反复点播即点即播）；
 *   在途预热则 await 它（不另起合成，杜绝并发合成导致播放发颤）；都没有才实时合成。
 * - putTtsCache：播放结束写回（LRU 更新插入序）。
 * - 设置页切换音色 → key 含 voice 自动失效；删除模型 → 调用方先判 downloaded=false，缓存不查，无残留。
 */
import { getSettings, getTtsStatus, ttsSynthesize } from "@/storage";

const MAX_CACHE = 2;
/** key → PCM samples（48kHz 双声道交错 f32） */
const cache = new Map<string, number[]>();
/** key → 在途合成 Promise（resolve 值 = samples；完成后已写入 cache，防重复合成） */
const inflight = new Map<string, Promise<number[]>>();

function cacheKey(text: string, voice: string): string {
  return `${voice}\u0000${text}`;
}

/** 写缓存（LRU：同 key 先删再插，超限淘汰最旧） */
function storeSamples(k: string, samples: number[]): void {
  cache.delete(k);
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(k, samples);
}

/**
 * 后台预热：MOSS 已下载则合成并缓存当前文本（voice 取当前设置值）。
 * 同 key 已缓存/在途则跳过；失败静默（点击时 getTtsSamples 实时合成兜底）。
 */
export async function prewarmTts(text: string): Promise<void> {
  if (!text.trim()) return;
  let status;
  try {
    status = await getTtsStatus();
  } catch {
    return; // 状态查询失败视为不可用，跳过预热
  }
  if (!status.downloaded) return;

  let voice = "Junhao";
  try {
    const s = await getSettings<{ tts?: { voice?: string } }>();
    if (s.tts?.voice) voice = s.tts.voice;
  } catch {
    /* 读取失败沿用默认音色 */
  }

  const k = cacheKey(text, voice);
  if (cache.has(k)) return;
  if (inflight.has(k)) return;

  const p = ttsSynthesize(text, voice)
    .then((samples) => {
      if (samples.length) storeSamples(k, samples);
      return samples;
    })
    .catch(() => {
      // 预热失败静默；resolve 空数组，getTtsSamples 在途命中后兜底实时合成
      return [] as number[];
    })
    .finally(() => {
      inflight.delete(k);
    });
  inflight.set(k, p);
  return p.then(() => undefined);
}

/**
 * 统一取样本：缓存命中 → 直接返回；在途预热 → await（不另起合成）；
 * 都没有 → 实时合成。返回值为 48kHz 双声道交错 f32 PCM。
 * 实时合成结果已写缓存（反复点播即点即播）。
 */
export async function getTtsSamples(text: string, voice: string): Promise<number[]> {
  const k = cacheKey(text, voice);
  const cached = cache.get(k);
  if (cached) return cached;

  const pending = inflight.get(k);
  if (pending) {
    const samples = await pending;
    if (samples.length) return samples;
    // 在途预热失败：实时合成兜底（原合成已结束，此刻无并发）
  }

  const samples = await ttsSynthesize(text, voice);
  if (samples.length) storeSamples(k, samples);
  return samples;
}

/** 播放结束后放回缓存（同一文本反复点播保持即点即播；LRU 淘汰同 storeSamples） */
export function putTtsCache(text: string, voice: string, samples: number[]): void {
  if (!samples.length) return;
  storeSamples(cacheKey(text, voice), samples);
}
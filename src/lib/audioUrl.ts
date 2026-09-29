/**
 * 音频容器嗅探/归一化（唯一事实源，纯函数 node 可直跑 —— docs/dict-unify.md #3）
 *
 * 数据前提（docs/repair-dict.md R5 容器字节实测）：
 * - 真 PCM WAV（RIFF + wFormatTag=0x01）→ 原样可播；
 * - 伪 WAV（RIFF + wFormatTag=0x55，data 块实为 MP3 帧）→ 剥 RIFF 头，
 *   把 data 块载荷重标为 audio/mpeg（WebAudio decodeAudioData 实测可解，0.6s mono 22050Hz）；
 * - OggS 容器（Speex/Vorbis，GoldenDict .spx 常见）→ WKWebView 无 Speex 解码：
 *   返回 null = 不可播，调用点按「无资源」处理（喇叭不渲染/静默降级，不报错）。
 *
 * 判定按容器字节而非 mime（dict.rs 已补 spx→audio/ogg、flac→audio/flac，mime 表仅兜底）。
 */
export function toPlayableAudioUrl(dataUrl: string): string | null {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  const b64 = dataUrl.split(",", 2)[1];
  if (!b64) return dataUrl;
  try {
    // atob → 字节级嗅探：OggS 魔数 / RIFF....WAVEfmt + wFormatTag
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // OggS 容器（Speex/Vorbis）：WKWebView 解码不可靠 → 标记为不可播
    if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return null;
    const text = String.fromCharCode(...bytes.subarray(0, 20));
    if (!text.startsWith("RIFF")) return dataUrl;
    const fmtTag = bytes[20] | (bytes[21] << 8);
    if (fmtTag === 1) return dataUrl; // 真 PCM WAV → 原样
    // 非 PCM RIFF：找 "data" 块，载荷重打包为 mp3 data URL
    for (let p = 12; p + 8 <= bytes.length; ) {
      const id = String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
      const size =
        (bytes[p + 4] | (bytes[p + 5] << 8) | (bytes[p + 6] << 16) | (bytes[p + 7] << 24)) >>> 0;
      if (id === "data") {
        const payload = bytes.subarray(p + 8, Math.min(p + 8 + size, bytes.length));
        let out = "";
        const chunk = 0x8000;
        for (let j = 0; j < payload.length; j += chunk) {
          out += String.fromCharCode(...payload.subarray(j, j + chunk));
        }
        return `data:audio/mpeg;base64,${btoa(out)}`;
      }
      p += 8 + size; // RIFF 对齐可忽略（解析只认 id/size，容错）
    }
    return dataUrl;
  } catch (err) {
    console.error("[audioUrl] 容器嗅探失败，按原样返回:", err);
    return dataUrl;
  }
}

/**
 * Simple linear interpolation resampling for audio.
 * Twilio: 8 kHz → Gemini input: 16 kHz (2x).
 * Gemini output: 24 kHz → Twilio: 8 kHz (1/3).
 */

/**
 * Resample 16-bit PCM from srcRate to dstRate (mono).
 * @param {Buffer} pcm - 16-bit LE PCM
 * @param {number} srcRate - source sample rate
 * @param {number} dstRate - target sample rate
 * @returns {Buffer} - resampled 16-bit PCM
 */
export function resample(pcm, srcRate, dstRate) {
  if (srcRate === dstRate) return pcm;
  const srcLen = Math.floor(pcm.length / 2);
  const dstLen = Math.round((srcLen * dstRate) / srcRate);
  const out = Buffer.allocUnsafe(dstLen * 2);
  const ratio = srcLen / dstLen;
  for (let i = 0; i < dstLen; i++) {
    const srcIdx = i * ratio;
    const i0 = Math.floor(srcIdx);
    const i1 = Math.min(i0 + 1, srcLen - 1);
    const frac = srcIdx - i0;
    const s0 = pcm.readInt16LE(i0 * 2);
    const s1 = pcm.readInt16LE(i1 * 2);
    const s = Math.round(s0 + frac * (s1 - s0));
    out.writeInt16LE(s, i * 2);
  }
  return out;
}

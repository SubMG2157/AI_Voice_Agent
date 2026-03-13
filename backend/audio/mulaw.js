/**
 * μ-law (mulaw) ↔ linear PCM conversion for Twilio Media Streams.
 * Twilio sends/receives 8 kHz μ-law mono.
 * Gemini expects 16 kHz PCM input, outputs 24 kHz PCM.
 */

const BIAS = 0x84;
const CLIP = 32635;

const MULAW_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  let mulaw = ~i;
  let sign = (mulaw & 0x80) ? -1 : 1;
  let exponent = (mulaw >> 4) & 0x07;
  let mantissa = mulaw & 0x0f;
  let sample = sign * (((mantissa << 3) + BIAS) << exponent) - BIAS;
  MULAW_TABLE[i] = sample;
}

/**
 * Decode μ-law (1 byte per sample) to 16-bit linear PCM.
 * @param {Buffer} mulawBuf - μ-law encoded bytes (8 kHz)
 * @returns {Buffer} - 16-bit PCM (same rate 8 kHz)
 */
export function mulawToPcm(mulawBuf) {
  const len = mulawBuf.length;
  const pcm = Buffer.allocUnsafe(len * 2);
  for (let i = 0; i < len; i++) {
    const s = MULAW_TABLE[mulawBuf[i] & 0xff];
    pcm.writeInt16LE(s, i * 2);
  }
  return pcm;
}

/**
 * Encode 16-bit linear PCM to μ-law.
 * @param {Buffer} pcmBuf - 16-bit PCM little-endian
 * @returns {Buffer} - μ-law bytes
 */
export function pcmToMulaw(pcmBuf) {
  const len = Math.floor(pcmBuf.length / 2);
  const mulaw = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) {
    let sample = pcmBuf.readInt16LE(i * 2);
    if (sample > CLIP) sample = CLIP;
    if (sample < -CLIP) sample = -CLIP;
    const sign = (sample >> 8) & 0x80;
    if (sign) sample = -sample;
    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    mulaw[i] = ~(sign | (exponent << 4) | mantissa);
  }
  return mulaw;
}

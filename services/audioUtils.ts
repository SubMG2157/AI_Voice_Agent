export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/** Peak normalization: use more of 16-bit range for soft speech so ASR gets a clearer signal. */
const NORMALIZE_PEAK = 0.85;
const MIN_PEAK_TO_NORMALIZE = 0.01;

export function createPcmBlob(data: Float32Array): { data: string; mimeType: string } {
  const l = data.length;
  let peak = 0;
  for (let i = 0; i < l; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
  }
  const scale =
    peak >= MIN_PEAK_TO_NORMALIZE && peak < NORMALIZE_PEAK ? NORMALIZE_PEAK / peak : 1;

  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    let s = data[i] * scale;
    s = Math.max(-1, Math.min(1, s));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return {
    data: bytesToBase64(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}
/**
 * Normalize customer transcript for display only.
 * ASR may output greetings in other scripts; show "नमस्कार" so the bubble looks correct.
 * Use for UI display only — do NOT feed normalized text back to the model.
 */

const GREETING_VARIANTS: string[] = [
  'hello',
  'hi',
  'hey',
  'helo',
  'hellow',
  'hallo',
  'नमस्कार',
  'नमस्ते',
  'हेलो',
  'हलो',
  'హలో',
  'హాయ్',
  'ஹலோ',
  'ಹಲೋ',
  'ഹലോ',
];

function normalizeForMatch(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * If the customer transcript is a greeting in any script, return "नमस्कार" for display.
 * Otherwise return the original text.
 */
export function normalizeGreetingForDisplay(text: string): string {
  if (!text || !text.trim()) return text;
  const t = normalizeForMatch(text);
  if (GREETING_VARIANTS.includes(t)) return 'नमस्कार';
  // Allow "हो", "ठीक आहे", "बरं" as-is; only normalize clear greeting words
  return text;
}

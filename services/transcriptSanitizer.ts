/**
 * Transcript Sanitizer — banking-grade Unicode script filter.
 *
 * Ensures live transcript only contains:
 *   - English (Latin letters)
 *   - Hindi / Marathi (Devanagari)
 *   - Digits, common punctuation, whitespace
 *
 * Strips Japanese, Chinese, Arabic, Telugu, Tamil, etc. that ASR may
 * hallucinate on noise or unclear speech.
 *
 * Used by: liveClient.ts (demo), backend/mediaStream.ts (Twilio), App.tsx (safety net).
 */

// ── Noise patterns ──────────────────────────────────────────────────────
const NOISE_REGEX = /^(hmm+|uh+|ah+|um+|hm+|…+|\.+|-+)$/i;

// ── Allowed Unicode ranges ──────────────────────────────────────────────
//   Basic Latin          : U+0000 – U+007F  (English, digits, punctuation)
//   Devanagari           : U+0900 – U+097F  (Hindi, Marathi)
//   Devanagari Extended  : U+A8E0 – U+A8FF  (vedic extensions used in some Hindi/Marathi text)
//   Common Indic Number Forms : U+A830 – U+A83F
const ALLOWED_REGEX = /[^\u0000-\u007F\u0900-\u097F\uA8E0-\uA8FF0-9.,?!;:'"()\-–—…₹\s]/g;

// ── Language detection (lightweight, Unicode-based) ─────────────────────
type DetectedLang = 'en' | 'hi' | 'unknown';

export interface SanitizeOptions {
  /** Prefer Devanagari-heavy utterances in mixed/noisy telephony transcripts. */
  preferDevanagari?: boolean;
  /** Drop isolated short Latin words (common random ASR hallucinations like "Marina"). */
  dropIsolatedLatinWords?: boolean;
  /** If confidence is low, drop text instead of emitting "[unclear]". */
  dropUnclear?: boolean;
  /** Apply narrow telephony-ASR corrections for isolated short utterances. */
  applyTelephonyCorrections?: boolean;
}

function detectLangConfidence(text: string): { lang: DetectedLang; confidence: number } {
  let en = 0;
  let dev = 0;
  let other = 0;

  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) en++;
    else if (code >= 0x0900 && code <= 0x097F) dev++;
    else if (ch.trim() !== '') other++;
  }

  const total = en + dev + other;
  if (total === 0) return { lang: 'unknown', confidence: 0 };

  const max = Math.max(en, dev);
  if (max === en) return { lang: 'en', confidence: en / total };
  return { lang: 'hi', confidence: dev / total };
}

// ── Public API ──────────────────────────────────────────────────────────

export interface SanitizeResult {
  /** Cleaned text to display, or null if should be dropped entirely. */
  output: string | null;
  /** True when the text was too ambiguous to show verbatim. */
  isUnclear: boolean;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isPureDevanagariToken(token: string): boolean {
  return /^[\u0900-\u097F]+$/.test(token);
}

function repairDevanagariFragments(text: string): string {
  const tokens = normalizeWhitespace(text).split(' ');
  if (tokens.length < 3) return normalizeWhitespace(text);

  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isPureDevanagariToken(tokens[i]) || tokens[i].length > 2) {
      out.push(tokens[i]);
      i += 1;
      continue;
    }

    let j = i;
    const run: string[] = [];
    while (j < tokens.length && isPureDevanagariToken(tokens[j]) && tokens[j].length <= 2) {
      run.push(tokens[j]);
      j += 1;
    }

    // Heuristic: if we got 3+ tiny Devanagari fragments in a row, ASR likely split syllables.
    if (run.length >= 3) out.push(run.join(''));
    else out.push(...run);
    i = j;
  }

  return normalizeWhitespace(out.join(' '));
}

/**
 * Repair Devanagari matras (vowel signs) that ASR splits from their base consonant.
 * e.g. "मा झ्या" → "माझ्या", "ऊ सा" → "ऊसा"
 * A matra (ा ि ी ु ू ृ े ै ो ौ ् ं ः ँ) must attach to the preceding consonant.
 */
function repairDevanagariMatras(text: string): string {
  // Rejoin: base consonant + space + matra  →  consonant+matra
  text = text.replace(/([\u0915-\u0939])\s+([\u093E-\u094D\u0902\u0903\u0901])/g, '$1$2');
  // Rejoin: matra + space + base consonant  →  matra+consonant (less common but can happen)
  text = text.replace(/([\u093E-\u094D])\s+([\u0915-\u0939])/g, '$1$2');
  return text;
}

function shouldDropIsolatedLatin(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  const hasDevanagari = /[\u0900-\u097F]/.test(normalized);
  if (hasDevanagari) return false;
  // Single short Latin token is often noise in Marathi/Hindi telephony calls.
  return /^[A-Za-z]{2,12}[.]?$/.test(normalized);
}

/** Common ASR hallucination corrections for Marathi telephony.
 *  Covers: exact-match English/French words, and substring-level French phrases. */
function applyTelephonyCorrections(text: string): string {
  const normalized = normalizeWhitespace(text).replace(/[.?!]+$/g, '');
  if (!normalized) return text;

  // --- Exact-match corrections (whole utterance) ---
  if (/^mari+n+a$/i.test(normalized) || /^mareena$/i.test(normalized)) return 'नाही';
  if (/^nahi+$/i.test(normalized) || /^nahee$/i.test(normalized)) return 'नाही';
  if (/^no$/i.test(normalized) || /^nako$/i.test(normalized)) return 'नाही';
  if (/^ok(?:ay)?$/i.test(normalized)) return 'ठीक आहे';
  if (/^yes$/i.test(normalized) || /^yeah?$/i.test(normalized)) return 'हो';
  if (/^hello$/i.test(normalized) || /^helo$/i.test(normalized)) return 'नमस्कार';
  if (/^bye$/i.test(normalized) || /^goodbye$/i.test(normalized)) return 'धन्यवाद';
  // French exact-match hallucinations
  if (/^oui$/i.test(normalized)) return 'हो';
  if (/^non$/i.test(normalized)) return 'नाही';

  // --- Substring corrections (French ASR hallucinations in longer text) ---
  let corrected = text;
  const SUBSTRING_CORRECTIONS: [RegExp, string][] = [
    [/Ce n'a eu pe cameron/gi, 'छान आहे'],
    [/pe cameron/gi, 'छान'],
    [/screen code/gi, 'पिनकोड'],
    [/pin\s*code/gi, 'पिनकोड'],
  ];
  for (const [pattern, replacement] of SUBSTRING_CORRECTIONS) {
    corrected = corrected.replace(pattern, replacement);
  }

  return corrected;
}

/**
 * Sanitize a customer transcript line.
 *
 * 1. Strip all characters outside English + Devanagari + digits + punctuation.
 * 2. Drop pure noise (hmm, uh, ah, dots).
 * 3. Confidence gate:
 *    - ≥ 0.5 → show cleaned text
 *    - < 0.5 and some chars remain → show "[unclear]"
 *    - nothing left → return null (drop silently)
 */
export function sanitizeTranscript(text: string, options: SanitizeOptions = {}): SanitizeResult {
  if (!text) return { output: null, isUnclear: false };

  // Step 1: strip unsupported scripts
  const correctedInput = options.applyTelephonyCorrections ? applyTelephonyCorrections(text) : text;
  const cleanedRaw = correctedInput.replace(ALLOWED_REGEX, '');
  const withMatras = repairDevanagariMatras(cleanedRaw);
  const cleaned = repairDevanagariFragments(withMatras);

  // Step 2: nothing left after cleaning
  if (cleaned.length === 0) {
    return { output: null, isUnclear: false };
  }

  // Step 3: noise-only
  if (NOISE_REGEX.test(cleaned)) {
    return { output: null, isUnclear: false };
  }

  // Step 4: too short (purely empty handled above, but just in case)
  if (cleaned.length < 1) {
    return { output: null, isUnclear: false };
  }

  if (options.dropIsolatedLatinWords && shouldDropIsolatedLatin(cleaned)) {
    return { output: null, isUnclear: false };
  }

  // Step 5: confidence gate
  const { confidence } = detectLangConfidence(cleaned);

  const threshold = options.preferDevanagari ? 0.45 : 0.5;
  if (confidence >= threshold) {
    return { output: cleaned, isUnclear: false };
  }

  if (options.dropUnclear) {
    return { output: null, isUnclear: true };
  }

  // Some text, but low confidence — show [unclear]
  if (cleaned.length >= 1) {
    return { output: '[unclear]', isUnclear: true };
  }

  return { output: null, isUnclear: false };
}

/**
 * Quick boolean check — true if the text is safe to display.
 * Use when you only need a pass/fail (e.g. safety net in UI).
 */
export function isCleanTranscript(text: string): boolean {
  const { output } = sanitizeTranscript(text);
  return output !== null;
}

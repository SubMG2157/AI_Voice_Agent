/**
 * Banking-grade language detection: explicit requests + confidence-based (2 consecutive turns).
 * Call ONLY on final ASR text—never on partial/streaming.
 * Do NOT switch on Hinglish, single words, or mixed script.
 */

export type DetectedLanguage = 'en' | 'hi' | 'mr' | 'unknown';

/** Context for confidence-based language switching (e.g. per call). */
export interface LanguageSwitchContext {
  language: DetectedLanguage;
  languageConfidence: number;
}

/** Explicit language switch phrases (highest priority). If matched → switch immediately. */
export const EXPLICIT_LANGUAGE_SWITCH: Record<DetectedLanguage, RegExp> = {
  en: /english|speak\s+english|in\s+english|english\s+please/i,
  hi: /hindi|हिंदी|हिन्दी|हिंदी\s+में|हिंदी\s+बोलो|हिंदी\s+बोलिए|मुझे\s+कॉल|कल\s+शाम|शाम\s+को|कॉल\s+कीजिए|कॉल\s+करें/i,
  mr: /marathi|मराठी|मराठीत|मराठी\s+बोला|मराठी\s+बोलो|तुम्ही\s+मला|मला\s+कॉल|उद्या\s+कॉल|संध्याकाळी|वाजता/i,
  unknown: /(?!)/,  // Never matches - 'unknown' is not a switchable language
};

/** Devanagari (Hindi/Marathi shared); Latin for English. */
const DEVANAGARI_REGEX = /[\u0900-\u097F]/;
const LATIN_REGEX = /[a-zA-Z]/;

/** Minimum words to count as a "full turn" for implicit switch (single word = no switch). */
const MIN_WORDS_FOR_FULL_TURN = 2;

/**
 * Script-based language intent. Used for implicit (confidence) switch only.
 * Returns null for single-word or mixed/Hinglish so we don't switch on "haan", "theek hai", etc.
 */
export function detectLanguageIntent(text: string): DetectedLanguage | null {
  const t = (text || '').trim();
  if (!t) return null;

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < MIN_WORDS_FOR_FULL_TURN) return null;

  const hasDevanagari = DEVANAGARI_REGEX.test(t);
  const hasLatin = LATIN_REGEX.test(t);
  if (hasDevanagari && hasLatin && words.length <= 3) return null;

  if (hasDevanagari) {
    const hindiMarkers = /क्या|कल|शाम|मुझे|चाहिए|है|लिए|बताइए|बोलिए|कहिए|शादी|नहीं|कृपया/i.test(t);
    const marathiMarkers = /आहे|नाही|काय|ठीक\s+आहे|चालेल|बोला|सांगा|वेळ|वाजता|आज/i.test(t);
    if (hindiMarkers && !marathiMarkers) return 'hi';
    if (marathiMarkers) return 'mr';
    return 'hi';
  }

  if (hasLatin && t.length > 4) return 'en';
  return null;
}

/**
 * Check if text is a full Marathi/Hindi sentence (4+ words, predominantly Devanagari).
 * Used to treat complete sentences as explicit language requests for immediate switching.
 */
export function isFullMarathiHindiSentence(text: string): DetectedLanguage | null {
  const t = (text || '').trim();
  if (!t) return null;

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 4) return null; // Need at least 4 words for a "full sentence"

  // Count Devanagari vs Latin characters
  const devanagariChars = (t.match(/[\u0900-\u097F]/g) || []).length;
  const latinChars = (t.match(/[a-zA-Z]/g) || []).length;
  const totalChars = devanagariChars + latinChars;

  if (totalChars === 0) return null;

  // If >70% Devanagari, treat as Marathi/Hindi sentence
  const devanagariPercent = devanagariChars / totalChars;
  if (devanagariPercent < 0.7) return null; // Too much Latin (Hinglish)

  // Determine if Hindi or Marathi based on markers
  const hindiMarkers = /क्या|कल|शाम|मुझे|चाहिए|है|लिए|बताइए|बोलिए|कहिए|शादी|नहीं|कृपया|करें|कीजिए/i.test(t);
  const marathiMarkers = /आहे|नाही|काय|ठीक\s+आहे|चालेल|बोला|सांगा|वेळ|वाजता|आज|तुम्ही|मला|उद्या|संध्याकाळी|करा|करू|शकता/i.test(t);

  if (marathiMarkers) return 'mr';
  if (hindiMarkers) return 'hi';

  // Default to Hindi if predominantly Devanagari but no clear markers
  return 'hi';
}


/**
 * 1) Explicit request → set ctx.language immediately, reset confidence.
 * 2) Full Marathi/Hindi sentence (4+ words, >70% Devanagari) → switch immediately.
 * 3) Implicit: only switch when customer has ≥2 full consecutive turns in the other language.
 */
export function maybeSwitchLanguage(text: string, ctx: LanguageSwitchContext): void {
  const t = (text || '').trim();
  if (!t) return;

  // Priority 1: Explicit language request (e.g., "हिंदी में बोलो", "मराठी बोला")
  for (const [lang, regex] of Object.entries(EXPLICIT_LANGUAGE_SWITCH) as [DetectedLanguage, RegExp][]) {
    if (regex.test(t)) {
      ctx.language = lang;
      ctx.languageConfidence = 0;
      return;
    }
  }

  // Priority 2: Full Marathi/Hindi sentence (4+ words, >70% Devanagari) → immediate switch
  const fullSentenceLang = isFullMarathiHindiSentence(t);
  if (fullSentenceLang && fullSentenceLang !== ctx.language) {
    ctx.language = fullSentenceLang;
    ctx.languageConfidence = 0;
    return;
  }

  // Priority 3: Implicit detection with 2-turn confidence
  const detected = detectLanguageIntent(text);
  if (!detected || detected === ctx.language) {
    ctx.languageConfidence = 0;
    return;
  }

  ctx.languageConfidence += 1;
  if (ctx.languageConfidence >= 2) {
    ctx.language = detected;
    ctx.languageConfidence = 0;
  }
}

/**
 * Legacy: detect language from text (explicit first, then intent, then Latin fallback).
 * Prefer maybeSwitchLanguage(text, ctx) for banking-grade 2-turn behaviour.
 */
export function detectLanguage(text: string): DetectedLanguage {
  const t = (text || '').trim();
  if (!t) return 'unknown';

  for (const [lang, regex] of Object.entries(EXPLICIT_LANGUAGE_SWITCH) as [DetectedLanguage, RegExp][]) {
    if (regex.test(t)) return lang;
  }

  const intent = detectLanguageIntent(t);
  if (intent) return intent;

  if (LATIN_REGEX.test(t) && t.length > 2) return 'en';
  return 'unknown';
}

let activeLanguage: DetectedLanguage = 'en';

export function getActiveLanguage(): DetectedLanguage {
  return activeLanguage;
}

export function setActiveLanguage(lang: DetectedLanguage): void {
  activeLanguage = lang;
}

export function resetLanguageController(): void {
  activeLanguage = 'en';
}

/** Seconds after call start during which short/greeting utterances are not used for language switch. */
export const INITIAL_LANGUAGE_WINDOW_MS = 5000;

const SHORT_GREETINGS = ['hello', 'hi', 'hey', 'yes', 'okay', 'sure', 'हेलो', 'हलो'];

/**
 * At call start, do not use short/greeting-only utterances for language switch.
 */
export function shouldIgnoreLanguageDetection(callStartTs: number, text: string): boolean {
  const t = (text || '').trim();
  if (!t) return true;
  const elapsed = Date.now() - callStartTs;
  if (elapsed >= INITIAL_LANGUAGE_WINDOW_MS) return false;
  const tooShort = t.length <= 5;
  const greetingOnly = SHORT_GREETINGS.includes(t.toLowerCase());
  return tooShort || greetingOnly;
}

/**
 * Consent gate: valid consent phrases for "Do you have 2–3 minutes?".
 * Used for tests and optional client-side gating; agent behavior is enforced via prompt.
 */

/** Phrases that count as EXPLICIT consent (yes, I have time) */
export const CONSENT_KEYWORDS: string[] = [
  'yes',
  'yeah',
  'sure',
  'ok',
  'okay',
  'go ahead',
  'you can',
  'हाँ',
  'हां',
  'ठीक है',
  'जी',
  'हो',
  'ठीक आहे',
  'बोला',
  'चालेल',
];

/** Phrases that do NOT count as consent – agent must re-ask */
export const NOT_CONSENT: string[] = [
  'hello',
  'hi',
  'if',
  'noise',
  'uh',
  'hmm',
  'hey',
];

function normalize(text: string): string {
  return (text || '').trim().toLowerCase();
}

/**
 * Returns true if the customer utterance is valid explicit consent to "Do you have 2–3 minutes?"
 */
export function isValidConsent(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  return CONSENT_KEYWORDS.some((k) => t.includes(k));
}

/**
 * Returns true if the utterance is clearly NOT consent (hello, if, noise, etc.)
 */
export function isNotConsent(text: string): boolean {
  const t = normalize(text);
  if (!t) return true;
  return NOT_CONSENT.some((k) => t === k || t.startsWith(k + ' '));
}

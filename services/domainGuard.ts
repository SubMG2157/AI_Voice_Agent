/**
 * Domain guard: classify customer intent as ALLOWED (in-domain) or BLOCKED (out-of-domain).
 * Use for logging, metrics, or future client-side guardrails. Agent behavior is enforced via prompt.
 */

export type AllowedIntent =
  | 'greeting'
  | 'consent_yes'
  | 'consent_no'
  | 'loan_interest'
  | 'loan_purpose'
  | 'callback_request'
  | 'callback_time'
  | 'email_request'
  | 'email_confirmation'
  | 'language_request'
  | 'not_interested'
  | 'affirmation'
  | 'negation';

export type DomainGuardResult = AllowedIntent | 'BLOCKED';

/** Patterns/phrases that indicate OUT-OF-DOMAIN – do not answer, deflect instead. */
const BLOCKED_PATTERNS: { pattern: RegExp | string; kind: string }[] = [
  // Math / arithmetic
  { pattern: /एक\s*प्लस\s*एक|१\s*\+\s*१|one\s*plus\s*one|1\s*plus\s*1|कितना\s*होता\s*है\s*प्लस/i, kind: 'math' },
  { pattern: /\d+\s*[+\-*\/]\s*\d+|plus|minus|multiply|जोड|वजा/i, kind: 'math' },
  // AI identity
  { pattern: /क्या\s*आप\s*एआई|are you ai|you are bot|you are robot|एआई\s*है|ai\s*assistant/i, kind: 'ai_identity' },
  { pattern: /क्या\s*आप\s*रोबोट|are you human|real person/i, kind: 'ai_identity' },
  // Who built you
  { pattern: /किसने\s*बनाया|who\s*built\s*you|who\s*created\s*you|आपको\s*किसने|गूगल\s*ने\s*बनाया/i, kind: 'who_built' },
  // Testing / provocation
  { pattern: /test\s*bot|testing\s*you|परीक्षण|टेस्ट\s*कर\s*रहा/i, kind: 'testing' },
  // General knowledge (simple heuristic)
  { pattern: /capital of|राजधानी\s*क्या|who is the president|prime minister/i, kind: 'general_knowledge' },
];

function normalizeForMatch(text: string): string {
  return (text || '').trim().toLowerCase();
}

/**
 * Classify customer utterance as ALLOWED (in-domain) or BLOCKED (out-of-domain).
 * Returns 'BLOCKED' if the text matches any blocked pattern; otherwise returns a generic allowed intent
 * for in-domain flow (exact intent classification would require NLU; here we only guard).
 */
export function classifyIntent(text: string): DomainGuardResult {
  const t = normalizeForMatch(text);
  if (!t) return 'affirmation';

  for (const { pattern, kind } of BLOCKED_PATTERNS) {
    const match = typeof pattern === 'string' ? t.includes(pattern) : pattern.test(t);
    if (match) return 'BLOCKED';
  }

  return 'loan_interest'; // generic in-domain; fine for guard purpose
}

/** Returns true if the utterance should be deflected (blocked). */
export function isBlockedIntent(text: string): boolean {
  return classifyIntent(text) === 'BLOCKED';
}

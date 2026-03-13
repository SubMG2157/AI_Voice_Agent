/**
 * Detect when the agent has said the closing line so we can auto-hangup.
 * Uses Deepak Fertilisers farmer-safe END_GREETING phrases (mr/hi/en) plus legacy patterns.
 * CRITICAL: Only match when the turn ENDS with a closing phrase—never when
 * "धन्यवाद." (or similar) appears in the middle (e.g. "धन्यवाद. आपण खताबद्दल बोलूया.").
 */

import { getAllEndGreetingPhrases } from '../../services/endGreetings.js';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Patterns that must match at END of turn (avoid mid-call "धन्यवाद. तर..."). */
const CLOSING_PHRASES_END: RegExp[] = [
  ...getAllEndGreetingPhrases().map((p) => {
    const escaped = escapeRegex(p).replace(/\\.$/, '\\.?');
    return new RegExp(escaped + '\\s*$', 'i');
  }),
  /धन्यवाद\.?\s*$/i,
  /thank you\.?\s*$/i,
  /thanks\.?\s*$/i,
  /आपला दिवस शुभ\.?\s*$/i,
];

/** Patterns that may appear anywhere (explicit disconnect intent). */
const CLOSING_PHRASES_ANYWHERE: RegExp[] = [
  /कॉल (समाप्त|बंद)/i,
  /मी (कॉल बंद|आता कॉल)/i,
  /disconnect (now|the call)/i,
];

/** Returns true only when the agent's turn is a closing line (end of conversation). */
export function isAgentClosingLine(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (CLOSING_PHRASES_ANYWHERE.some((r) => r.test(t))) return true;
  return CLOSING_PHRASES_END.some((r) => r.test(t));
}

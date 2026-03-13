/**
 * Detect loan purpose from customer utterance (travel, medical, wedding, renovation).
 * Used for tests and optional per-turn injection; agent behavior is enforced via prompt.
 */

export type LoanPurpose = 'travel' | 'medical' | 'wedding' | 'renovation' | 'education' | 'general';

/** Keywords per purpose (Marathi, Hindi, English). */
const PURPOSE_KEYWORDS: Record<Exclude<LoanPurpose, 'general'>, string[]> = {
  travel: [
    'प्रवास', 'ट्रिप', 'फिरायला', 'टूर', 'यात्रा', 'घूमने', 'travel', 'trip', 'vacation', 'tour',
  ],
  medical: [
    'आरोग्य', 'उपचार', 'हॉस्पिटल', 'डॉक्टर', 'इलाज', 'स्वास्थ्य', 'अस्पताल', 'medical', 'hospital', 'treatment', 'health',
  ],
  wedding: [
    'लग्न', 'विवाह', 'शादी', 'wedding', 'marriage', 'shaadi',
  ],
  renovation: [
    'दुरुस्ती', 'घर', 'नूतनीकरण', 'मरम्मत', 'renovation', 'repair', 'home',
  ],
  education: [
    'शिक्षण', 'पढाई', 'education', 'study', 'fees', 'फीस',
  ],
};

function normalize(text: string): string {
  return (text || '').trim().toLowerCase();
}

/**
 * Detect loan purpose from customer text. Returns 'general' if no purpose detected.
 */
export function detectLoanPurpose(text: string): LoanPurpose {
  const t = normalize(text);
  if (!t) return 'general';

  for (const [purpose, keywords] of Object.entries(PURPOSE_KEYWORDS)) {
    if (keywords.some((kw) => t.includes(kw))) return purpose as LoanPurpose;
  }

  return 'general';
}

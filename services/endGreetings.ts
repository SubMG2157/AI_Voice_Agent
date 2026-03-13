/**
 * Deepak Fertilisers — Farmer-safe end-of-call greetings.
 * Primarily Marathi, with Hindi/English for future use.
 * Used by: prompts (instruction) and backend conversationEndDetector (hangup detection).
 */

export type EndGreetingLang = 'en' | 'hi' | 'mr';

export const END_GREETING: Record<EndGreetingLang, string[]> = {
  en: [
    'Thank you.',
    'Thank you for your time.',
    'Have a great day.',
  ],
  hi: [
    'धन्यवाद।',
    'आपका समय देने के लिए धन्यवाद।',
    'आपका दिन शुभ हो।',
  ],
  mr: [
    'धन्यवाद.',
    'आपला वेळ दिल्याबद्दल धन्यवाद.',
    'काही मदत लागली तर आम्हाला संपर्क करा.',
    'आपला दिवस शुभ जावो.',
  ],
};

/** Map app language (English/Hindi/Marathi) to end-greeting key. */
export function languageToEndGreetingLang(language: string): EndGreetingLang {
  const L: Record<string, EndGreetingLang> = {
    English: 'en',
    Hindi: 'hi',
    Marathi: 'mr',
  };
  return L[language] ?? 'mr'; // Default to Marathi
}

/** Preferred short closing (first in list) for the given language. */
export function getEndGreeting(lang: EndGreetingLang): string {
  return END_GREETING[lang][0];
}

/** Get closing phrase for the given app language (e.g. from ctx.language). */
export function getEndGreetingForAppLanguage(language: string): string {
  return getEndGreeting(languageToEndGreetingLang(language));
}

/** All phrases for detection (hangup when agent says any of these). */
export function getAllEndGreetingPhrases(): string[] {
  const list: string[] = [];
  for (const arr of Object.values(END_GREETING)) {
    list.push(...arr);
  }
  return list;
}

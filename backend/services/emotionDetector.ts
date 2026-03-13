/**
 * Emotion Detector — Detects farmer's emotional state from transcript.
 * Used before stage logic to handle anger/frustration professionally.
 */

export type Emotion = 'CALM' | 'ANGRY' | 'FRUSTRATED' | 'CONFUSED';

/**
 * Detect emotion from farmer's spoken text.
 * Keywords in Marathi + transliterated Hindi/English.
 */
export function detectEmotion(text: string): Emotion {
    const t = text.toLowerCase().trim();

    // --- ANGRY ---
    const angryPatterns = [
        'राग', 'चिडलो', 'भडकलो', 'संतापलो',
        'फसवणूक', 'fraud', 'लुटमार', 'चोर',
        'काही कामाचं नाही', 'फालतू', 'बकवास', 'waste',
        'पैसे वाया', 'पैसे परत', 'money back', 'refund',
        'तक्रार करतो', 'complaint', 'consumer court',
        'गप बस', 'चूप', 'shut up', 'बंद कर फोन',
    ];
    if (angryPatterns.some(p => t.includes(p))) {
        return 'ANGRY';
    }

    // --- FRUSTRATED ---
    const frustratedPatterns = [
        'फायदा नाही', 'काम नाही केलं', 'चालत नाही',
        'खराब', 'वाईट अनुभव', 'नुकसान', 'त्रास',
        'किती वेळा सांगू', 'परत परत', 'समजत नाही का',
    ];
    if (frustratedPatterns.some(p => t.includes(p))) {
        return 'FRUSTRATED';
    }

    // --- CONFUSED ---
    const confusedPatterns = [
        'समजलं नाही', 'काय म्हणालात', 'परत सांगा',
        'कळलं नाही', 'मला समजत नाही', 'confused',
    ];
    if (confusedPatterns.some(p => t.includes(p))) {
        return 'CONFUSED';
    }

    return 'CALM';
}

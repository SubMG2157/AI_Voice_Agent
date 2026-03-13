/**
 * Intent Classifier — Detects farmer intent from transcript text.
 * Used for dynamic mid-call routing (disease, buy, callback, interrupt, off-topic).
 */

export type FarmerIntent =
    | 'BUY_PRODUCT'
    | 'HAS_DISEASE'
    | 'CALL_LATER'
    | 'INTERRUPT'
    | 'POSITIVE_FEEDBACK'
    | 'NEGATIVE_FEEDBACK'
    | 'DECLINE_PRODUCT'
    | 'OFF_TOPIC'
    | 'ASK_AI'
    | 'ASK_CREATOR'
    | 'DND'
    | 'UNKNOWN';

/**
 * Classify farmer's spoken text into an intent.
 * Keywords are in Marathi + transliterated Hindi/English.
 */
export function classifyIntent(text: string): FarmerIntent {
    const t = text.toLowerCase().trim();

    // --- DND (Do Not Disturb) ---
    if (t.includes('dnd') || t.includes('do not call') || t.includes('कॉल करू नका') || t.includes('फोन करू नका')) {
        return 'DND';
    }

    // --- AI Identity ---
    if (t.includes('ai आहेस') || t.includes('are you ai') || t.includes('robot') || t.includes('रोबोट') ||
        t.includes('तू ai') || t.includes('machine') || t.includes('मशीन') || t.includes('bot आहेस')) {
        return 'ASK_AI';
    }

    // --- Creator / Who made you ---
    if (t.includes('कोणी बनवलं') || t.includes('कोण बनवलं') || t.includes('who made you') ||
        t.includes('who created') || t.includes('कोणी तयार') || t.includes('कुणी बनवलं')) {
        return 'ASK_CREATOR';
    }

    // --- Off-topic (math, GK, politics, religion) ---
    const offTopicPatterns = [
        'capital', 'राजधानी', '1+1', '1 + 1', 'किती होते', 'मोदी', 'पंतप्रधान',
        'prime minister', 'cricket', 'क्रिकेट', 'movie', 'सिनेमा', 'joke', 'विनोद',
        'weather', 'हवामान', 'politics', 'राजकारण', 'religion', 'धर्म', 'god',
        'भगवान', 'election', 'निवडणूक', 'शेअर मार्केट', 'stock', 'bitcoin',
        'गूगल', 'youtube', 'instagram', 'facebook', 'whatsapp',
    ];
    if (offTopicPatterns.some(p => t.includes(p))) {
        return 'OFF_TOPIC';
    }

    // --- Disease / Crop Problem ---
    const diseasePatterns = [
        'रोग', 'disease', 'लाल', 'पिवळ', 'सुकल', 'किड', 'कीड', 'अळी', 'बुरशी',
        'fungus', 'rot', 'wilt', 'spot', 'खोड', 'पानं खराब', 'पीक खराब',
        'समस्या', 'problem', 'issue', 'अडचण', 'infection', 'संसर्ग',
    ];
    if (diseasePatterns.some(p => t.includes(p))) {
        return 'HAS_DISEASE';
    }

    // --- Buy Product ---
    const buyPatterns = [
        'खरेदी', 'घ्यायचं', 'हवं आहे', 'order', 'ऑर्डर', 'विकत', 'मागणी',
        'पिशवी', 'पिशव्या', 'खत हवं', 'मला हवं', 'purchase', 'buy',
    ];
    if (buyPatterns.some(p => t.includes(p))) {
        return 'BUY_PRODUCT';
    }

    // --- Callback Request ---
    const callLaterPatterns = [
        'नंतर', 'पुढे', 'later', 'call back', 'उद्या', 'सोमवार', 'मंगळवार',
        'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार', 'रविवार', 'tomorrow',
        'कॉल करा नंतर', 'वेळ नाही', 'busy', 'व्यस्त',
    ];
    if (callLaterPatterns.some(p => t.includes(p))) {
        return 'CALL_LATER';
    }

    // --- Interrupt ---
    const interruptPatterns = [
        'ऐक', 'ऐका', 'ऐकना', 'ऐक ना', 'excuse', 'excuseme', 'अलो', 'alo',
        'थांबा', 'थांब', 'wait', 'एक मिनिट', 'एक सेकंद', 'रुका', 'सुनो',
        'सुन', 'listen', 'hello', 'हॅलो',
    ];
    if (interruptPatterns.some(p => t.includes(p))) {
        return 'INTERRUPT';
    }

    // --- Decline Product (polite refusal) ---
    const declinePatterns = [
        'नाही सध्या', 'सध्या नाही', 'नको', 'नको आत्ता', 'गरज नाही',
        'नाही नको', 'आत्ता नको', 'नंतर बघतो', 'नंतर बघू', 'पाहिजे नाही',
        'नाही सज्जन', 'सध्या गरज नाही', 'अजून नको',
    ];
    if (declinePatterns.some(p => t.includes(p))) {
        return 'DECLINE_PRODUCT';
    }

    // --- Positive Feedback ---
    const positivePatterns = [
        'छान', 'चांगलं', 'उत्तम', 'बरं', 'सुधारणा', 'फायदा', 'मस्त',
        'भारी', 'good', 'great', 'nice', 'happy', 'satisfied',
    ];
    if (positivePatterns.some(p => t.includes(p))) {
        return 'POSITIVE_FEEDBACK';
    }

    // --- Negative Feedback ---
    const negativePatterns = [
        'खराब', 'वाईट', 'नुकसान', 'काम नाही', 'चालत नाही', 'पैसे वाया',
        'bad', 'worst', 'useless', 'waste',
    ];
    if (negativePatterns.some(p => t.includes(p))) {
        return 'NEGATIVE_FEEDBACK';
    }

    return 'UNKNOWN';
}

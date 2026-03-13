/**
 * Disease Matching Algorithm — matches farmer-described symptoms to disease knowledge base.
 * Uses keyword matching against diseases.json for MVP.
 * For RAG upgrade: use Gemini embeddings for semantic matching.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface DiseaseEntry {
    crop: string;
    cropMr: string;
    symptoms: string[];
    disease: string;
    cause: string;
    solution: string[];
    recommendedProduct: string;
}

export interface DiseaseMatch {
    disease: string;
    cause: string;
    solution: string[];
    recommendedProduct: string;
    crop: string;
    cropMr: string;
    confidence: number;
}

let diseaseDb: DiseaseEntry[] = [];

/** Load disease knowledge base from JSON */
function loadDiseases(): DiseaseEntry[] {
    if (diseaseDb.length > 0) return diseaseDb;
    try {
        const filePath = join(__dirname, '..', 'knowledge', 'diseases.json');
        const raw = readFileSync(filePath, 'utf-8');
        diseaseDb = JSON.parse(raw);
        console.log(`[DiseaseMatcher] Loaded ${diseaseDb.length} disease entries`);
        return diseaseDb;
    } catch (err: any) {
        console.error('[DiseaseMatcher] Failed to load diseases.json:', err?.message);
        return [];
    }
}

/**
 * Match farmer's symptom description to the best disease entry.
 * Returns null if no match found (confidence = 0).
 */
export function matchDisease(farmerText: string): DiseaseMatch | null {
    const diseases = loadDiseases();
    const text = farmerText.toLowerCase();

    let bestMatch: DiseaseMatch | null = null;
    let highestScore = 0;

    for (const entry of diseases) {
        let score = 0;

        for (const symptom of entry.symptoms) {
            if (text.includes(symptom.toLowerCase())) {
                score += 2; // Exact match gets 2 points
            } else {
                // Partial word matching
                const words = symptom.toLowerCase().split(/\s+/);
                for (const word of words) {
                    if (word.length > 2 && text.includes(word)) {
                        score += 0.5;
                    }
                }
            }
        }

        // Bonus if farmer mentions the crop name
        if (text.includes(entry.cropMr.toLowerCase()) || text.includes(entry.crop.toLowerCase())) {
            score += 1;
        }

        if (score > highestScore) {
            highestScore = score;
            bestMatch = {
                disease: entry.disease,
                cause: entry.cause,
                solution: entry.solution,
                recommendedProduct: entry.recommendedProduct,
                crop: entry.crop,
                cropMr: entry.cropMr,
                confidence: score,
            };
        }
    }

    if (highestScore === 0) return null;

    console.log(`[DiseaseMatcher] Best match: ${bestMatch?.disease} (confidence: ${highestScore})`);
    return bestMatch;
}

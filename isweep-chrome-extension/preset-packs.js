// preset-packs.js
// Centralized preset word packs for the ISweep extension. This module is intentionally UI-agnostic.

export const PRESET_PACKS = {
    language: {
        profanity: {
            words: [
                "fuck",
                "damn",
                "shit",
                "bitch",
                "bastard",
                "asshole",
                "motherfucker",
                "dick",
                "cunt",
                "piss",
                "bollocks"
            ]
        },
        mild_language: {
            words: [
                "crap",
                "damn",
                "hell",
                "screw",
                "sucks",
                "friggin",
                "bloody"
            ]
        },
        blasphemy: {
            words: [
                "jesus christ",
                "goddamn",
                "oh my god",
                "for god's sake",
                "god almighty",
                "christ"
            ]
        }
    }
    // Future categories can be added here, e.g. intimacy, nudity, violence, substance.
};

/**
 * Return the word list for a given category/subcategory. Falls back to an empty array.
 * @param {string} category
 * @param {string} subcategory
 * @returns {string[]}
 */
export function getPackWords(category, subcategory) {
    const cat = PRESET_PACKS[category];
    if (!cat) return [];
    const sub = cat[subcategory];
    if (!sub || !Array.isArray(sub.words)) return [];
    return sub.words.slice(); // return a shallow copy
}

/**
 * Merge preset words with custom words, dedupe, and lowercase everything.
 * @param {string[]} presetWords
 * @param {string[]} customWords
 * @returns {string[]}
 */
export function mergeWords(presetWords = [], customWords = []) {
    const merged = new Set();
    [...presetWords, ...customWords]
        .map(w => (w || "").toString().trim().toLowerCase())
        .filter(Boolean)
        .forEach(w => merged.add(w));
    return Array.from(merged);
}

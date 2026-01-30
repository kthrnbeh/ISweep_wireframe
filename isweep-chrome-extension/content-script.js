// content-script.js
(function() {
'use strict';

/**
 * Content script injected into every page
 * Detects videos, extracts captions, and controls playback
 * Supports: HTML5 video + YouTube
 */

// Global debug flag (shared across extension); default to true if undefined
window.__ISWEEP_DEBUG = (window.__ISWEEP_DEBUG ?? true);

// Helper function for conditional logging
function csLog(...args) {
    if (window.__ISWEEP_DEBUG) {
        console.log('[ISweep-CS]', ...args);
    }
}

// Prevent double-injection
if (window.__isweepContentLoaded) {
    csLog('[ISweep] content-script already loaded; skipping duplicate injection');
    return;
}
window.__isweepContentLoaded = true;

let isEnabled = false;
let userId = 'user123';
let backendURL = 'http://127.0.0.1:8001';
let detectedVideos = 0;
let appliedActions = 0;
let isMuted = false; // Safe mute state
let unmuteTimerId = null; // Track scheduled unmute timer
let muteUntil = 0; // Track when mute should end to prevent over-muting
let lastMutedTerm = null; // Track last muted term for cooldown
let lastMuteStartTs = 0; // Timestamp when last mute started
let muteCooldownMs = 250; // Cooldown to prevent re-muting same term too quickly
let speechRecognition = null;
let speechActive = false;
let speechVideoRef = null;
let speechUnsupportedLogged = false;
let lastSpeechErrorTs = 0; // Track speech fallback errors for cooldown

// ASR session timing (for absolute video timestamp conversion)
let asrSessionStart = 0; // Video time when ASR session started
let asrSessionActive = false; // Whether ASR session is active
let asrLastSegmentTs = 0; // Date.now() when last segment arrived
let asrLastAbsTime = 0; // Last absolute timestamp we ingested (for monotonic validation)
const ASR_SILENCE_RESET_MS = 35000; // Reset session if no segments for 35s
const ASR_REBASE_DRIFT_SEC = 5; // Tolerance for timestamp rebase (self-healing)
const ASR_MIN_MONOTONIC_BACKSTEP_SEC = 0.25; // Allow tiny ordering jitter, not big resets
let __asrWarnedEmptyText = false; // Track if we've logged empty text warning
let __asrWarnedBadEnd = false; // Track if we've logged invalid timestamp warning
let __asrWarnedNonMonotonic = false; // Track if we've logged non-monotonic segment warning
let __asrWarnedIngestMissing = false; // Track if we've logged missing ingest function warning

// In-memory preferences organized by category
let prefsByCategory = {
    language: {
        blocked_words: [],
        duration_seconds: 0.5,
        action: 'mute',
        caption_offset_ms: 300
    }
};

/**
 * Normalize text for matching: lowercase, remove punctuation (preserve apostrophes), collapse whitespace
 */
function normalizeText(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[.,!?;:\-"()\[\]{}]/g, ' ') // Remove punctuation but preserve apostrophes
        .replace(/\s+/g, ' ') // Collapse whitespace
        .trim();
}

function textIncludesTerm(normalizedText, term) {
    const normalizedTerm = normalizeText(term);
    if (!normalizedText || !normalizedTerm) return false;
    return normalizedText.includes(normalizedTerm);
}

/**
 * Estimate a natural mute duration for a matched term based on spoken word timing.
 * Uses character/word length as proxy for speech duration.
 * 
 * Timing model:
 * - Base: 0.20s (minimum word duration)
 * - Per character: 0.04s (average speaking rate ~3-4 chars/second)
 * - Per word: 0.15s (word boundary pause)
 * - Padding: 0.08s (release buffer)
 * - Bounds: 0.25s - 0.90s (prevents too short/long mutes)
 */
function computeMuteDuration(term, baseDurationSeconds) {
    const normalized = normalizeText(term || '');
    if (!normalized) {
        return 0.30; // Short default for empty/invalid terms
    }

    const words = normalized.split(' ').filter(Boolean);
    const wordCount = Math.max(1, words.length);
    const charCount = normalized.replace(/\s+/g, '').length;

    // Known term duration map for common words
    const knownDurations = {
        'god': 0.35,
        'fuck': 0.40,
        'shit': 0.35,
        'damn': 0.35,
        'hell': 0.35,
        'jesus': 0.45,
        'christ': 0.40,
        'bitch': 0.40,
        'ass': 0.30,
        'asshole': 0.50
    };

    // Check for exact match in known durations
    if (knownDurations[normalized]) {
        return knownDurations[normalized];
    }

    // Heuristic calculation for unknown terms
    // Base timing: 0.20s + 0.04s per char + 0.15s per word boundary
    let duration = 0.20 + (charCount * 0.04) + ((wordCount - 1) * 0.15);
    
    // Add small release padding for natural unmute
    const releasePadding = 0.08;
    duration += releasePadding;
    
    // Clamp to reasonable bounds (0.25s - 0.90s)
    // This prevents:
    // - Too short: <0.25s might cut off word start
    // - Too long: >0.90s keeps muted past word end
    return Math.min(0.90, Math.max(0.25, duration));
}

function shouldApplyMute(term) {
    const now = Date.now();
    
    // Check if we're in cooldown for the same term
    if (lastMutedTerm === term && (now - lastMuteStartTs) < muteCooldownMs) {
        csLog(`[ISweep] Cooldown active for term "${term}", skipping mute`);
        return false;
    }
    
    return true;
}

/**
 * Fetch preferences from backend for the current user
 */
async function fetchPreferencesFromBackend() {
    try {
        const url = `${backendURL}/preferences/${userId}`;
        csLog('[ISweep] Fetching preferences from:', url);
        
        const response = await fetch(url);
        if (!response.ok) {
            csLog('[ISweep] Failed to fetch preferences, using cached/defaults');
            return false;
        }
        
        const data = await response.json();
        csLog('[ISweep] Raw backend response:', JSON.stringify(data));

        // Response format: { user_id, preferences: { category: {...}, ... } }
        const prefDict = data.preferences || {};
        const nextPrefs = {};

        Object.entries(prefDict).forEach(([category, pref]) => {
            if (!pref) return;
            const blockedWords = Array.isArray(pref.blocked_words)
                ? pref.blocked_words
                : typeof pref.blocked_words === 'string'
                    ? pref.blocked_words
                        .split(',')
                        .map(w => w.trim())
                        .filter(Boolean)
                    : [];

            nextPrefs[category] = {
                blocked_words: blockedWords,
                duration_seconds: Number(pref.duration_seconds ?? 0.5),
                action: pref.action || 'mute',
                caption_offset_ms: Number(pref.caption_offset_ms ?? 300)
            };
        });

        // Merge incoming prefs; keep existing defaults when missing
        prefsByCategory = {
            ...prefsByCategory,
            ...nextPrefs,
        };
        prefsByCategory.language = prefsByCategory.language || { blocked_words: [], duration_seconds: 0.5, action: 'mute', caption_offset_ms: 300 };

        // Cache the unified prefsByCategory structure to localStorage
        await chrome.storage.local.set({ cachedPrefsByCategory: prefsByCategory });
        csLog('[ISweep] Cached prefsByCategory to storage');

        csLog('[ISweep] Loaded prefsByCategory keys:', Object.keys(prefsByCategory));
        csLog(`[ISweep] Language blocked_words derived count: ${(prefsByCategory.language.blocked_words || []).length}`);
        return true;
    } catch (error) {
        csLog('[ISweep] Error fetching preferences:', error.message || error);
        return false;
    }
}

// Initialize from storage on load
async function initializeFromStorage() {
    const result = await chrome.storage.local.get(['isweep_enabled', 'isweepPrefs', 'cachedPrefsByCategory', 'userId', 'backendURL']);
    
    // Set enabled state
    isEnabled = Boolean(result.isweep_enabled);
    
    // Use isweepPrefs as primary source, fallback to individual keys for backward compatibility
    if (result.isweepPrefs) {
        userId = result.isweepPrefs.user_id || 'user123';
        backendURL = result.isweepPrefs.backendUrl || 'http://127.0.0.1:8001';
        
        // Set blocked_words from isweepPrefs
        if (result.isweepPrefs.blocked_words && Array.isArray(result.isweepPrefs.blocked_words)) {
            prefsByCategory.language.blocked_words = result.isweepPrefs.blocked_words;
        }
        
        // Set other language category settings from isweepPrefs if available
        if (result.isweepPrefs.duration_seconds !== undefined) {
            prefsByCategory.language.duration_seconds = result.isweepPrefs.duration_seconds;
        }
        if (result.isweepPrefs.action) {
            prefsByCategory.language.action = result.isweepPrefs.action;
        }
        if (result.isweepPrefs.caption_offset_ms !== undefined) {
            prefsByCategory.language.caption_offset_ms = result.isweepPrefs.caption_offset_ms;
        }
        
        csLog('[ISweep] LOADED settings from isweepPrefs (primary source)');
    } else {
        // Fallback to individual keys for backward compatibility
        userId = result.userId || 'user123';
        backendURL = result.backendURL || 'http://127.0.0.1:8001';
        
        // Load cached preferences if available
        if (result.cachedPrefsByCategory) {
            prefsByCategory = result.cachedPrefsByCategory;
            csLog('[ISweep] LOADED cachedPrefsByCategory from storage, categories:', Object.keys(prefsByCategory));
        }
        
        csLog('[ISweep] LOADED settings from legacy keys (backward compatibility)');
    }
    
    csLog('[ISweep] LOADED enabled state:', isEnabled);
    csLog('[ISweep] LOADED userId:', userId);
    csLog('[ISweep] LOADED backendURL:', backendURL);
    csLog(`[ISweep] LOADED language blocked_words count: ${(prefsByCategory.language?.blocked_words || []).length}`);
    
    // Only proceed if enabled
    if (!isEnabled) {
        csLog('[ISweep] Extension is DISABLED, skipping preference fetch');
        return;
    }
    
    // If enabled, fetch fresh preferences from backend (and update cache)
    csLog('[ISweep] Extension is ENABLED, fetching fresh preferences from backend...');
    await fetchPreferencesFromBackend();
}

/**
 * Pure ASR segments handler: processes segments with absolute timestamp conversion,
 * rebase validation, and monotonic checking. Returns result object (does NOT call sendResponse).
 * 
 * Returns: { success: boolean, error?: string, ingestedCount: number, rebaseOccurred: boolean }
 * 
 * INVARIANTS:
 * - Monotonic Guarantee: asrLastAbsTime is never decreased. Segments with timestamps
 *   earlier than (asrLastAbsTime - ASR_MIN_MONOTONIC_BACKSTEP_SEC) are dropped as duplicates/out-of-order.
 * 
 * - Rebase Contract: When a segment's computed absolute time is earlier than
 *   (videoNow - ASR_REBASE_DRIFT_SEC), the handler self-heals by rebasing asrSessionStart.
 *   This corrects for stale session or backend buffer resets. rebaseOccurred flag signals this.
 * 
 * - asrLastAbsTime Updates: asrLastAbsTime is ONLY updated after a segment is successfully
 *   ingested via __isweepTranscriptIngest. If __isweepTranscriptIngest is unavailable,
 *   asrLastAbsTime does not advance and the warning flag __asrWarnedIngestMissing is set once.
 */
function __isweepHandleAsrSegments(message) {
    // Validate payload
    if (!message || !message.segments || !Array.isArray(message.segments)) {
        return { success: false, error: 'invalid_segments', ingestedCount: 0, rebaseOccurred: false };
    }
    
    try {
        // Ingest ASR segments from backend with absolute timestamp conversion, rebase, and monotonic validation
        const video = getActiveVideo();
        
        // Skip all segments if no active video
        if (!video) {
            csLog('[ISweep-ASR] Warning: No active video, skipping segment ingestion');
            return { success: false, error: 'no_active_video', ingestedCount: 0, rebaseOccurred: false };
        }
        
        let ingestedCount = 0;
        let rebaseOccurred = false;
        
        // Initialize or reset ASR session on first segment or after silence
        const now = Date.now();
        if (!asrSessionActive || (now - asrLastSegmentTs) > ASR_SILENCE_RESET_MS) {
            asrSessionStart = Number.isFinite(Number(video.currentTime)) ? video.currentTime : 0;
            asrSessionActive = true;
            asrLastAbsTime = 0; // Reset monotonic tracker on new session
            __asrWarnedEmptyText = false; // Reset warning flags on new session
            __asrWarnedBadEnd = false;
            __asrWarnedNonMonotonic = false;
            __asrWarnedIngestMissing = false;
            if (window.__ISWEEP_DEBUG) {
                csLog(`[ISweep-ASR] Session start: ${asrSessionStart.toFixed(2)}s`);
            }
        }
        
        asrLastSegmentTs = now;
        
        // Ingest each segment with absolute timestamp, rebase validation, and monotonic checking
        message.segments.forEach(seg => {
            // Defensive: skip segments with empty text
            const textValid = seg.text && String(seg.text).trim().length > 0;
            if (!textValid) {
                if (!__asrWarnedEmptyText && window.__ISWEEP_DEBUG) {
                    csLog('[ISweep-ASR] Skipping segment: empty or missing text');
                    __asrWarnedEmptyText = true;
                }
                return; // Skip this segment
            }
            
            // Defensive: skip segments with invalid timestamps
            const relEnd = Number(seg.end_seconds);
            if (!Number.isFinite(relEnd)) {
                if (!__asrWarnedBadEnd && window.__ISWEEP_DEBUG) {
                    csLog(`[ISweep-ASR] Skipping segment: invalid end_seconds (${seg.end_seconds})`);
                    __asrWarnedBadEnd = true;
                }
                return; // Skip this segment
            }
            
            // Compute candidate absolute timestamp
            let absCandidate = asrSessionStart + relEnd;
            
            // Rebase rule: self-healing for stale sessionStart or backend buffer reset
            const videoNow = Number(video.currentTime);
            if (Number.isFinite(videoNow) && absCandidate < (videoNow - ASR_REBASE_DRIFT_SEC)) {
                // Our sessionStart is stale or backend reset to new buffer.
                // Rebase so relEnd aligns with current playback time.
                asrSessionStart = Math.max(0, videoNow - relEnd);
                asrSessionActive = true;
                absCandidate = asrSessionStart + relEnd;
                rebaseOccurred = true;
                if (window.__ISWEEP_DEBUG) {
                    csLog(`[ISweep-ASR] REBASE: videoNow=${videoNow.toFixed(2)} relEnd=${relEnd.toFixed(2)} newSessionStart=${asrSessionStart.toFixed(2)} abs=${absCandidate.toFixed(2)}`);
                }
            }
            
            // Monotonic rule: drop non-monotonic segments (duplicates, out-of-order)
            if (absCandidate < (asrLastAbsTime - ASR_MIN_MONOTONIC_BACKSTEP_SEC)) {
                // Likely duplicate or out-of-order segment; drop it
                if (!__asrWarnedNonMonotonic && window.__ISWEEP_DEBUG) {
                    csLog(`[ISweep-ASR] Dropped non-monotonic segment abs=${absCandidate.toFixed(2)} last=${asrLastAbsTime.toFixed(2)}`);
                    __asrWarnedNonMonotonic = true;
                }
                return; // Skip this segment
            }
            
            // Ingest segment with validated and corrected absolute timestamp
            if (typeof window.__isweepTranscriptIngest === 'function') {
                if (window.__ISWEEP_DEBUG) {
                    csLog(`[ISweep-ASR] sessionStart=${asrSessionStart.toFixed(2)} segEnd=${relEnd.toFixed(2)} → abs=${absCandidate.toFixed(2)}`);
                }
                
                window.__isweepTranscriptIngest({
                    text: seg.text,
                    timestamp_seconds: absCandidate,
                    source: 'backend_asr'
                });
                
                // Update monotonic tracker only after successful ingestion
                asrLastAbsTime = absCandidate;
                ingestedCount++;
            } else {
                // __isweepTranscriptIngest not available; do not update monotonic tracker
                if (!__asrWarnedIngestMissing && window.__ISWEEP_DEBUG) {
                    csLog('[ISweep-ASR] Warning: __isweepTranscriptIngest function not available');
                    __asrWarnedIngestMissing = true;
                }
            }
        });
        
        return { success: true, ingestedCount, rebaseOccurred };
    } catch (error) {
        if (window.__ISWEEP_DEBUG) {
            csLog('[ISweep-ASR] Exception in handler:', error);
        }
        return { success: false, error: 'asr_handler_exception', ingestedCount: 0, rebaseOccurred: false };
    }
}

// Listen for toggle messages from popup (SINGLE unified listener)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.action === 'ASR_SEGMENTS') {
        const result = __isweepHandleAsrSegments(message);
        sendResponse(result);
        return true;
    } else if (message && message.action === 'toggleISweep' && typeof message.enabled !== 'undefined') {
        isEnabled = message.enabled;
        csLog('[ISweep] Toggled via popup:', isEnabled ? 'ENABLED' : 'DISABLED');
        
        // Update status pill
        updateStatusIcon(isEnabled);
        
        // Update prefs if provided
        if (message.prefs) {
            prefsByCategory.language = {
                blocked_words: message.prefs.blocked_words || [],
                duration_seconds: message.prefs.duration_seconds || 0.5,
                action: message.prefs.action || 'mute'
            };
            userId = message.prefs.user_id || userId;
            backendURL = message.prefs.backendUrl || backendURL;
        }
        
        // If enabled, fetch fresh preferences from backend
        if (isEnabled) {
            csLog('[ISweep] Fetching preferences after toggle...');
            fetchPreferencesFromBackend();
        } else {
            // If disabled, stop speech recognition and unmute only videos ISweep muted
            stopSpeechFallback();
            document.querySelectorAll('video').forEach(v => {
                // Only unmute if ISweep muted it (don't unmute user-manual mutes)
                if (v._isweepMutedByUs) {
                    v.muted = false;
                    v._isweepMutedByUs = false;
                    csLog('[ISweep] Unmuted video (ISweep cleanup on disable)');
                }
            });
            // Clear any pending unmute timer and reset mute state
            if (unmuteTimerId !== null) {
                clearTimeout(unmuteTimerId);
                unmuteTimerId = null;
            }
            isMuted = false;
            lastMutedTerm = null;
            muteUntil = 0;
            
            // Reset ASR session state
            asrSessionStart = 0;
            asrSessionActive = false;
            asrLastSegmentTs = 0;
            asrLastAbsTime = 0;
        }
        
        sendResponse({ success: true });
        return true; // Keep message channel open for async operations
    }
});

// Listen for storage changes from other tabs/windows
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    
    // Handle isweep_enabled changes
    if (changes.isweep_enabled && typeof changes.isweep_enabled.newValue !== 'undefined') {
        isEnabled = Boolean(changes.isweep_enabled.newValue);
        csLog('[ISweep] isweep_enabled changed via storage:', isEnabled);
        updateStatusIcon(isEnabled);
        
        // If disabled, cleanup
        if (!isEnabled) {
            stopSpeechFallback();
            document.querySelectorAll('video').forEach(v => {
                if (v._isweepMutedByUs) {
                    v.muted = false;
                    v._isweepMutedByUs = false;
                }
            });
            if (unmuteTimerId !== null) {
                clearTimeout(unmuteTimerId);
                unmuteTimerId = null;
            }
            isMuted = false;
            lastMutedTerm = null;
            muteUntil = 0;
            
            // Reset ASR session state
            asrSessionStart = 0;
            asrSessionActive = false;
            asrLastSegmentTs = 0;
            asrLastAbsTime = 0;
        }
    }
    
    // Handle isweepPrefs changes (new primary source)
    if (changes.isweepPrefs && changes.isweepPrefs.newValue) {
        const prefs = changes.isweepPrefs.newValue;
        
        // Update userId and backendURL
        if (prefs.user_id) {
            userId = prefs.user_id;
            csLog('[ISweep] userId updated via isweepPrefs:', userId);
        }
        if (prefs.backendUrl) {
            backendURL = prefs.backendUrl;
            csLog('[ISweep] backendURL updated via isweepPrefs:', backendURL);
        }
        
        // Update language preferences
        if (prefs.blocked_words && Array.isArray(prefs.blocked_words)) {
            prefsByCategory.language.blocked_words = prefs.blocked_words;
        }
        if (prefs.duration_seconds !== undefined) {
            prefsByCategory.language.duration_seconds = prefs.duration_seconds;
        }
        if (prefs.action) {
            prefsByCategory.language.action = prefs.action;
        }
        if (prefs.caption_offset_ms !== undefined) {
            prefsByCategory.language.caption_offset_ms = prefs.caption_offset_ms;
        }
        
        csLog('[ISweep] Preferences updated via isweepPrefs storage change');
    }
    
    // Backward compatibility: handle legacy individual keys if isweepPrefs not present
    if (!changes.isweepPrefs) {
        if (changes.userId && typeof changes.userId.newValue === 'string') {
            userId = changes.userId.newValue;
            csLog('[ISweep] userId updated via legacy key:', userId);
        }
        if (changes.backendURL && typeof changes.backendURL.newValue === 'string') {
            backendURL = changes.backendURL.newValue;
            csLog('[ISweep] backendURL updated via legacy key:', backendURL);
        }
        if (changes.cachedPrefsByCategory && changes.cachedPrefsByCategory.newValue) {
            prefsByCategory = changes.cachedPrefsByCategory.newValue;
            csLog('[ISweep] Preferences updated via cachedPrefsByCategory:', Object.keys(prefsByCategory));
        }
    }
});

function getActiveVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    return videos.find(v => !v.paused && !v.ended && v.readyState >= 2) || videos[0] || null;
}

/**
 * Check if text contains any blocked words (case-insensitive, normalized matching)
 * Returns { matched: true, word: "..." } or { matched: false }
 */
function getLangPrefs() {
    return prefsByCategory.language || { blocked_words: [], duration_seconds: 0.5, action: 'mute' };
}

/**
 * Check all categories for blocked words
 * Returns { matched: true, category, word, action, duration_seconds } or { matched: false }
 */
function checkAllCategoriesForBlockedWords(text) {
    const normalizedText = normalizeText(text);
    
    // Iterate through all categories in prefsByCategory
    for (const [category, prefs] of Object.entries(prefsByCategory)) {
        if (!prefs || !prefs.blocked_words || prefs.blocked_words.length === 0) {
            continue;
        }
        
        // Check if any blocked word in this category matches
        for (const blockedWord of prefs.blocked_words) {
            const normalizedBlocked = normalizeText(blockedWord);
            if (normalizedBlocked && normalizedText.includes(normalizedBlocked)) {
                csLog('[ISweep] Local blocked word match in category:', { 
                    category, 
                    original: text, 
                    normalized: normalizedText, 
                    blockedWord 
                });
                return { 
                    matched: true, 
                    category, 
                    word: blockedWord,
                    action: prefs.action || 'mute',
                    duration_seconds: prefs.duration_seconds || 0.5
                };
            }
        }
    }
    
    return { matched: false };
}

function startSpeechFallback(videoElement) {
    if (speechActive) return;
    
    // Skip speech fallback on YouTube (handled by youtube-handler)
    if (isYouTubeHost()) {
        csLog('[ISweep] YouTube detected - skipping speech fallback');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        if (!speechUnsupportedLogged) {
            speechUnsupportedLogged = true;
            csLog('[ISweep] SpeechRecognition not available; fallback skipped');
        }
        return;
    }

    // Check if we're in cooldown period after an error (30 second cooldown)
    const now = Date.now();
    if (now - lastSpeechErrorTs < 30000) {
        return;
    }

    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = false;
    speechRecognition.lang = 'en-US';
    speechVideoRef = videoElement;

    speechRecognition.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        if (!last || !last[0]) return;
        const transcript = (last[0].transcript || '').trim();
        if (!transcript) return;
        window.__isweepTranscriptIngest({
            text: transcript,
            timestamp_seconds: speechVideoRef ? speechVideoRef.currentTime : 0,
            source: 'speech_fallback'
        });
    };

    speechRecognition.onerror = () => {
        lastSpeechErrorTs = Date.now();
        csLog('[ISweep] Speech recognition error, cooldown until', new Date(lastSpeechErrorTs + 30000).toISOString());
        stopSpeechFallback();
    };

    speechRecognition.onend = () => {
        speechActive = false;
    };

    try {
        speechRecognition.start();
        speechActive = true;
        csLog('[ISweep] Speech fallback started');
    } catch (err) {
        csLog('[ISweep] Speech fallback start failed', err.message || err);
        speechActive = false;
    }
}

function stopSpeechFallback() {
    if (!speechActive && !speechRecognition) return;
    try {
        if (speechRecognition) {
            speechRecognition.onresult = null;
            speechRecognition.onerror = null;
            speechRecognition.onend = null;
            speechRecognition.stop();
        }
    } catch (_) {
        // ignore
    }
    speechRecognition = null;
    speechVideoRef = null;
    speechActive = false;
}

// ===== TRANSCRIPT ENGINE =====
// Unified transcript ingestion module that normalizes and deduplicates input from multiple sources
let lastTranscriptTs = Date.now(); // Shared timestamp used by speech fallback logic
let lastIngestedText = null; // Track last ingested text for deduplication
let lastIngestTs = 0; // Track last ingestion timestamp for deduplication
const DEDUPE_WINDOW_MS = 1200; // Drop repeats within 1200ms

/**
 * Standardized transcript input from multiple sources (HTML5 captions, SpeechRecognition, etc.)
 * Normalizes text, deduplicates repeats, updates shared lastTranscriptTs, and calls __isweepEmitText
 * 
 * @param {Object} params - Transcript parameters
 * @param {string} params.text - Raw transcript text
 * @param {number} params.timestamp_seconds - Video timestamp in seconds
 * @param {string} params.source - Source identifier (e.g., 'html5_dom', 'speech_fallback', 'youtube_dom')
 */
window.__isweepTranscriptIngest = function({ text, timestamp_seconds, source }) {
    if (!text || !text.trim()) {
        csLog(`[ISweep-TE] Dropped empty text from ${source}`);
        return;
    }
    
    // Normalize text for deduplication
    const normalized = normalizeText(text);
    if (!normalized) {
        csLog(`[ISweep-TE] Dropped text with no normalized content from ${source}`);
        return;
    }
    
    // Deduplicate: drop same normalized text within 1200ms window
    const now = Date.now();
    if (lastIngestedText === normalized && (now - lastIngestTs) < DEDUPE_WINDOW_MS) {
        csLog(`[ISweep-TE] Deduped repeat text from ${source}: "${text.substring(0, 30)}..." (within ${DEDUPE_WINDOW_MS}ms)`);
        return;
    }
    
    // Update deduplication tracking
    lastIngestedText = normalized;
    lastIngestTs = now;
    
    // Update shared transcript timestamp (used by speech fallback logic)
    lastTranscriptTs = now;
    
    csLog(`[ISweep-TE] Ingested from ${source}: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
    // Pass to existing emit handler
    window.__isweepEmitText({
        text,
        timestamp_seconds,
        source
    });
};

// ===== END TRANSCRIPT ENGINE =====

/**
 * Debug helper: self-test the ISweep pipeline
 * Usage: window.__isweepSelfTest() in console
 */
window.__isweepSelfTest = function() {
    console.log('[ISweep] SelfTest starting');
    console.log('enabled=', isEnabled);
    console.log('hasTranscriptIngest=', typeof window.__isweepTranscriptIngest);
    console.log('hasEmitText=', typeof window.__isweepEmitText);
    const v = document.querySelector('video');
    console.log('hasVideo=', !!v, 'paused=', v?.paused, 't=', v?.currentTime);
    window.__isweepTranscriptIngest?.({ text: 'self test bitch', timestamp_seconds: v?.currentTime || 0, source: 'manual_test' });
};

/**
 * Debug helper: Simulate ASR segment for testing
 * Usage: window.__isweepDebugSimulateAsr("test text", 1.5)
 */
window.__isweepDebugSimulateAsr = function(text, endSeconds) {
    const video = getActiveVideo();
    
    // Safe guard: require active video
    if (!video) {
        csLog('[ISweep-ASR-Debug] No active video, aborting simulation');
        return;
    }
    
    // Initialize or update session state
    if (!asrSessionActive) {
        asrSessionStart = Number.isFinite(Number(video.currentTime)) ? video.currentTime : 0;
        asrSessionActive = true;
        csLog(`[ISweep-ASR-Debug] Session initialized: ${asrSessionStart.toFixed(2)}s`);
    }
    
    // Compute absolute time
    const relativeTime = Number(endSeconds) || 0;
    const absTime = asrSessionStart + relativeTime;
    
    csLog(`[ISweep-ASR-Debug] Simulating: text="${text}" sessionStart=${asrSessionStart.toFixed(2)} segEnd=${relativeTime.toFixed(2)} → abs=${absTime.toFixed(2)}`);
    
    // Ingest through same path
    if (typeof window.__isweepTranscriptIngest === 'function') {\n        window.__isweepTranscriptIngest({\n            text: text,\n            timestamp_seconds: absTime,\n            source: 'backend_asr'\n        });\n    } else {\n        csLog('[ISweep-ASR-Debug] ERROR: __isweepTranscriptIngest not available');\n    }\n};\n\nwindow.__isweepApplyDecision = function(decision) {\n    const videoElement = getActiveVideo();\n    if (!videoElement) {\n        csLog('[ISweep] No active video to apply decision');\n        return;\n    }

    const { action, duration_seconds, reason, matched_term, matched_category } = decision;
    const langPrefs = getLangPrefs();
    
    // For mute actions, always use word-based timing heuristic
    let durationSeconds;
    if (action === 'mute' && matched_term) {
        durationSeconds = computeMuteDuration(matched_term, 0.5);
        csLog(`[ISweep] Computed mute duration for "${matched_term}": ${durationSeconds.toFixed(2)}s`);
    } else {
        // Non-mute actions use backend/prefs duration
        const backendDuration = Number(duration_seconds);
        const prefsDuration = Number(langPrefs.duration_seconds);
        const fallbackDuration = 3;
        durationSeconds = Number.isFinite(backendDuration) ? backendDuration 
                        : Number.isFinite(prefsDuration) ? prefsDuration 
                        : fallbackDuration;
    }
    
    const duration = Math.max(0, durationSeconds);
    const durationMs = duration * 1000;

    csLog(`[ISweep] APPLYING ACTION: ${action} (duration: ${duration}s) - ${reason}`);

    switch (action) {
        case 'mute':
            const now = Date.now();
            const categoryPrefs = prefsByCategory[matched_category] || {};
            const captionOffsetMs = Number(categoryPrefs.caption_offset_ms ?? 300);
            
            csLog(`[ISweep] Timing: caption_offset_ms=${captionOffsetMs}ms for category "${matched_category}"`);
            
            // Calculate when this mute would end
            const scheduledMuteStart = now + captionOffsetMs;
            const scheduledMuteEnd = scheduledMuteStart + durationMs;
            
            csLog(`[ISweep] Timing: now=${now}ms, scheduledStart=${scheduledMuteStart}ms, scheduledEnd=${scheduledMuteEnd}ms`);
            
            // If already muted, extend the mute period (don't block if already filtering)
            if (isMuted && now < muteUntil) {
                const oldMuteUntil = muteUntil;
                muteUntil = Math.max(muteUntil, scheduledMuteEnd);
                const extended = muteUntil > oldMuteUntil;
                
                csLog(`[ISweep] Cooldown: isMuted=true, muteUntil_before=${oldMuteUntil}ms, muteUntil_after=${muteUntil}ms, extended=${extended}`);
                return; // Already muted, just extended timing
            }
            
            // Cooldown check only applies to NEW mutes (not when extending active ones)
            if (!shouldApplyMute(matched_term)) {
                csLog(`[ISweep] Cooldown: blocked starting new mute for term "${matched_term}"`);
                return;
            }
            
            csLog(`[ISweep] Cooldown: cooldown check passed, starting new mute`);
            
            // Clear any existing unmute timer
            if (unmuteTimerId !== null) {
                clearTimeout(unmuteTimerId);
                unmuteTimerId = null;
            }
            
            // Schedule mute to start after caption offset
            setTimeout(() => {
                // Apply short word-based mute
                videoElement.muted = true;
                videoElement._isweepMutedByUs = true; // Track that ISweep muted this video
                isMuted = true;
                muteUntil = scheduledMuteEnd;
                lastMutedTerm = matched_term;
                lastMuteStartTs = Date.now(); // Capture actual mute start time (not scheduled time)
                appliedActions++;
                
                csLog(`[ISweep] MUTED: term="${matched_term}" duration=${duration.toFixed(2)}s offset=${captionOffsetMs}ms unmute_at=${new Date(muteUntil).toISOString()}`);
                
                // Schedule unmute
                unmuteTimerId = setTimeout(() => {
                    if (Date.now() >= muteUntil) {
                        // Only unmute if ISweep muted it (don't unmute user-manual mutes)
                        if (videoElement._isweepMutedByUs) {
                            videoElement.muted = false;
                            videoElement._isweepMutedByUs = false; // Clear flag after unmuting
                            csLog('[ISweep] UNMUTED after word duration');
                        }
                        isMuted = false;
                        unmuteTimerId = null;
                    }
                }, durationMs);
            }, Math.max(0, captionOffsetMs)); // Use max(0, offset) to allow negative premute but execute immediately for instant timing
            break;
        case 'skip':
            videoElement.currentTime = Math.min(videoElement.currentTime + duration, videoElement.duration || Infinity);
            appliedActions++;
            csLog(`[ISweep] SKIPPED ${duration} seconds`);
            break;
        case 'fast_forward': {
            const originalSpeed = videoElement.playbackRate;
            videoElement.playbackRate = 2.0;
            appliedActions++;
            csLog(`[ISweep] FAST FORWARD started`);
            setTimeout(() => { 
                videoElement.playbackRate = originalSpeed;
                csLog('[ISweep] FAST FORWARD ended, restored speed');
            }, durationMs);
            break;
        }
        default:
            break;
    }

    updateStats();
};

window.__isweepEmitText = async function({ text, timestamp_seconds, source, caption_start_seconds, caption_end_seconds }) {
    if (!isEnabled) return;

    // Note: lastTranscriptTs now updated by __isweepTranscriptIngest (TranscriptEngine)
    if (speechActive) {
        stopSpeechFallback();
    }

    // Normalize caption text before matching
    const normalizedText = normalizeText(text);
    csLog('[ISweep] Processing caption:', { original: text, normalized: normalizedText, source });

    // Check for local blocked words across all categories
    const blockedCheck = checkAllCategoriesForBlockedWords(text);
    if (blockedCheck.matched) {
        csLog(`[ISweep] MATCHED blocked word in "${blockedCheck.category}": "${blockedCheck.word}"`);
        // Apply action immediately using category-specific settings
        window.__isweepApplyDecision({
            action: blockedCheck.action || 'mute',
            duration_seconds: blockedCheck.duration_seconds || 0.5,
            reason: `Matched blocked word in "${blockedCheck.category}": "${blockedCheck.word}"`,
            matched_term: blockedCheck.word,
            matched_category: blockedCheck.category,
            timestamp_seconds,
            caption_start_seconds,
            caption_end_seconds
        });
        return;
    }

    const payload = {
        user_id: userId,
        text: normalizedText, // Send normalized text to backend
        timestamp_seconds,
        confidence: 0.9,
        content_type: source || null
    };

    csLog('[ISweep] Backend request:', { url: `${backendURL}/event`, payload });

    try {
        const response = await fetch(`${backendURL}/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            csLog('[ISweep] Backend error:', { status: response.status, body: errorText });
            throw new Error(`API error: ${response.status}`);
        }

        const decision = await response.json();
        csLog('[ISweep] Backend response:', decision);

        if (decision.action !== 'none') {
            decision.timestamp_seconds = timestamp_seconds;
            decision.caption_start_seconds = caption_start_seconds;
            decision.caption_end_seconds = caption_end_seconds;
            window.__isweepApplyDecision(decision);
        }
    } catch (error) {
        console.warn('[ISweep] API error:', error);
    }
};

// Initialize on page load - all setup happens once after preferences load
// (see end of script for the single initializeFromStorage call)


// --- Status Pill Implementation ---
function createStatusPill() {
    let pill = document.getElementById('isweep-status-pill');
    if (pill) return pill;
    pill = document.createElement('div');
    pill.id = 'isweep-status-pill';
    pill.style.position = 'fixed';
    pill.style.top = '16px';
    pill.style.right = '16px';
    pill.style.zIndex = '99999';
    pill.style.display = 'flex';
    pill.style.alignItems = 'center';
    pill.style.background = '#fff';
    pill.style.borderRadius = '999px';
    pill.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
    pill.style.padding = '4px 12px 4px 8px';
    pill.style.fontSize = '16px';
    pill.style.fontFamily = 'system-ui,sans-serif';
    pill.style.userSelect = 'none';
    pill.style.pointerEvents = 'none'; // Don't block clicks on video controls
    pill.innerHTML = `
        <span style="margin-right:8px;">🧹</span>
        <span id="isweep-status-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ccc;"></span>
    `;
    document.body.appendChild(pill);
    return pill;
}

function updateStatusIcon(enabled) {
    createStatusPill();
    const dot = document.getElementById('isweep-status-dot');
    if (dot) {
        dot.style.background = enabled ? '#27c93f' : '#ff3b30';
    }
}

// Initialize status pill from local storage
chrome.storage.local.get(['isweep_enabled'], (result) => {
    const enabled = Boolean(result.isweep_enabled);
    updateStatusIcon(enabled);
    csLog('[ISweep] Status pill initialized with isweep_enabled:', enabled);
});

// YouTube detection - simple and reliable host check
// Do NOT rely on window.isYouTubePage; use direct location.host check
function isYouTubeHost() {
    return /youtube\.com|youtu\.be/.test(location.host);
}

// Detect all video elements on page (skip YouTube; handled by youtube-handler)
const __isweepIsYouTube = isYouTubeHost();
let __isweepYTLogged = false;

function detectVideos() {
    if (__isweepIsYouTube) {
        if (!__isweepYTLogged) {
            __isweepYTLogged = true;
            csLog('[ISweep-CS] YouTube detected - skipping non-YouTube caption extraction');
        }
        return;
    }

    const videos = document.querySelectorAll('video');
    
    if (videos.length > 0 && detectedVideos !== videos.length) {
        detectedVideos = videos.length;
        csLog(`[ISweep] Detected ${videos.length} video(s)`);
        
        updateStats();
        
        videos.forEach((video, index) => {
            setupVideoMonitoring(video, index);
        });
    }
}

// Setup monitoring for individual video
function setupVideoMonitoring(videoElement, index) {
    // Prevent duplicate listeners
    if (videoElement._isweepSetup) return;
    videoElement._isweepSetup = true;



    // Extract captions from tracks
    extractCaptions(videoElement, index);

    // Monitor playback
    videoElement.addEventListener('playing', () => {
        if (isEnabled) {
            handleVideoPlaying(videoElement, index);
        }
    });

    videoElement.addEventListener('timeupdate', () => {
        if (isEnabled) {
            checkForFilters(videoElement, index);
        }
    });
}

// Extract captions from video element
function extractCaptions(videoElement, index) {
    const tracks = videoElement.querySelectorAll('track[kind="captions"], track[kind="subtitles"]');
    
    if (tracks.length === 0) {
        csLog(`[ISweep] Video ${index}: No captions found`);
        return;
    }

    csLog(`[ISweep] Video ${index}: Found ${tracks.length} caption track(s)`);

    tracks.forEach((track, trackIndex) => {
        // Try to load and parse VTT file
        const src = track.src;
        if (src) {
            fetch(src)
                .then(r => r.text())
                .then(vttText => {
                    videoElement._isweepCaptions = parseVTT(vttText);
                    csLog(`[ISweep] Loaded ${videoElement._isweepCaptions.length} caption cues`);
                })
                .catch(e => console.warn(`[ISweep] Failed to load captions: ${e}`));
        }

        // Also listen for cues that are added dynamically
        track.track.addEventListener('cuechange', () => {
            const activeCues = track.track.activeCues;
            if (activeCues && activeCues.length > 0) {
                const cue = activeCues[0];
                const captionText = cue.text;
                videoElement._isweepCurrentCaption = captionText;
                videoElement._isweepCurrentCaptionStart = cue.startTime;
                videoElement._isweepCurrentCaptionEnd = cue.endTime;
                csLog(`[ISweep] Cue captured from track ${trackIndex}:`, captionText.slice(0, 60));
            }
        });
    });
}

// Parse WebVTT format
function parseVTT(vttText) {
    const cues = [];
    const lines = vttText.split('\n');
    let currentCue = null;

    for (let line of lines) {
        line = line.trim();
        
        // Skip WEBVTT header and NOTE lines
        if (!line || line.startsWith('WEBVTT') || line.startsWith('NOTE')) continue;

        // Check for timestamp line (HH:MM:SS.mmm --> HH:MM:SS.mmm)
        if (line.includes('-->')) {
            currentCue = { text: '' };
            cues.push(currentCue);
        } else if (currentCue && line) {
            // Add text to current cue
            if (currentCue.text) {
                currentCue.text += ' ' + line;
            } else {
                currentCue.text = line;
            }
        }
    }

    return cues;
}

/**
 * Find the cue from parsed VTT nearest to the given timestamp
 * Returns { text, startTime, endTime } or null if no cues available
 */
function findCueAtTime(cues, currentTime) {
    if (!cues || cues.length === 0) return null;
    
    // Linear search for exact or nearest cue (simple approach)
    for (const cue of cues) {
        // For now, just return the first cue with text (VTT parser doesn't extract timestamps)
        // In production, parse timestamps from VTT and match by time
        if (cue.text) {
            return { text: cue.text };
        }
    }
    
    return null;
}



// Main filtering logic
async function checkForFilters(videoElement, index) {
    if (!videoElement.currentTime || videoElement.paused) return;

    // Get current caption text - primary source is cuechange event
    let captionText = videoElement._isweepCurrentCaption || '';
    
    // Fallback: if no caption from cuechange, try to find one from parsed VTT
    if (!captionText && videoElement._isweepCaptions) {
        const foundCue = findCueAtTime(videoElement._isweepCaptions, videoElement.currentTime);
        if (foundCue && foundCue.text) {
            captionText = foundCue.text;
            csLog(`[ISweep] Using fallback cue from parsed VTT: "${captionText.slice(0, 60)}..."`);
        }
    }

    // Only send to backend if we have caption text
    if (!captionText) return;

    // Throttle requests - don't send too frequently
    const now = Date.now();
    if (videoElement._isweepLastCheck && (now - videoElement._isweepLastCheck) < 500) {
        return;
    }
    videoElement._isweepLastCheck = now;


    // Normalize caption text: remove musical notes and special characters, but preserve apostrophes
    const cleanCaption = captionText
        .replace(/[♪♫]/g, " ")
        .replace(/[^\p{L}\p{N}\s']/gu, " ") // Preserve apostrophes for contractions (don't, can't, etc.)
        .replace(/\s+/g, " ")
        .trim();

    window.__isweepTranscriptIngest({
        text: cleanCaption,
        timestamp_seconds: videoElement.currentTime,
        source: 'html5_dom'
    });
}

// Handle video start
function handleVideoPlaying(videoElement, index) {
    csLog(`[ISweep] Video ${index} started playing`);
    
    // Show badge if not already shown
    if (videoElement._isweepBadge && videoElement.parentElement) {
        if (!videoElement.parentElement.contains(videoElement._isweepBadge)) {
            videoElement.parentElement.appendChild(videoElement._isweepBadge);
        }
    }
}

// Update extension stats
// Track previous stats to send only increments
let lastReportedVideosDetected = 0;
let lastReportedActionsApplied = 0;

// Update extension stats by incrementing existing totals
// This prevents multiple tabs from overwriting each other's stats
function updateStats() {
    // Calculate increments since last update
    const videosIncrement = Math.max(0, detectedVideos - lastReportedVideosDetected);
    const actionsIncrement = Math.max(0, appliedActions - lastReportedActionsApplied);
    
    if (videosIncrement > 0 || actionsIncrement > 0) {
        chrome.storage.local.get(['videosDetected', 'actionsApplied'], (result) => {
            const currentVideosDetected = parseInt(result.videosDetected || 0, 10) || 0;
            const currentActionsApplied = parseInt(result.actionsApplied || 0, 10) || 0;
            
            // Increment existing totals rather than overwriting
            const newVideosDetected = currentVideosDetected + videosIncrement;
            const newActionsApplied = currentActionsApplied + actionsIncrement;
            
            chrome.storage.local.set({
                videosDetected: newVideosDetected,
                actionsApplied: newActionsApplied
            });
            
            // Update local tracking for next increment
            lastReportedVideosDetected = detectedVideos;
            lastReportedActionsApplied = appliedActions;
            
            csLog(`[ISweep] Stats incremented: +${videosIncrement} videos, +${actionsIncrement} actions → totals: ${newVideosDetected}, ${newActionsApplied}`);
        });
    }
}

// Observer for dynamically added videos
const observer = new MutationObserver(() => {
    detectVideos();
});

// Only observe if document.body exists
if (document.body) {
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false
    });
} else {
    // Wait for body to be ready
    document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: false
            });
        }
    });
}

function monitorSpeechFallback() {
    if (!isEnabled) {
        stopSpeechFallback();
        return;
    }

    // Don't use speech fallback on YouTube (captions are handled separately by youtube-handler)
    if (isYouTubeHost()) {
        stopSpeechFallback();
        return;
    }

    const video = getActiveVideo();
    if (!video || video.paused || video.ended || video.readyState < 2) {
        stopSpeechFallback();
        return;
    }

    const now = Date.now();
    // Only start speech fallback if no transcripts for 5+ seconds (uses shared lastTranscriptTs from TranscriptEngine)
    if ((now - lastTranscriptTs) >= 5000) {
        startSpeechFallback(video);
    } else if (speechActive) {
        stopSpeechFallback();
    }
}

// Initialize from storage once, then start all monitoring
// This is the ONLY initialization call to avoid duplicate intervals/observers
initializeFromStorage().then(() => {
    csLog('[ISweep] Content script initialized and ready');

    // Initial detection
    detectVideos();

    // Periodic check for new videos (single interval)
    setInterval(detectVideos, 2000);

    // Speech fallback monitor (single interval)
    setInterval(monitorSpeechFallback, 1000);

    // Note: YouTube handler initializes independently via manifest.json injection
    // No cross-script communication needed; each script handles its own page type
    if (isYouTubeHost()) {
        csLog('[ISweep] YouTube detected - youtube-handler will initialize independently');
    }

    csLog('[ISweep] Caption extraction enabled' + (isYouTubeHost() ? ' + YouTube support' : ''));

    /**
     * ASR console test helper: validates handler behavior under edge cases.
     * 
     * INVARIANTS:
     * - Test Finiteness Discipline: Tests MUST mirror handler's finiteness rules.
     *   All uses of video.currentTime are wrapped: Number(video.currentTime) with
     *   Number.isFinite() check, falling back to 0 for NaN/undefined.
     * 
     * - Spy Isolation: All spies (ingest payloads, csLog) MUST record only and never
     *   mutate ASR state (asrLastAbsTime, asrSessionStart, asrSessionActive, warning flags).
     *   The real handler updates state; spies only capture behavior for assertions.
     */
    // ASR console test helper
    window.__isweepAsrConsoleTests = async function() {
        const video = getActiveVideo();
        if (!video) {
            console.warn('[ISweep-ASR-Tests] No active video found. Open a YouTube video or page with HTML5 video.');
            return;
        }

        console.log('[ISweep-ASR-Tests] Starting ASR handler tests...');

        // Save original state and debug setting
        const savedDebug = window.__ISWEEP_DEBUG;
        const savedCsLog = csLog;
        const savedSessionStart = asrSessionStart;
        const savedSessionActive = asrSessionActive;
        const savedLastAbsTime = asrLastAbsTime;
        const savedLastSegmentTs = asrLastSegmentTs;
        const savedIngest = window.__isweepTranscriptIngest;
        const savedWarnedEmpty = __asrWarnedEmptyText;
        const savedWarnedBadEnd = __asrWarnedBadEnd;
        const savedWarnedNonMono = __asrWarnedNonMonotonic;
        const savedWarnedIngestMiss = __asrWarnedIngestMissing;
        
        const testResults = {};

        try {
            // Temporarily enable debug
            window.__ISWEEP_DEBUG = true;

            // ===== TEST A: Monotonic Guard (drop backward jump) =====
            console.log('\n--- Test A: Monotonic Guard (drop backward jump) ---');
            const videoNowA = Number(video.currentTime);
            asrSessionStart = Number.isFinite(videoNowA) ? videoNowA : 0;
            asrSessionActive = true;
            asrLastAbsTime = 0;
            asrLastSegmentTs = Date.now();
            __asrWarnedEmptyText = false;
            __asrWarnedBadEnd = false;
            __asrWarnedNonMonotonic = false;
            __asrWarnedIngestMissing = false;

            // Spy: record only, do not mutate ASR state
            const monoIngestedPayloads = [];
            window.__isweepTranscriptIngest = function(obj) {
                monoIngestedPayloads.push(obj);
            };

            // Call handler directly
            const monoResult = __isweepHandleAsrSegments({
                segments: [
                    { text: 'mono ok', end_seconds: 2.0 },
                    { text: 'mono back', end_seconds: 1.0 }
                ]
            });

            // Check PASS/FAIL
            const monoPass = monoResult.success && 
                monoResult.ingestedCount === 1 && 
                monoIngestedPayloads.length === 1 && 
                monoIngestedPayloads[0].text === 'mono ok';
            testResults.monotonic = monoPass ? 'PASS' : 'FAIL';
            
            console.log('[ISweep-ASR-Tests] Test A Result:');
            console.log(`  Handler return:`, monoResult);
            console.log(`  Ingested payloads:`, monoIngestedPayloads.length > 0 ? monoIngestedPayloads : 'none');
            console.log(`  State: asrSessionStart=${asrSessionStart.toFixed(2)}, asrLastAbsTime=${asrLastAbsTime.toFixed(2)}`);
            console.log(`  → ${testResults.monotonic}`);

            // ===== TEST B: Rebase Self-Heal (stale sessionStart) =====
            console.log('\n--- Test B: Rebase Self-Heal (stale sessionStart) ---');
            const videoNow = Number(video.currentTime);
            const videoNowSafe = Number.isFinite(videoNow) ? videoNow : 0;
            asrSessionStart = Math.max(0, videoNowSafe - 60); // Stale by 60s
            asrSessionActive = true;
            asrLastAbsTime = 0;
            asrLastSegmentTs = Date.now();
            __asrWarnedEmptyText = false;
            __asrWarnedBadEnd = false;
            __asrWarnedNonMonotonic = false;
            __asrWarnedIngestMissing = false;

            // Spy: record only, do not mutate ASR state
            const rebaseIngestedPayloads = [];
            window.__isweepTranscriptIngest = function(obj) {
                rebaseIngestedPayloads.push(obj);
            };

            // Spy on debug logs to detect REBASE
            let rebaseLogCount = 0;
            csLog = function(...args) {
                const msg = String(args[0] || '');
                if (msg.includes('REBASE')) {
                    rebaseLogCount++;
                }
                return savedCsLog(...args);
            };
            
            // Call handler directly
            const rebaseResult = __isweepHandleAsrSegments({
                segments: [{ text: 'rebase', end_seconds: 1.5 }]
            });

            // Restore csLog immediately after test
            csLog = savedCsLog;

            // Check PASS/FAIL: rebase should occur, and timestamp should be near videoNow
            const rebasePass = rebaseResult.success && 
                rebaseResult.rebaseOccurred &&
                rebaseIngestedPayloads.length === 1 && 
                Math.abs(rebaseIngestedPayloads[0].timestamp_seconds - videoNow) < 2.0;
            testResults.rebase = rebasePass ? 'PASS' : 'FAIL';
            
            console.log('[ISweep-ASR-Tests] Test B Result:');
            console.log(`  Handler return:`, rebaseResult);
            console.log(`  Ingested payloads:`, rebaseIngestedPayloads);
            console.log(`  Expected timestamp ~${videoNow.toFixed(2)}, got ${rebaseIngestedPayloads[0]?.timestamp_seconds.toFixed(2) || 'none'}`);
            console.log(`  State: asrSessionStart=${asrSessionStart.toFixed(2)}, asrLastAbsTime=${asrLastAbsTime.toFixed(2)}`);
            console.log(`  rebaseLogCount=${rebaseLogCount}`);
            console.log(`  rebaseOccurred=${rebaseResult.rebaseOccurred}`);
            console.log(`  → ${testResults.rebase}`);

            // ===== TEST C: Ingest-Missing (warn once, no absTime advance) =====
            console.log('\n--- Test C: Ingest-Missing (warn once, no absTime advance) ---');
            const videoNowC = Number(video.currentTime);
            asrSessionStart = Number.isFinite(videoNowC) ? videoNowC : 0;
            asrSessionActive = true;
            asrLastAbsTime = 100; // Set to known value (should NOT advance)
            asrLastSegmentTs = Date.now();
            __asrWarnedEmptyText = false;
            __asrWarnedBadEnd = false;
            __asrWarnedNonMonotonic = false;
            __asrWarnedIngestMissing = false;

            const savedAbsTime = asrLastAbsTime;
            window.__isweepTranscriptIngest = undefined; // Simulate missing function

            // Create spy on csLog for warning count
            let ingestMissingLogCount = 0;
            csLog = function(...args) {
                const msg = String(args[0] || '');
                if (msg.includes('not available')) {
                    ingestMissingLogCount++;
                }
                return savedCsLog(...args);
            };

            // Call handler directly
            const ingestResult = __isweepHandleAsrSegments({
                segments: [{ text: 'ingest missing', end_seconds: 1.0 }]
            });

            // Restore csLog immediately after test
            csLog = savedCsLog;

            // Check PASS/FAIL: should succeed but NOT advance asrLastAbsTime
            const ingestPass = ingestResult.success && 
                asrLastAbsTime === savedAbsTime && 
                ingestMissingLogCount >= 1;
            testResults.ingestMissing = ingestPass ? 'PASS' : 'FAIL';
            
            console.log('[ISweep-ASR-Tests] Test C Result:');
            console.log(`  Handler return:`, ingestResult);
            console.log(`  asrLastAbsTime: was ${savedAbsTime}, still ${asrLastAbsTime}`);
            console.log(`  Warning logged: ${ingestMissingLogCount} time(s)`);
            console.log(`  State: asrSessionStart=${asrSessionStart.toFixed(2)}, asrLastAbsTime=${asrLastAbsTime}`);
            console.log(`  ingestMissingLogCount=${ingestMissingLogCount}`);
            console.log(`  __asrWarnedIngestMissing=${__asrWarnedIngestMissing}`);
            console.log(`  → ${testResults.ingestMissing}`);

            // ===== SUMMARY =====
            console.log('\n╔════════════════════════════════════════╗');
            console.log('║        ASR HANDLER TEST SUMMARY        ║');
            console.log('╠════════════════════════════════════════╣');
            console.log(`║ A) Monotonic Guard:     ${testResults.monotonic === 'PASS' ? '✓ PASS' : '✗ FAIL'}           ║`);
            console.log(`║ B) Rebase Self-Heal:    ${testResults.rebase === 'PASS' ? '✓ PASS' : '✗ FAIL'}           ║`);
            console.log(`║ C) Ingest-Missing:      ${testResults.ingestMissing === 'PASS' ? '✓ PASS' : '✗ FAIL'}           ║`);
            console.log('╚════════════════════════════════════════╝');
            
            const allPass = Object.values(testResults).every(r => r === 'PASS');
            console.log(`\n[ISweep-ASR-Tests] Overall: ${allPass ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);

        } finally {
            // Restore original state (AFTER all awaits complete)
            csLog = savedCsLog;
            window.__ISWEEP_DEBUG = savedDebug;
            asrSessionStart = savedSessionStart;
            asrSessionActive = savedSessionActive;
            asrLastAbsTime = savedLastAbsTime;
            asrLastSegmentTs = savedLastSegmentTs;
            window.__isweepTranscriptIngest = savedIngest;
            __asrWarnedEmptyText = savedWarnedEmpty;
            __asrWarnedBadEnd = savedWarnedBadEnd;
            __asrWarnedNonMonotonic = savedWarnedNonMono;
            __asrWarnedIngestMissing = savedWarnedIngestMiss;
            console.log('[ISweep-ASR-Tests] All state restored.');
        }
    };

}).catch((err) => {
    csLog('[ISweep] Critical initialization error:', err);
});

})();

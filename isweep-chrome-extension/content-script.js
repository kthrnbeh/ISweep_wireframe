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
let lastCaptionEmitTs = Date.now();
let isMuted = false; // Safe mute state
let unmuteTimerId = null; // Track scheduled unmute timer
let muteUntil = 0; // Track when mute should end to prevent over-muting
let lastMutedPhrase = null; // Track last muted phrase to allow different phrases
let speechRecognition = null;
let speechActive = false;
let speechVideoRef = null;
let speechUnsupportedLogged = false;
let lastSpeechErrorTs = 0; // Track speech fallback errors for cooldown
// In-memory preferences organized by category
let prefsByCategory = {
    language: {
        blocked_words: [],
        duration_seconds: 3,
        action: 'mute'
    }
};

/**
 * Normalize text for matching: lowercase, remove punctuation, collapse whitespace
 */
function normalizeText(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[.,!?;:\-'"()\[\]{}]/g, ' ') // Remove punctuation
        .replace(/\s+/g, ' ') // Collapse whitespace
        .trim();
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
                duration_seconds: Number(pref.duration_seconds ?? 3),
                action: pref.action || 'mute'
            };
        });

        // Merge incoming prefs; keep existing defaults when missing
        prefsByCategory = {
            ...prefsByCategory,
            ...nextPrefs,
        };
        prefsByCategory.language = prefsByCategory.language || { blocked_words: [], duration_seconds: 3, action: 'mute' };

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
    const result = await chrome.storage.local.get(['isweep_enabled', 'userId', 'backendURL', 'cachedPrefsByCategory']);
    isEnabled = result.isweep_enabled === true; // default to false if not explicitly set
    userId = result.userId || 'user123';
    backendURL = result.backendURL || 'http://127.0.0.1:8001';
    
    // Load cached preferences if available
    if (result.cachedPrefsByCategory) {
        prefsByCategory = result.cachedPrefsByCategory;
        csLog('[ISweep] Loaded cachedPrefsByCategory from storage:', Object.keys(prefsByCategory));
    }
    
    csLog('[ISweep] Loaded enabled state:', isEnabled);
    csLog('[ISweep] Loaded from storage:', { userId, backendURL });
    csLog('[ISweep] Loaded prefsByCategory keys:', Object.keys(prefsByCategory));
    csLog(`[ISweep] Language words loaded: ${prefsByCategory.language.blocked_words.length}`);
    
    // If enabled, fetch fresh preferences from backend (and update cache)
    if (isEnabled) {
        csLog('[ISweep] Extension is enabled, fetching fresh preferences from backend...');
        await fetchPreferencesFromBackend();
    }
}

// Listen for toggle messages from popup (SINGLE unified listener)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.action === 'toggleISweep' && typeof message.enabled !== 'undefined') {
        isEnabled = message.enabled;
        csLog('[ISweep] Toggled via popup:', isEnabled ? 'ENABLED' : 'DISABLED');
        
        // Update status pill
        updateStatusIcon(isEnabled);
        
        // Update prefs if provided
        if (message.prefs) {
            prefsByCategory.language = {
                blocked_words: message.prefs.blocked_words || [],
                duration_seconds: message.prefs.duration_seconds || 3,
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
            // If disabled, stop speech recognition and unmute any videos
            stopSpeechFallback();
            document.querySelectorAll('video').forEach(v => {
                if (v.muted) v.muted = false;
            });
            // Clear any pending unmute timer and reset mute state
            if (unmuteTimerId !== null) {
                clearTimeout(unmuteTimerId);
                unmuteTimerId = null;
            }
            isMuted = false;
            lastMutedPhrase = null;
            muteUntil = 0;
        }
        
        sendResponse({ success: true });
    }
});

// Listen for storage changes from other tabs/windows
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
        if (changes.isweep_enabled && typeof changes.isweep_enabled.newValue !== 'undefined') {
            isEnabled = Boolean(changes.isweep_enabled.newValue);
            csLog('[ISweep] isweep_enabled changed via storage:', isEnabled);
            updateStatusIcon(isEnabled);
        }
        if (changes.userId && typeof changes.userId.newValue === 'string') {
            userId = changes.userId.newValue;
        }
        if (changes.backendURL && typeof changes.backendURL.newValue === 'string') {
            backendURL = changes.backendURL.newValue;
        }
        if (changes.cachedPrefsByCategory && changes.cachedPrefsByCategory.newValue) {
            prefsByCategory = changes.cachedPrefsByCategory.newValue;
            csLog('[ISweep] Preferences updated via storage:', Object.keys(prefsByCategory));
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
    return prefsByCategory.language || { blocked_words: [], duration_seconds: 3, action: 'mute' };
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
                    duration_seconds: prefs.duration_seconds || 3
                };
            }
        }
    }
    
    return { matched: false };
}

function startSpeechFallback(videoElement) {
    if (speechActive) return;

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
        window.__isweepEmitText({
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

window.__isweepApplyDecision = function(decision) {
    const videoElement = getActiveVideo();
    if (!videoElement) {
        csLog('[ISweep] No active video to apply decision');
        return;
    }

    const { action, duration_seconds, reason, matched_term } = decision;
    const langPrefs = getLangPrefs();
    // Use backend duration if finite number, else prefs duration if finite, else 3
    const backendDuration = Number(duration_seconds);
    const prefsDuration = Number(langPrefs.duration_seconds);
    const durationSeconds = Number.isFinite(backendDuration) ? backendDuration 
                          : Number.isFinite(prefsDuration) ? prefsDuration 
                          : 3;
    const duration = Math.max(0, durationSeconds);
    const durationMs = duration * 1000;

    csLog(`[ISweep] APPLYING ACTION: ${action} (duration: ${duration}s) - ${reason}`);

    switch (action) {
        case 'mute':
            const now = Date.now();
            
            // If already muted with same term, ignore duplicate
            if (isMuted && lastMutedPhrase === matched_term) {
                csLog(`[ISweep] Already muted for term "${matched_term}", ignoring duplicate`);
                return;
            }
            
            // If already muted with different term, allow but clear old timer first
            if (isMuted && unmuteTimerId !== null) {
                csLog(`[ISweep] Switching mute from term "${lastMutedPhrase}" to "${matched_term}", clearing old timer`);
                clearTimeout(unmuteTimerId);
                unmuteTimerId = null;
            }
            
            // Apply new mute
            videoElement.muted = true;
            isMuted = true;
            muteUntil = now + durationMs;
            lastMutedPhrase = matched_term;
            appliedActions++;
            csLog(`[ISweep] MUTED: matched term "${matched_term}", will unmute at ${new Date(muteUntil).toISOString()}`);
            
            // Schedule unmute with safety check - only unmute if this is the active mute
            unmuteTimerId = setTimeout(() => {
                // Only unmute if enough time has passed (prevents old timers from unmuting early)
                if (Date.now() >= muteUntil) {
                    videoElement.muted = false;
                    isMuted = false;
                    unmuteTimerId = null;
                    csLog('[ISweep] UNMUTED after duration');
                } else {
                    csLog('[ISweep] Unmute timer fired early, skipping (newer mute active)');
                }
            }, durationMs);
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

window.__isweepEmitText = async function({ text, timestamp_seconds, source }) {
    if (!isEnabled) return;

    lastCaptionEmitTs = Date.now();
    if (speechActive) {
        stopSpeechFallback();
    }

    // Normalize caption text before sending
    const normalizedText = normalizeText(text);
    csLog('[ISweep] Processing caption:', { original: text, normalized: normalizedText, source });

    // Check for local blocked words across all categories
    const blockedCheck = checkAllCategoriesForBlockedWords(text);
    if (blockedCheck.matched) {
        csLog('[ISweep] LOCAL MATCH: Blocked word detected in category:', blockedCheck.category);
        // Apply action immediately using category-specific settings
        window.__isweepApplyDecision({
            action: blockedCheck.action || 'mute',
            duration_seconds: blockedCheck.duration_seconds || 3,
            reason: `Matched blocked word in "${blockedCheck.category}": "${blockedCheck.word}"`,
            matched_term: blockedCheck.word,
            matched_category: blockedCheck.category
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

// Detect all video elements on page (skip YouTube; handled by youtube-handler)
const __isweepIsYouTube = typeof window.isYouTubePage === 'function' && window.isYouTubePage();
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
                const captionText = activeCues[0].text;
                videoElement._isweepCurrentCaption = captionText;
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



// Main filtering logic
async function checkForFilters(videoElement, index) {
    if (!videoElement.currentTime || videoElement.paused) return;

    // Get current caption text
    const captionText = videoElement._isweepCurrentCaption || '';

    // Only send to backend if we have caption text
    if (!captionText) return;

    // Throttle requests - don't send too frequently
    const now = Date.now();
    if (videoElement._isweepLastCheck && (now - videoElement._isweepLastCheck) < 500) {
        return;
    }
    videoElement._isweepLastCheck = now;


    // Normalize caption text to remove special characters (♪, ♫, etc.)
    const cleanCaption = captionText
        .replace(/[♪♫]/g, " ")
        .replace(/[^\p{L}\p{N}\s']/gu, " ")
        .replace(/\s+/g, " ")
        .trim();

    await window.__isweepEmitText({
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
function updateStats() {
    chrome.storage.local.set({
        videosDetected: detectedVideos,
        actionsApplied: appliedActions
    });
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
    const isYT = typeof window.isYouTubePage === 'function' && window.isYouTubePage();
    if (isYT) {
        stopSpeechFallback();
        return;
    }

    const video = getActiveVideo();
    if (!video || video.paused || video.ended || video.readyState < 2) {
        stopSpeechFallback();
        return;
    }

    const now = Date.now();
    // Only start speech fallback if no captions for 5+ seconds
    if ((now - lastCaptionEmitTs) >= 5000) {
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

    // Initialize YouTube handler if on YouTube
    const isYT = typeof window.isYouTubePage === 'function' && window.isYouTubePage();
    if (isYT) {
        csLog('[ISweep] YouTube detected - initializing YouTube handlers');
        if (typeof window.initYouTubeOnVideoChange === 'function') {
            window.initYouTubeOnVideoChange();
        }
        if (typeof window.initYouTubeHandler === 'function') {
            setTimeout(window.initYouTubeHandler, 1000);
        }
    }

    csLog('[ISweep] Caption extraction enabled' + (isYT ? ' + YouTube support' : ''));
}).catch((err) => {
    csLog('[ISweep] Critical initialization error:', err);
});

})();

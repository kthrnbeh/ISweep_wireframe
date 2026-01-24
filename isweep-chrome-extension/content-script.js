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

// Initialize on page load
chrome.storage.local.get(['isEnabled', 'userId', 'backendURL'], (result) => {
    isEnabled = result.isEnabled || false;
    userId = result.userId || 'user123';
    backendURL = result.backendURL || 'http://127.0.0.1:8001';
    
    // Initialize YouTube handler if on YouTube (safe window access)
    const isYT = typeof window.isYouTubePage === 'function' && window.isYouTubePage();
    if (isYT) {
        csLog('[ISweep] YouTube page detected');
        if (typeof window.initYouTubeHandler === 'function') {
            window.initYouTubeHandler();
        }
    }
});


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

// --- Call updateStatusIcon after storage loads ---
chrome.storage.sync.get(['isEnabled'], (result) => {
    const isEnabled = result.isEnabled !== false;
    updateStatusIcon(isEnabled);
});

// --- Listen for toggle messages and update pill ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'TOGGLE_ISWEEP') {
        updateStatusIcon(message.enabled);
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleISweep') {
        isEnabled = request.enabled;
        csLog(`[ISweep] ${isEnabled ? 'Enabled' : 'Disabled'}`);
        
        // Update status icon
        if (isEnabled) {
            addStatusIcon();
        } else {
            removeStatusIcon();
        }
        
        refreshBadges(); // Update badges immediately
        sendResponse({ success: true });
    }
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
        track.addEventListener('cuechange', () => {
            const activeCues = track.track.activeCues;
            if (activeCues && activeCues.length > 0) {
                videoElement._isweepCurrentCaption = activeCues[0].text;
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


    try {
        // Normalize caption text to remove special characters (♪, ♫, etc.)
        const cleanCaption = captionText
            .replace(/[♪♫]/g, " ")
            .replace(/[^\p{L}\p{N}\s']/gu, " ")
            .replace(/\s+/g, " ")
            .trim();

        // Send caption text to backend for analysis
        const response = await fetch(`${backendURL}/event`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId,
                text: cleanCaption,
                content_type: null,
                confidence: 0.9,
                timestamp_seconds: videoElement.currentTime
            })
        });

        if (!response.ok) throw new Error('API error');

        const decision = await response.json();
        
        // Only apply if action is NOT 'none'
        if (decision.action !== 'none') {
            applyDecision(videoElement, decision, captionText);
        }
    } catch (error) {
        console.warn('[ISweep] API error:', error);
    }
}

// Apply decision to video
function applyDecision(videoElement, decision, captionText) {
    const { action, duration_seconds, reason } = decision;
    const duration = Number(duration_seconds) || 3; // Default 3 seconds if null/undefined

    csLog(`[ISweep] Caption: "${captionText}"`);
    csLog(`[ISweep] Action: ${action} - ${reason}`);

    switch (action) {
        case 'mute':
            videoElement.muted = true;
            appliedActions++;
            setTimeout(() => {
                videoElement.muted = false;
            }, duration * 1000);
            break;

        case 'skip':
            videoElement.currentTime += duration;
            appliedActions++;
            break;

        case 'fast_forward':
            // Increase playback speed
            const originalSpeed = videoElement.playbackRate;
            videoElement.playbackRate = 2.0;
            appliedActions++;
            setTimeout(() => {
                videoElement.playbackRate = originalSpeed;
            }, duration * 1000);
            break;

        case 'none':
        default:
            // No action
            break;
    }

    updateStats();
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

// Initial detection
detectVideos();

// Periodic check for new videos
setInterval(detectVideos, 2000);

// Initialize YouTube handler if on YouTube (use window.isYouTubePage for safe access)
const isYT = typeof window.isYouTubePage === 'function' && window.isYouTubePage();
if (isYT) {
    if (typeof window.initYouTubeOnVideoChange === 'function') {
        window.initYouTubeOnVideoChange();
    }
    if (typeof window.initYouTubeHandler === 'function') {
        setTimeout(window.initYouTubeHandler, 1000);
    }
}

csLog('[ISweep] Content script loaded - Caption extraction enabled' + (isYT ? ' + YouTube support' : ''));

})();

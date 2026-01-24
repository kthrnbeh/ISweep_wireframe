// content-script.js
/**
 * Content script injected into every page
 * Detects videos, extracts captions, and controls playback
 * Supports: HTML5 video + YouTube
 */

// DEBUG flag - set to false to disable all logs
const DEBUG = true;

// Helper function for conditional logging
function debug(message) {
    if (DEBUG) {
        console.log(message);
    }
}

// Prevent double-injection
if (window.__isweepContentLoaded) {
    debug("[ISweep] content-script already loaded; skipping duplicate injection");
} else {
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
        debug('[ISweep] YouTube page detected');
        if (typeof window.initYouTubeHandler === 'function') {
            window.initYouTubeHandler();
        }
    }
});

// Add fixed icon in top-right when enabled
function addStatusIcon() {
    // Prevent duplicates
    if (document.getElementById('isweep-status-icon')) return;

    const icon = document.createElement('div');
    icon.id = 'isweep-status-icon';
    icon.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(34, 197, 94, 0.95);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        z-index: 10000;
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    `;
    icon.textContent = '🧹 ISweep ON';

    const parent = document.body || document.documentElement;
    if (parent) {
        try {
            parent.appendChild(icon);
            debug('[ISweep] Status icon added');
        } catch (error) {
            console.warn('[ISweep] Failed to add status icon:', error);
        }
    }
}

// Remove status icon when disabled
function removeStatusIcon() {
    const icon = document.getElementById('isweep-status-icon');
    if (icon) {
        try {
            icon.remove();
            debug('[ISweep] Status icon removed');
        } catch (error) {
            console.warn('[ISweep] Failed to remove status icon:', error);
        }
    }
}

// Refresh badge visibility when toggle changes
function refreshBadges() {
    document.querySelectorAll('video').forEach(v => {
        if (v._isweepBadge && v.parentElement) {
            if (isEnabled) {
                // Show badge if not already visible
                if (!v.parentElement.contains(v._isweepBadge)) {
                    v.parentElement.appendChild(v._isweepBadge);
                }
            } else {
                // Hide badge when disabled
                if (v.parentElement.contains(v._isweepBadge)) {
                    v._isweepBadge.remove();
                }
            }
        }
    });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleISweep') {
        isEnabled = request.enabled;
        debug(`[ISweep] ${isEnabled ? 'Enabled' : 'Disabled'}`);
        
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

// Detect all video elements on page
function detectVideos() {
    const videos = document.querySelectorAll('video');
    
    if (videos.length > 0 && detectedVideos !== videos.length) {
        detectedVideos = videos.length;
        debug(`[ISweep] Detected ${videos.length} video(s)`);
        
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

    // Create control overlay
        // createControlOverlay(videoElement, index); // commented out to remove duplicate UI indicators

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
    pill.style.background = 'rgba(34, 34, 34, 0.95)';
    pill.style.color = '#fff';
    pill.style.borderRadius = '999px';
    pill.style.padding = '6px 16px 6px 10px';
    pill.style.fontSize = '15px';
    pill.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    pill.style.userSelect = 'none';
    pill.style.gap = '8px';
    pill.innerHTML = `
        <span style="display: flex; align-items: center;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 4px;"><path d="M19.5 17.5L6.5 4.5M3 21h18M8.5 10.5l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span id="isweep-status-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#aaa;margin-left:2px;"></span>
        </span>
        <span style="font-weight:500;">ISweep</span>
    `;
    document.body.appendChild(pill);
    return pill;
}

function updateStatusIcon(enabled) {
    createStatusPill();
    const dot = document.getElementById('isweep-status-dot');
    if (dot) {
        dot.style.background = enabled ? '#4caf50' : '#aaa';
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
        debug(`[ISweep] Video ${index}: No captions found`);
        return;
    }

    debug(`[ISweep] Video ${index}: Found ${tracks.length} caption track(s)`);

    tracks.forEach((track, trackIndex) => {
        // Try to load and parse VTT file
        const src = track.src;
        if (src) {
            fetch(src)
                .then(r => r.text())
                .then(vttText => {
                    videoElement._isweepCaptions = parseVTT(vttText);
                    debug(`[ISweep] Loaded ${videoElement._isweepCaptions.length} caption cues`);
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

// Create visual indicator on video
function createControlOverlay(videoElement, index) {
    // Create badge container
    const badge = document.createElement('div');
    badge.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(34, 197, 94, 0.9);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        z-index: 10000;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    badge.textContent = '✓ ISweep Active';

    // Safely wrap video in container for positioning
    if (!videoElement.parentElement) {
        console.warn('[ISweep] Video has no parent element, skipping badge');
        return;
    }

    if (videoElement.parentElement.style.position !== 'relative' && 
        videoElement.parentElement.style.position !== 'absolute') {
        videoElement.parentElement.style.position = 'relative';
    }

    // Only show badge if enabled
    if (isEnabled) {
        videoElement.parentElement.appendChild(badge);
    }

    // Store reference for later updates
    videoElement._isweepBadge = badge;
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

    debug(`[ISweep] Caption: "${captionText}"`);
    debug(`[ISweep] Action: ${action} - ${reason}`);

    switch (action) {
        case 'mute':
            videoElement.muted = true;
            appliedActions++;
            
            // Show visual feedback
            showFeedback(videoElement, 'MUTED', 'rgba(255, 107, 107, 0.9)');
            
            setTimeout(() => {
                videoElement.muted = false;
            }, duration * 1000);
            break;

        case 'skip':
            videoElement.currentTime += duration;
            appliedActions++;
            
            showFeedback(videoElement, 'SKIPPED', 'rgba(66, 133, 244, 0.9)');
            break;

        case 'fast_forward':
            // Increase playback speed
            const originalSpeed = videoElement.playbackRate;
            videoElement.playbackRate = 2.0;
            appliedActions++;
            
            showFeedback(videoElement, 'FAST-FORWARD 2x', 'rgba(251, 188, 5, 0.9)');
            
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

// Show visual feedback when action applied
function showFeedback(videoElement, text, bgColor) {
    const feedback = document.createElement('div');
    feedback.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${bgColor};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 700;
        z-index: 10001;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        animation: fadeInOut 1.5s ease-in-out;
    `;
    feedback.textContent = text;

    if (videoElement.parentElement) {
        videoElement.parentElement.appendChild(feedback);
        setTimeout(() => feedback.remove(), 1500);
    }
}

// Add CSS animation for feedback
if (document.head && !document.getElementById('isweep-styles')) {
    const style = document.createElement('style');
    style.id = 'isweep-styles';
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
            50% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        }
    `;
    document.head.appendChild(style);
}

// Handle video start
function handleVideoPlaying(videoElement, index) {
    debug(`[ISweep] Video ${index} started playing`);
    
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

debug('[ISweep] Content script loaded - Caption extraction enabled' + (isYT ? ' + YouTube support' : ''));

} // ← Close the guard block

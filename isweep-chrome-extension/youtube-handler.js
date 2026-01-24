// youtube-handler.js
/**
 * YouTube player integration
 * Detects YouTube videos and extracts captions from the page
 */

// DEBUG flag - set to false to disable all logs
const DEBUG = true;

// Helper function for conditional logging
function debug(message) {
    if (DEBUG) {
        console.log(message);
    }
}

// Prevent double-injection on YouTube SPA
if (window.__isweepYouTubeLoaded) {
    debug("[ISweep-YT] youtube-handler already loaded; skipping duplicate injection");
} else {
    window.__isweepYouTubeLoaded = true;

let youtubePlayer = null;
let lastCaptionText = '';
let ytCaptionObserver = null;

/**
 * Initialize YouTube handler
 */
function initYouTubeHandler() {
    if (!isYouTubePage()) return false;
    
    debug('[ISweep-YT] Initializing YouTube handler');
    
    // Try to get player reference
    youtubePlayer = getYouTubePlayer();
    if (!youtubePlayer) {
        console.warn('[ISweep-YT] Could not get YouTube player reference, will retry');
        // Retry after delay
        setTimeout(() => {
            youtubePlayer = getYouTubePlayer();
            if (youtubePlayer) {
                debug('[ISweep-YT] Player reference obtained on retry');
            }
        }, 2000);
    } else {
        debug('[ISweep-YT] Player reference obtained');
    }

    // Add badge to show ISweep is active
    addYouTubeBadge();

    // Monitor for caption changes (with retries)
    debug('[ISweep-YT] Starting caption monitoring');
    monitorYouTubeCaptions();
    
    return true;
}

/**
 * Check if we're on YouTube
 */
function isYouTubePage() {
    return location.hostname.includes('youtube.com') || location.hostname.includes('youtu.be');
}

/**
 * Get reference to YouTube player
 */
function getYouTubePlayer() {
    // YouTube stores player in window.ytPlayer
    if (window.ytPlayer) {
        return window.ytPlayer;
    }
    
    // Try to find player in document
    const playerContainer = document.querySelector('[data-player-container-id="player"]');
    if (playerContainer && window.ytPlayers) {
        return Object.values(window.ytPlayers)[0];
    }

    return null;
}

/**
 * Get current video element from YouTube
 */
function getYouTubeVideoElement() {
    // YouTube embeds an HTML5 video element
    return document.querySelector('video');
}

/**
 * Monitor YouTube's caption display
 */
function monitorYouTubeCaptions() {
    // Find caption container (try multiple times as YouTube takes time to render captions)
    let captionContainer = getCaptionContainer();
    let retryCount = window._ytCaptionRetryCount || 0;
    
    if (!captionContainer) {
        if (retryCount < 10) {
            window._ytCaptionRetryCount = retryCount + 1;
            debug(`[ISweep-YT] Caption container not found, retrying (attempt ${retryCount + 1}/10) in 500ms...`);
            setTimeout(monitorYouTubeCaptions, 500);
            return;
        } else {
            console.warn('[ISweep-YT] Could not find caption container after 10 attempts');
            return;
        }
    }
    
    // Reset retry count on success
    window._ytCaptionRetryCount = 0;

    // Verify we have a valid node before observing
    if (!captionContainer || !(captionContainer instanceof Node) || captionContainer.nodeType !== 1) {
        console.warn('[ISweep-YT] Invalid caption container node (not a valid DOM element), retrying...');
        setTimeout(monitorYouTubeCaptions, 1000);
        return;
    }

    // Verify the node is still in the document
    if (!document.contains(captionContainer)) {
        console.warn('[ISweep-YT] Caption container not in document, retrying...');
        setTimeout(monitorYouTubeCaptions, 1000);
        return;
    }

    debug('[ISweep-YT] Found caption container, type:', captionContainer.nodeName);

    // Stop previous observer
    if (ytCaptionObserver) {
        ytCaptionObserver.disconnect();
    }

    // Create observer for caption changes
    ytCaptionObserver = new MutationObserver(() => {
        const captionText = extractYouTubeCaptions();
        if (captionText && captionText !== lastCaptionText) {
            lastCaptionText = captionText;
            handleYouTubeCaptionChange(captionText);
        }
    });

    // Observe with aggressive settings
    try {
        ytCaptionObserver.observe(captionContainer, {
            childList: true,
            subtree: true,
            characterData: true
        });
        debug('[ISweep-YT] Caption monitoring started successfully');
    } catch (error) {
        console.error('[ISweep-YT] Failed to start monitoring:', error);
        // Retry if observer fails
        setTimeout(monitorYouTubeCaptions, 1000);
    }
}

/**
 * Get YouTube caption container
 */
function getCaptionContainer() {
    // YouTube places captions in several possible locations
    // Modern YouTube uses .captions-text for rendered captions
    // Try common selectors in order
    const selectors = [
        '.captions-text',
        'div[aria-live="off"]',
        'div[role="region"][aria-label*="captions"]',
        'div.ytp-caption-segment',
        'div.ytp-captions-text',
    ];

    for (const selector of selectors) {
        try {
            const container = document.querySelector(selector);
            // Validate: must be an HTMLElement (not script/style), nodeType 1, and in document
            if (container && 
                container instanceof HTMLElement && 
                container.nodeType === 1 && 
                !(container instanceof HTMLScriptElement) &&
                !(container instanceof HTMLStyleElement) &&
                document.contains(container)) {
                debug('[ISweep-YT] Found caption container with selector:', selector);
                return container;
            }
        } catch (e) {
            console.warn('[ISweep-YT] Error with selector', selector, e);
            continue;
        }
    }

    // Last resort: find any element with caption-related text
    try {
        const allDivs = document.querySelectorAll('div[role="status"], div[aria-live="polite"]');
        for (const div of allDivs) {
            if (div && div instanceof Node && div.nodeType === 1 && document.contains(div) && div.textContent.length > 0) {
                debug('[ISweep-YT] Found caption container via aria-live');
                return div;
            }
        }
    } catch (e) {
        console.warn('[ISweep-YT] Error in last resort search:', e);
    }
    
    return null;
}

/**
 * Extract visible captions from YouTube page
 */
function extractYouTubeCaptions() {
    // Try multiple selector strategies to find captions
    const strategies = [
        // Strategy 1: Modern YouTube .captions-text (most reliable)
        () => {
            const els = document.querySelectorAll('.captions-text span');
            return els.length > 0 ? els : null;
        },
        // Strategy 2: YouTube caption segments
        () => {
            const els = document.querySelectorAll('div.ytp-caption-segment');
            return els.length > 0 ? els : null;
        },
        // Strategy 3: Aria-live regions for captions
        () => {
            const els = document.querySelectorAll('div[aria-live="off"] span');
            return els.length > 0 ? els : null;
        },
        // Strategy 4: Generic caption class contains
        () => {
            const els = document.querySelectorAll('[class*="caption"] span, [class*="subtitle"] span');
            return els.length > 0 ? els : null;
        },
        // Strategy 5: YTP captions text
        () => {
            const els = document.querySelectorAll('div.ytp-captions-text span');
            return els.length > 0 ? els : null;
        }
    ];

    let captionElements = null;
    for (let i = 0; i < strategies.length; i++) {
        const result = strategies[i]();
        if (result && result.length > 0) {
            captionElements = result;
            break;
        }
    }

    if (!captionElements || captionElements.length === 0) {
        return null;
    }

    // Combine all visible caption text
    let fullText = '';
    captionElements.forEach(el => {
        const text = el.textContent.trim();
        if (text && text.length > 0) {
            fullText += (fullText ? ' ' : '') + text;
        }
    });

    const result = fullText.trim();
    if (result.length > 0) {
        // Log the extracted caption for debugging
        debug(`[ISweep-YT] Extracted caption: "${result}"`);
        return result;
    }
    
    return null;
}

/**
 * Handle when YouTube captions change
 */
async function handleYouTubeCaptionChange(captionText) {
    // Check if enabled (try both local and global)
    const enabled = typeof isEnabled !== 'undefined' ? isEnabled : localStorage.getItem('isweepEnabled') === 'true';
    
    debug(`[ISweep-YT] Caption change detected: "${captionText}", isEnabled: ${enabled}`);
    
    if (!enabled || !captionText) {
        if (!enabled) debug('[ISweep-YT] ISweep not enabled, skipping');
        if (!captionText) debug('[ISweep-YT] No caption text, skipping');
        return;
    }

    // Throttle requests
    const now = Date.now();
    if (window._isweepLastYTCheck && (now - window._isweepLastYTCheck) < 500) {
        debug('[ISweep-YT] Throttled (500ms limit)');
        return;
    }
    window._isweepLastYTCheck = now;

    try {
        // Get backend URL and user ID (try both local and localStorage)
        const backend = typeof backendURL !== 'undefined' ? backendURL : localStorage.getItem('backendURL') || 'http://127.0.0.1:8001';
        const user = typeof userId !== 'undefined' ? userId : localStorage.getItem('userId') || 'user123';
        
        // Get video element for timestamp
        const videoElement = getYouTubeVideoElement();
        const timestamp = videoElement ? videoElement.currentTime : 0;
        
        // Normalize caption text to remove special characters (♪, ♫, etc.)
        const cleanCaption = captionText
            .replace(/[♪♫]/g, " ")
            .replace(/[^\p{L}\p{N}\s']/gu, " ")
            .replace(/\s+/g, " ")
            .trim();
        
        debug(`[ISweep-YT] Sending to backend: ${backend}/event with user: ${user}`);
        
        // Send to backend
        const requestUrl = `${backend}/event`;
        debug(`[ISweep-YT] ===== REQUEST START ===== URL: ${requestUrl}`);
        
        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: user,
                text: cleanCaption,
                content_type: null,
                confidence: 0.9,
                timestamp: timestamp
            })
        });

        debug(`[ISweep-YT] ===== RESPONSE RECEIVED ===== URL: ${requestUrl} | Status: ${response.status} (${response.ok ? 'OK' : 'ERROR'})`);

        if (!response.ok) {
            const errorText = await response.text();
            debug(`[ISweep-YT] ===== ERROR BODY ===== ${errorText}`);
            throw new Error(`API error: ${response.status}`);
        }

        const decision = await response.json();
        
        debug(`[ISweep-YT] Decision received: ${decision.action} - ${decision.reason}`);
        
        if (decision.action !== 'none') {
            applyYouTubeAction(decision, captionText);
        }
    } catch (error) {
        console.warn('[ISweep-YT] API error:', error.message, error);
    }
}

/**
 * Apply action to YouTube video
 */
function applyYouTubeAction(decision, captionText) {
    const videoElement = getYouTubeVideoElement();
    if (!videoElement) {
        console.warn('[ISweep-YT] Could not find video element');
        return;
    }

    const { action, duration_seconds, reason } = decision;
    const duration = Math.max(0, Number(duration_seconds) || 3); // Default 3 seconds if null/undefined

    if (!videoElement) {
        console.warn('[ISweep-YT] Video element missing, cannot apply action');
        return;
    }

    debug(`[ISweep-YT] Action: ${action} - ${reason}`);

    switch (action) {
        case 'mute':
            videoElement.muted = true;
            // Safe increment: only if variable exists
            if (typeof appliedActions !== 'undefined') appliedActions++;
            showYouTubeFeedback('MUTED', 'rgba(255, 107, 107, 0.9)');
            setTimeout(() => {
                videoElement.muted = false;
            }, duration * 1000);
            break;

        case 'skip':
            const newTime = videoElement.currentTime + duration;
            videoElement.currentTime = Math.min(newTime, videoElement.duration);
            if (typeof appliedActions !== 'undefined') appliedActions++;
            showYouTubeFeedback('SKIPPED', 'rgba(66, 133, 244, 0.9)');
            break;

        case 'fast_forward':
            const originalSpeed = videoElement.playbackRate;
            videoElement.playbackRate = 2.0;
            if (typeof appliedActions !== 'undefined') appliedActions++;
            showYouTubeFeedback('FAST-FORWARD 2x', 'rgba(251, 188, 5, 0.9)');
            setTimeout(() => {
                videoElement.playbackRate = originalSpeed;
            }, duration * 1000);
            break;
    }

    // Safe call: only if function exists
    if (typeof updateStats === 'function') updateStats();
}

/**
 * Show visual feedback on YouTube video
 */
function showYouTubeFeedback(text, bgColor) {
    const videoElement = getYouTubeVideoElement();
    if (!videoElement || !videoElement.parentElement) return;

    const feedback = document.createElement('div');
    feedback.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${bgColor};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        font-size: 18px;
        font-weight: 700;
        z-index: 10001;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        animation: fadeInOut 1.5s ease-in-out;
    `;
    feedback.textContent = text;

    const parent = videoElement.parentElement || document.body;
    if (parent) {
        try {
            parent.appendChild(feedback);
            setTimeout(() => feedback.remove(), 1500);
        } catch (error) {
            console.warn('[ISweep-YT] Failed to append feedback:', error);
        }
    }
}

/**
 * Add ISweep badge to YouTube video
 */
function addYouTubeBadge() {
    const videoElement = getYouTubeVideoElement();
    if (!videoElement || !videoElement.parentElement || videoElement._isweepYTBadge) return;

    const badge = document.createElement('div');
    badge.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(34, 197, 94, 0.9);
        color: white;
        padding: 6px 10px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        z-index: 10000;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    badge.textContent = '✓ ISweep Active';

    const parent = videoElement.parentElement || document.body;
    if (parent) {
        try {
            parent.appendChild(badge);
            videoElement._isweepYTBadge = badge;
        } catch (error) {
            console.warn('[ISweep-YT] Failed to append badge:', error);
            videoElement._isweepYTBadge = null;
        }
    }

    debug('[ISweep-YT] Badge added');
}

/**
 * Remove ISweep badge
 */
function removeYouTubeBadge() {
    const videoElement = getYouTubeVideoElement();
    if (videoElement && videoElement._isweepYTBadge) {
        videoElement._isweepYTBadge.remove();
        videoElement._isweepYTBadge = null;
    }
}

/**
 * Initialize on page load and video changes
 */
function initYouTubeOnVideoChange() {
    // When user clicks on a new video, reinitialize
    document.addEventListener('yt-navigate-finish', () => {
        debug('[ISweep-YT] Video changed, reinitializing');
        lastCaptionText = '';
        initYouTubeHandler();
    });

    // Also monitor for dynamically added videos
    const observer = new MutationObserver(() => {
        if (isYouTubePage() && !ytCaptionObserver) {
            initYouTubeHandler();
        }
    });

    // Only observe if document.body is available
    if (!document.body) {
        debug('[ISweep-YT] document.body not available yet, waiting for DOMContentLoaded');
        document.addEventListener('DOMContentLoaded', () => {
            if (document.body) {
                try {
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                } catch (error) {
                    console.error('[ISweep-YT] Failed to observe document.body:', error);
                }
            }
        });
    } else if (document.body) {
        try {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        } catch (error) {
            console.error('[ISweep-YT] Failed to observe document.body:', error);
        }
    } else {
        console.warn('[ISweep-YT] document.body not available, cannot set up observer');
    }
}

// Export functions to window for content-script access (Chrome content scripts don't use CommonJS)
window.initYouTubeHandler = initYouTubeHandler;
window.isYouTubePage = isYouTubePage;
window.initYouTubeOnVideoChange = initYouTubeOnVideoChange;
window.getYouTubeVideoElement = getYouTubeVideoElement;

} // ← Close the guard block

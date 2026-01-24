// youtube-handler.js
/**
 * YouTube player integration
 * Detects YouTube videos and extracts captions from the page
 */

// Prevent double-injection on YouTube SPA
if (window.__isweepYouTubeLoaded) {
    console.log("[ISweep-YT] youtube-handler already loaded; skipping duplicate injection");
} else {
    window.__isweepYouTubeLoaded = true;

    // DEBUG flag - set to false to disable all logs
    window.__ISWEEP_DEBUG = window.__ISWEEP_DEBUG ?? true;

    // Helper function for conditional logging
    function ytDebug(message) {
        if (window.__ISWEEP_DEBUG) {
            console.log(message);
        }
    }

let youtubePlayer = null;
let lastCaptionText = '';
let ytCaptionObserver = null;

/**
 * Initialize YouTube handler
 */
function initYouTubeHandler() {
    if (!isYouTubePage()) return false;
    
    ytDebug('[ISweep-YT] Initializing YouTube handler');
    
    // Try to get player reference
    youtubePlayer = getYouTubePlayer();
    if (!youtubePlayer) {
        console.warn('[ISweep-YT] Could not get YouTube player reference, will retry');
        // Retry after delay
        setTimeout(() => {
            youtubePlayer = getYouTubePlayer();
            if (youtubePlayer) {
                ytDebug('[ISweep-YT] Player reference obtained on retry');
            }
        }, 2000);
    } else {
        ytDebug('[ISweep-YT] Player reference obtained');
    }


    // Add status pill UI
    updateStatusIcon(typeof isEnabled !== 'undefined' ? isEnabled : true);

    // Monitor for caption changes (with retries)
    ytDebug('[ISweep-YT] Starting caption monitoring');
    monitorYouTubeCaptions();
    

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

/**
 * Check if YouTube captions are visibly rendering on screen
 */
function areCaptionsVisiblyRendering() {
    // Check for caption segments with text
    const segments = document.querySelectorAll('.ytp-caption-segment');
    if (segments.length > 0) {
        for (const seg of segments) {
            if (seg.textContent && seg.textContent.trim().length > 0) {
                return true;
            }
        }
    }
    
    // Check for caption window container with text
    const captionWindow = document.querySelector('.ytp-caption-window-container');
    if (captionWindow && captionWindow.textContent && captionWindow.textContent.trim().length > 0) {
        return true;
    }
    
    return false;
}

/**
 * Check if YouTube CC button indicates captions are enabled
 */
function areCaptionsButtonEnabled() {
    const ccButton = document.querySelector('.ytp-subtitles-button');
    if (ccButton) {
        const isPressed = ccButton.getAttribute('aria-pressed') === 'true';
        return isPressed;
    }
    return null;
}

/**
 * Log a snapshot of caption DOM elements for debugging
 */
function logCaptionDebugSnapshot() {
    try {
        const playerExists = !!document.querySelector('.html5-video-player');
        const captionWindowExists = !!document.querySelector('.ytp-caption-window-container');
        const segmentCount = document.querySelectorAll('.ytp-caption-segment').length;
        const captionWindow = document.querySelector('.ytp-caption-window-container');
        const captionText = captionWindow && captionWindow.textContent ? captionWindow.textContent.substring(0, 50) : 'N/A';
        
        ytDebug(`[ISweep-YT] DEBUG SNAPSHOT: playerExists=${playerExists}, captionWindowExists=${captionWindowExists}, segmentCount=${segmentCount}, captionSample="${captionText}"`);
    } catch (e) {
        console.warn('[ISweep-YT] Error logging debug snapshot:', e);
    }
}

/**
 * Caption Hunter Fallback: Find caption node when selectors fail
 * Searches for any element containing caption-like text
 */
function findBestCaptionNode() {
    try {
        // Get player root for scoped search
        const playerRoot = document.querySelector('.html5-video-player') || document;
        
        // Candidates to search (from most specific to most general)
        const selectors = [
            '.ytp-caption-window-container',
            '.ytp-captions-text',
            '.captions-text',
            '[class*="caption"]',
            '[class*="subtitle"]',
            'span, div'
        ];
        
        let bestNode = null;
        let maxLength = 0;
        
        for (const selector of selectors) {
            try {
                const candidates = playerRoot.querySelectorAll(selector);
                
                for (const el of candidates) {
                    // Only process HTMLElements
                    if (!(el instanceof HTMLElement)) continue;
                    
                    const text = el.textContent ? el.textContent.trim() : '';
                    
                    // Filter: text >= 2 chars AND contains at least one letter
                    if (text.length >= 2 && /[A-Za-z]/.test(text)) {
                        // Prefer longer text (more likely to be actual captions)
                        if (text.length > maxLength) {
                            maxLength = text.length;
                            bestNode = el;
                        }
                    }
                }
            } catch (e) {
                // Continue to next selector on error
                continue;
            }
        }
        
        return bestNode;
    } catch (e) {
        console.warn('[ISweep-YT] Error in findBestCaptionNode:', e);
        return null;
    }
}

/**
 * Monitor YouTube's caption display
 */
function monitorYouTubeCaptions() {
    let retryCount = window._ytCaptionRetryCount || 0;
    
    // Check both aria-pressed and visible captions
    const ariaPressed = areCaptionsButtonEnabled();
    const visibleCaptions = areCaptionsVisiblyRendering();
    
    ytDebug(`[ISweep-YT] Caption status check: ariaPressed=${ariaPressed}, visibleCaptions=${visibleCaptions}`);
    
    // Only give up if BOTH checks fail (not just aria-pressed)
    if (!ariaPressed && !visibleCaptions) {
        // Allow up to 120 attempts (60 seconds at 500ms intervals) before giving up
        if (retryCount < 120) {
            window._ytCaptionRetryCount = retryCount + 1;
            const percent = Math.round((retryCount / 120) * 100);
            logCaptionDebugSnapshot();
            ytDebug(`[ISweep-YT] No captions detected (both checks failed), retrying (${retryCount + 1}/120, ${percent}%) in 500ms...`);
            setTimeout(monitorYouTubeCaptions, 500);
            return;
        } else {
            console.warn('[ISweep-YT] Could not detect captions after 120 attempts (60 seconds) - both aria-pressed and visible checks failed');
            return;
        }
    }
    
    // Captions are detected (at least one check passed)
    ytDebug('[ISweep-YT] Captions detected - proceeding with monitoring');

    // Find caption container (try multiple times as YouTube takes time to render captions)
    let captionContainer = getCaptionContainer();
    
    if (!captionContainer) {
        // Try caption hunter as fallback before giving up
        const hunterNode = findBestCaptionNode();
        if (hunterNode) {
            ytDebug(`[ISweep-YT] Hunter found caption node: ${hunterNode.className || hunterNode.tagName} sample="${hunterNode.textContent.substring(0, 30)}..."`);
            // Store hunter node for extraction to use
            window.__isweepCaptionNode = hunterNode;
            captionContainer = hunterNode;
        } else {
            // Allow up to 120 attempts (60 seconds at 500ms intervals)
            if (retryCount < 120) {
                window._ytCaptionRetryCount = retryCount + 1;
                const percent = Math.round((retryCount / 120) * 100);
                logCaptionDebugSnapshot();
                ytDebug(`[ISweep-YT] Caption container not found, retrying (${retryCount + 1}/120, ${percent}%) in 500ms...`);
                setTimeout(monitorYouTubeCaptions, 500);
                return;
            } else {
                console.warn('[ISweep-YT] Could not find caption container after 120 attempts (60 seconds)');
                return;
            }
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

    ytDebug('[ISweep-YT] Found caption container, type:', captionContainer.nodeName);

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

    // Determine the best node to observe: caption window container first, then player root, then caption container
    let observeTarget = captionContainer;
    try {
        const captionWindow = document.querySelector('.ytp-caption-window-container');
        if (captionWindow && document.contains(captionWindow)) {
            observeTarget = captionWindow;
            ytDebug('[ISweep-YT] Will observe .ytp-caption-window-container');
        } else {
            const playerRoot = getPlayerRoot();
            if (playerRoot !== document) {
                observeTarget = playerRoot;
                ytDebug('[ISweep-YT] Will observe player root element');
            } else {
                ytDebug('[ISweep-YT] Will observe caption container');
            }
        }
    } catch (e) {
        ytDebug('[ISweep-YT] Error determining observe target, using caption container');
    }

    // Observe with aggressive settings
    try {
        ytCaptionObserver.observe(observeTarget, {
            childList: true,
            subtree: true,
            characterData: true
        });
        ytDebug('[ISweep-YT] Caption monitoring started successfully');
    } catch (error) {
        console.error('[ISweep-YT] Failed to start monitoring:', error);
        // Retry if observer fails
        setTimeout(monitorYouTubeCaptions, 1000);
    }
}

/**
 * Get the YouTube player root element
 */
function getPlayerRoot() {
    const player = document.querySelector('.html5-video-player');
    if (player) {
        ytDebug('[ISweep-YT] Found player root: .html5-video-player');
        return player;
    }
    ytDebug('[ISweep-YT] Player root not found, using document as fallback');
    return document;
}

/**
 * Get YouTube caption container
 */
function getCaptionContainer() {
    // Search within player element first, then fallback to document
    const playerRoot = getPlayerRoot();
    
    // YouTube places captions in several possible locations
    // Try YouTube-specific selectors first, prioritizing caption window container
    const selectors = [
        // YouTube caption containers (high priority)
        '.ytp-caption-window-container',
        '.ytp-caption-window-container .captions-text',
        '.ytp-caption-segment',
        'div.ytp-captions-text',
        // Fallback to common HTML patterns
        '.captions-text',
        'div[aria-live="off"]',
        'div[role="region"][aria-label*="captions"]',
    ];

    for (const selector of selectors) {
        try {
            const container = playerRoot.querySelector(selector);
            // Validate: must be an HTMLElement (not script/style), nodeType 1, and in document
            if (container && 
                container instanceof HTMLElement && 
                container.nodeType === 1 && 
                !(container instanceof HTMLScriptElement) &&
                !(container instanceof HTMLStyleElement) &&
                document.contains(container)) {
                ytDebug('[ISweep-YT] Found caption container with selector:', selector);
                return container;
            }
        } catch (e) {
            console.warn('[ISweep-YT] Error with selector', selector, e);
            continue;
        }
    }

    // Last resort: find any element with caption-related text
    try {
        const allDivs = playerRoot.querySelectorAll('div[role="status"], div[aria-live="polite"]');
        for (const div of allDivs) {
            if (div && div instanceof Node && div.nodeType === 1 && document.contains(div) && div.textContent.length > 0) {
                ytDebug('[ISweep-YT] Found caption container via aria-live');
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
        // Fallback: if hunter node exists, use it directly
        if (window.__isweepCaptionNode && window.__isweepCaptionNode.textContent) {
            const text = window.__isweepCaptionNode.textContent.trim();
            if (text.length > 0) {
                ytDebug(`[ISweep-YT] Using hunter node fallback: "${text}"`);
                return text;
            }
        }
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
        ytDebug(`[ISweep-YT] Extracted caption: "${result}"`);
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
    
    ytDebug(`[ISweep-YT] Caption change detected: "${captionText}", isEnabled: ${enabled}`);
    
    if (!enabled || !captionText) {
        if (!enabled) ytDebug('[ISweep-YT] ISweep not enabled, skipping');
        if (!captionText) ytDebug('[ISweep-YT] No caption text, skipping');
        return;
    }

    // Throttle requests
    const now = Date.now();
    if (window._isweepLastYTCheck && (now - window._isweepLastYTCheck) < 500) {
        ytDebug('[ISweep-YT] Throttled (500ms limit)');
        return;
    }
    window._isweepLastYTCheck = now;

    try {

        // Get backend URL and user ID (try both local and localStorage)
        const backend = typeof backendURL !== 'undefined' ? backendURL : localStorage.getItem('backendURL') || 'http://127.0.0.1:8001';
        const user = typeof userId !== 'undefined' ? userId : localStorage.getItem('userId') || 'user123';
        
        // Get video element for timestamp
        const videoElement = getYouTubeVideoElement();
        const timestamp_seconds = videoElement ? Math.floor(videoElement.currentTime) : 0;
        
        // Normalize caption text to remove special characters (♪, ♫, etc.)
        const cleanCaption = captionText
            .replace(/[♪♫]/g, " ")
            .replace(/[^\p{L}\p{N}\s']/gu, " ")
            .replace(/\s+/g, " ")
            .trim();
        
        ytDebug(`[ISweep-YT] Sending to backend: ${backend}/event with user: ${user}`);
        
        // Send to backend
        const requestUrl = `${backend}/event`;
        ytDebug(`[ISweep-YT] ===== REQUEST START ===== URL: ${requestUrl}`);
        
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
                timestamp_seconds: timestamp
            })
        });

        ytDebug(`[ISweep-YT] ===== RESPONSE RECEIVED ===== URL: ${requestUrl} | Status: ${response.status} (${response.ok ? 'OK' : 'ERROR'})`);

        if (!response.ok) {
            const errorText = await response.text();
            ytDebug(`[ISweep-YT] ===== ERROR BODY ===== ${errorText}`);
            throw new Error(`API error: ${response.status}`);
        }

        const decision = await response.json();
        
        ytDebug(`[ISweep-YT] Decision received: ${decision.action} - ${decision.reason}`);
        
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

    ytDebug(`[ISweep-YT] Action: ${action} - ${reason}`);

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

    ytDebug('[ISweep-YT] Badge added');
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
        ytDebug('[ISweep-YT] Video changed, reinitializing');
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
        ytDebug('[ISweep-YT] document.body not available yet, waiting for DOMContentLoaded');
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

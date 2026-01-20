// youtube-handler.js
/**
 * YouTube player integration
 * Detects YouTube videos and extracts captions from the page
 */

let youtubePlayer = null;
let lastCaptionText = '';
let ytCaptionObserver = null;

/**
 * Initialize YouTube handler
 */
function initYouTubeHandler() {
    if (!isYouTubePage()) return false;
    
    console.log('[ISweep-YT] Initializing YouTube handler');
    
    // Try to get player reference
    youtubePlayer = getYouTubePlayer();
    if (!youtubePlayer) {
        console.warn('[ISweep-YT] Could not get YouTube player reference');
        // Retry after delay
        setTimeout(() => {
            youtubePlayer = getYouTubePlayer();
        }, 2000);
    }

    // Monitor for caption changes
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
    // Find caption container
    const captionContainer = getCaptionContainer();
    
    if (!captionContainer) {
        console.log('[ISweep-YT] Caption container not found, retrying...');
        setTimeout(monitorYouTubeCaptions, 2000);
        return;
    }

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

    ytCaptionObserver.observe(captionContainer, {
        childList: true,
        subtree: true,
        characterData: true
    });

    console.log('[ISweep-YT] Caption monitoring started');
}

/**
 * Get YouTube caption container
 */
function getCaptionContainer() {
    // YouTube places captions in several possible locations
    // Try common selectors
    const selectors = [
        '.captions-text',
        '[class*="caption"]',
        'video ~ div',
        'div[role="region"]'
    ];

    for (const selector of selectors) {
        const container = document.querySelector(selector);
        if (container && container.textContent.trim()) {
            return container;
        }
    }

    // Return main video container if nothing else works
    return document.querySelector('video')?.parentElement;
}

/**
 * Extract visible captions from YouTube page
 */
function extractYouTubeCaptions() {
    // YouTube renders captions in span elements with class "captions-text"
    const captionElements = document.querySelectorAll('[class*="caption"] span, .captions-text span');
    
    if (captionElements.length === 0) {
        return null;
    }

    // Combine all visible caption text
    let fullText = '';
    captionElements.forEach(el => {
        const text = el.textContent.trim();
        if (text) {
            fullText += (fullText ? ' ' : '') + text;
        }
    });

    return fullText.trim() || null;
}

/**
 * Handle when YouTube captions change
 */
async function handleYouTubeCaptionChange(captionText) {
    if (!isEnabled || !captionText) return;

    console.log(`[ISweep-YT] Caption: "${captionText}"`);

    // Throttle requests
    const now = Date.now();
    if (window._isweepLastYTCheck && (now - window._isweepLastYTCheck) < 500) {
        return;
    }
    window._isweepLastYTCheck = now;

    try {
        // Send to backend
        const response = await fetch(`${backendURL}/event`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId,
                text: captionText,
                content_type: null,
                confidence: 0.9,
                timestamp_seconds: null
            })
        });

        if (!response.ok) throw new Error('API error');

        const decision = await response.json();
        
        if (decision.action !== 'none') {
            applyYouTubeAction(decision, captionText);
        }
    } catch (error) {
        console.warn('[ISweep-YT] API error:', error);
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

    console.log(`[ISweep-YT] Action: ${action} - ${reason}`);

    switch (action) {
        case 'mute':
            videoElement.muted = true;
            appliedActions++;
            showYouTubeFeedback('MUTED', 'rgba(255, 107, 107, 0.9)');
            setTimeout(() => {
                videoElement.muted = false;
            }, duration_seconds * 1000);
            break;

        case 'skip':
            const newTime = videoElement.currentTime + duration_seconds;
            videoElement.currentTime = Math.min(newTime, videoElement.duration);
            appliedActions++;
            showYouTubeFeedback('SKIPPED', 'rgba(66, 133, 244, 0.9)');
            break;

        case 'fast_forward':
            const originalSpeed = videoElement.playbackRate;
            videoElement.playbackRate = 2.0;
            appliedActions++;
            showYouTubeFeedback('FAST-FORWARD 2x', 'rgba(251, 188, 5, 0.9)');
            setTimeout(() => {
                videoElement.playbackRate = originalSpeed;
            }, duration_seconds * 1000);
            break;
    }

    updateStats();
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

    if (videoElement.parentElement) {
        videoElement.parentElement.appendChild(feedback);
        setTimeout(() => feedback.remove(), 1500);
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

    videoElement.parentElement.appendChild(badge);
    videoElement._isweepYTBadge = badge;

    console.log('[ISweep-YT] Badge added');
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
        console.log('[ISweep-YT] Video changed, reinitializing');
        lastCaptionText = '';
        initYouTubeHandler();
    });

    // Also monitor for dynamically added videos
    const observer = new MutationObserver(() => {
        if (isYouTubePage() && !ytCaptionObserver) {
            initYouTubeHandler();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Export for use in content-script.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initYouTubeHandler,
        isYouTubePage,
        getYouTubeVideoElement,
        showYouTubeFeedback,
        addYouTubeBadge,
        removeYouTubeBadge
    };
}

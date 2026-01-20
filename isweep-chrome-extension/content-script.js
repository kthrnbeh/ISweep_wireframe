// content-script.js
/**
 * Content script injected into every page
 * Detects videos, extracts captions, and controls playback
 * Supports: HTML5 video + YouTube
 */

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
    
    // Initialize YouTube handler if on YouTube (uses isYouTubePage() function from youtube-handler.js)
    if (isYouTubePage && isYouTubePage()) {
        console.log('[ISweep] YouTube page detected');
        initYouTubeHandler();
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleISweep') {
        isEnabled = request.enabled;
        console.log(`[ISweep] ${isEnabled ? 'Enabled' : 'Disabled'}`);
        sendResponse({ success: true });
    }
});

// Detect all video elements on page
function detectVideos() {
    const videos = document.querySelectorAll('video');
    
    if (videos.length > 0 && detectedVideos !== videos.length) {
        detectedVideos = videos.length;
        console.log(`[ISweep] Detected ${videos.length} video(s)`);
        
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
    createControlOverlay(videoElement, index);

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
        console.log(`[ISweep] Video ${index}: No captions found`);
        return;
    }

    console.log(`[ISweep] Video ${index}: Found ${tracks.length} caption track(s)`);

    tracks.forEach((track, trackIndex) => {
        // Try to load and parse VTT file
        const src = track.src;
        if (src) {
            fetch(src)
                .then(r => r.text())
                .then(vttText => {
                    videoElement._isweepCaptions = parseVTT(vttText);
                    console.log(`[ISweep] Loaded ${videoElement._isweepCaptions.length} caption cues`);
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
        // Send caption text to backend for analysis
        const response = await fetch(`${backendURL}/event`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId,
                text: captionText,  // REAL caption text!
                content_type: null,  // Let backend analyze text
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

    console.log(`[ISweep] Caption: "${captionText}"`);
    console.log(`[ISweep] Action: ${action} - ${reason}`);

    switch (action) {
        case 'mute':
            videoElement.muted = true;
            appliedActions++;
            
            // Show visual feedback
            showFeedback(videoElement, 'MUTED', 'rgba(255, 107, 107, 0.9)');
            
            setTimeout(() => {
                videoElement.muted = false;
            }, duration_seconds * 1000);
            break;

        case 'skip':
            videoElement.currentTime += duration_seconds;
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
            }, duration_seconds * 1000);
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
if (!document.getElementById('isweep-styles')) {
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
    console.log(`[ISweep] Video ${index} started playing`);
    
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

observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false
});

// Initial detection
detectVideos();

// Periodic check for new videos
setInterval(detectVideos, 2000);

// Initialize YouTube handler if on YouTube
if (isYouTubePage && isYouTubePage()) {
    initYouTubeOnVideoChange();
    setTimeout(initYouTubeHandler, 1000);
}

console.log('[ISweep] Content script loaded - Caption extraction enabled' + (isYouTubePage && isYouTubePage() ? ' + YouTube support' : ''));

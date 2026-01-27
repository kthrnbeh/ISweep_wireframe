// youtube-handler.js
/**
 * YouTube player integration
 * Detects YouTube videos and extracts captions from the page
 */

(() => {
    'use strict';

    // Prevent double-injection on YouTube SPA
    if (window.__isweepYouTubeLoaded) {
        console.log("[ISweep-YT] youtube-handler already loaded; skipping duplicate injection");
        return;
    }
    window.__isweepYouTubeLoaded = true;

    // Global debug flag (shared across extension); default to true if undefined
    window.__ISWEEP_DEBUG = (window.__ISWEEP_DEBUG ?? true);

    // Helper function for conditional logging
    function ytLog(...args) {
        if (window.__ISWEEP_DEBUG) {
            console.log('[ISweep-YT]', ...args);
        }
    }

    let youtubePlayer = null;
    let lastCaptionText = '';
    let ytCaptionObserver = null;

    let isEnabled = false;
    let backendURL = 'http://127.0.0.1:8001';
    let userId = 'user123';

    async function loadSettings() {
        try {
            const result = await chrome.storage.local.get(['isweep_enabled', 'backendURL', 'userId']);
            if (typeof result.isweep_enabled !== 'undefined') isEnabled = Boolean(result.isweep_enabled);
            if (typeof result.backendURL === 'string') backendURL = result.backendURL;
            if (typeof result.userId === 'string') userId = result.userId;
        } catch (e) {
            ytLog('[ISweep-YT] Failed to load settings, using defaults');
        } finally {
            ytLog('[ISweep-YT] enabled state from storage:', isEnabled);
            ytLog('[ISweep-YT] Settings after load', { isEnabled, backendURL, userId });
        }
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.isweep_enabled && typeof changes.isweep_enabled.newValue !== 'undefined') {
            const oldValue = isEnabled;
            isEnabled = Boolean(changes.isweep_enabled.newValue);
            ytLog('[ISweep-YT] isweep_enabled changed:', { from: oldValue, to: isEnabled });
            
            // Stop monitoring if disabled
            if (!isEnabled) {
                if (ytCaptionObserver) {
                    ytCaptionObserver.disconnect();
                    ytCaptionObserver = null;
                    ytLog('[ISweep-YT] Caption observer disconnected (disabled)');
                }
            } else {
                // Restart monitoring if enabled
                ytLog('[ISweep-YT] Restarting caption monitoring (enabled)');
                monitorYouTubeCaptions();
            }
        }
        if (changes.backendURL && typeof changes.backendURL.newValue === 'string') {
            backendURL = changes.backendURL.newValue;
        }
        if (changes.userId && typeof changes.userId.newValue === 'string') {
            userId = changes.userId.newValue;
        }
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message && message.action === 'toggleISweep' && typeof message.enabled !== 'undefined') {
            isEnabled = message.enabled;
        }
    });

    function isYouTubePage() {
        return /youtube\.com|youtu\.be/.test(location.host);
    }

    function getYouTubePlayer() {
        const player = document.querySelector('video');
        return player || null;
    }

    function getYouTubeVideoElement() {
        return document.querySelector('video');
    }

    function getPlayerRoot() {
        return document.querySelector('.html5-video-player') || document.body || document;
    }

    // Caption segment helpers
    function getCaptionSegments() {
        const scoped = Array.from(document.querySelectorAll('.ytp-caption-window-container .ytp-caption-segment'));
        if (scoped.length > 0) return scoped;
        return Array.from(document.querySelectorAll('.ytp-caption-segment'));
    }

    function readCaptionTextFromSegments(segments) {
        if (!segments || segments.length === 0) return '';
        const parts = segments
            .map(seg => (seg.textContent || '').trim())
            .filter(Boolean);
        return parts.join(' ').replace(/\s+/g, ' ').trim();
    }

    // Monitor captions via MutationObserver on player root / body
    function monitorYouTubeCaptions() {
        const startedAt = window._ytObserveStartedAt || Date.now();
        window._ytObserveStartedAt = startedAt;

        const observeTarget = getPlayerRoot();
        if (!observeTarget) {
            if (Date.now() - startedAt < 60000) {
                ytLog('[ISweep-YT] No observe target yet, retrying in 500ms');
                setTimeout(monitorYouTubeCaptions, 500);
                return;
            }
            ytLog('[ISweep-YT] Fallback to document for observing');
        }

        const target = observeTarget || document;

        if (ytCaptionObserver) {
            ytCaptionObserver.disconnect();
        }

        const handleMutation = () => {
            const segments = getCaptionSegments();
            const captionText = readCaptionTextFromSegments(segments);

            const now = Date.now();
            if (!window._ytSegmentDebugTs || (now - window._ytSegmentDebugTs) >= 2000) {
                window._ytSegmentDebugTs = now;
                const sample = captionText ? captionText.slice(0, 50) : '';
                ytLog(`[ISweep-YT] segments=${segments.length} sample="${sample}"`);
            }

            if (captionText && captionText !== lastCaptionText) {
                lastCaptionText = captionText;
                handleYouTubeCaptionChange(captionText);
            }
        };

        ytCaptionObserver = new MutationObserver(handleMutation);

        try {
            ytCaptionObserver.observe(target, { childList: true, subtree: true, characterData: true });
            ytLog('[ISweep-YT] Caption monitoring started');
            handleMutation();
        } catch (error) {
            console.error('[ISweep-YT] Failed to start monitoring:', error);
            if (Date.now() - startedAt < 60000) {
                setTimeout(monitorYouTubeCaptions, 1000);
            }
        }
    }

    async function handleYouTubeCaptionChange(captionText) {
        if (!isEnabled || !captionText) {
            if (!isEnabled) ytLog('[ISweep-YT] Skipping because isEnabled=false');
            if (!captionText) ytLog('[ISweep-YT] No caption text, skipping');
            return;
        }

        const now = Date.now();
        if (window._isweepLastYTCheck && (now - window._isweepLastYTCheck) < 500) {
            ytLog('[ISweep-YT] Throttled (500ms limit)');
            return;
        }
        window._isweepLastYTCheck = now;

        try {
            const videoElement = getYouTubeVideoElement();
            const timestamp_seconds = videoElement ? videoElement.currentTime : 0;

            const cleanCaption = captionText
                .replace(/[♪♫]/g, ' ')
                .replace(/[^\p{L}\p{N}\s']/gu, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (typeof window.__isweepEmitText === 'function') {
                await window.__isweepEmitText({
                    text: cleanCaption,
                    timestamp_seconds,
                    source: 'youtube_dom'
                });
            } else {
                ytLog('[ISweep-YT] __isweepEmitText not available, skipping');
            }
        } catch (error) {
            console.warn('[ISweep-YT] API error:', error.message || error);
        }
    }

    function initYouTubeOnVideoChange() {
        let lastUrl = location.href;
        const observer = new MutationObserver(() => {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                ytLog('[ISweep-YT] Video changed, reinitializing');
                lastCaptionText = '';
                monitorYouTubeCaptions();
            }
        });
        observer.observe(document, { childList: true, subtree: true });
    }

    async function initYouTubeHandler() {
        if (!isYouTubePage()) return;

        await loadSettings();

        ytLog('[ISweep-YT] Initializing YouTube handler');
        youtubePlayer = getYouTubePlayer();
        if (!youtubePlayer) {
            ytLog('[ISweep-YT] Player not ready, will retry');
            setTimeout(() => {
                youtubePlayer = getYouTubePlayer();
                if (youtubePlayer) {
                    ytLog('[ISweep-YT] Player reference obtained on retry');
                }
            }, 2000);
        }

        monitorYouTubeCaptions();
    }

    // Expose for content-script reentry
    window.initYouTubeOnVideoChange = initYouTubeOnVideoChange;
    window.getYouTubeVideoElement = getYouTubeVideoElement;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initYouTubeOnVideoChange();
            initYouTubeHandler();
        });
    } else {
        initYouTubeOnVideoChange();
        initYouTubeHandler();
    }
})();

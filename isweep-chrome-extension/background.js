// background.js
/**
 * Service Worker for ISweep Chrome Extension
 * Handles background tasks and state management
 * Storage structure:
 *   - isweep_enabled: boolean (master toggle)
 *   - isweepPrefs: object { user_id, backendUrl, blocked_words, duration_seconds, action }
 *   - videosDetected: number (stats)
 *   - actionsApplied: number (stats)
 */

// Helper function to update icon based on enabled state
function updateIcon(enabled) {
    const iconSet = enabled ? 'on' : 'off';
    const icons = {
        16: `icons/icon-16-${iconSet}.png`,
        48: `icons/icon-48-${iconSet}.png`,
        128: `icons/icon-128-${iconSet}.png`
    };
    
    chrome.action.setIcon({ path: icons }, () => {
        if (chrome.runtime.lastError) {
            console.warn('[ISweep] Failed to set icon:', chrome.runtime.lastError);
        } else {
            console.log(`[ISweep] Icon updated to ${iconSet.toUpperCase()}`);
        }
    });
}

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('[ISweep] Extension installed');
    
    // Set default values on first install
    chrome.storage.local.set({
        isweep_enabled: false,
        isweepPrefs: {
            user_id: 'user123',
            backendUrl: 'http://127.0.0.1:8001',
            blocked_words: [],
            duration_seconds: 3,
            action: 'mute'
        },
        videosDetected: 0,
        actionsApplied: 0
    });
    
    // Set default icon to OFF
    updateIcon(false);
});

// Listen for extension icon click
chrome.action.onClicked.addListener((tab) => {
    console.log('[ISweep] Icon clicked on tab:', tab.id);
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'logEvent') {
        console.log('[ISweep]', request.message);
        sendResponse({ success: true });
    }
    
    // Note: stats are now handled directly by content-script.js via chrome.storage.local.get/set
    // No longer needed to handle updateStats in background; each tab sends only its increments
});

// Listen for storage changes to update icon when isweep_enabled changes
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.isweep_enabled) {
        const newValue = Boolean(changes.isweep_enabled.newValue);
        console.log('[ISweep] isweep_enabled changed to:', newValue);
        updateIcon(newValue);
    }
});

console.log('[ISweep] Background service worker loaded');

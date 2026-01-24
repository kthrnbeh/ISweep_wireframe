// background.js
/**
 * Service Worker for ISweep Chrome Extension
 * Handles background tasks and state management
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
    
    // Set default values - start with ISweep OFF
    chrome.storage.local.set({
        isEnabled: false,
        userId: 'user123',
        backendURL: 'http://127.0.0.1:8001',
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
    
    if (request.action === 'updateStats') {
        chrome.storage.local.set({
            videosDetected: request.videosDetected,
            actionsApplied: request.actionsApplied
        });
        sendResponse({ success: true });
    }
});

// Listen for storage changes to update icon when ISweep is toggled
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.isEnabled) {
        const newValue = changes.isEnabled.newValue;
        console.log('[ISweep] isEnabled changed to:', newValue);
        updateIcon(newValue);
    }
});

console.log('[ISweep] Background service worker loaded');

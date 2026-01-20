// background.js
/**
 * Service Worker for ISweep Chrome Extension
 * Handles background tasks and state management
 */

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('[ISweep] Extension installed');
    
    // Set default values
    chrome.storage.local.set({
        isEnabled: false,
        userId: 'user123',
        backendURL: 'http://127.0.0.1:8001',
        videosDetected: 0,
        actionsApplied: 0
    });
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

console.log('[ISweep] Background service worker loaded');

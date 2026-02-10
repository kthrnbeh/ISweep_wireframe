// background.js
/**
 * Service Worker for ISweep Chrome Extension
 * Handles: background tasks, state management, offscreen document lifecycle, ASR control
 * Storage structure:
 *   - isweep_enabled: boolean (master toggle)
 *   - isweep_asr_enabled: boolean (backend transcription toggle)
 *   - isweepPrefs: object { user_id, backendUrl, blocked_words, duration_seconds, action }
 *   - videosDetected, actionsApplied: stats
 */

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8001';

let offscreenDocumentId = null;
let activeAsrTabId = null;
let asrSessionActive = false;

// Ensure ASR is on by default for fresh and existing installs
async function ensureAsrDefaults() {
    const { isweep_asr_enabled } = await chrome.storage.local.get(['isweep_asr_enabled']);
    if (typeof isweep_asr_enabled === 'undefined') {
        await chrome.storage.local.set({ isweep_asr_enabled: true });
    }
}

ensureAsrDefaults();

// Helper function to update icon based on enabled state
function updateIcon(enabled) {
    const icons = {
        16: 'icons/icon-16.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png'
    };
    
    chrome.action.setIcon({ path: icons }, () => {
        if (chrome.runtime.lastError) {
            console.warn('[ISweep] Failed to set icon:', chrome.runtime.lastError);
        } else {
            console.log(`[ISweep] Icon updated (enabled: ${enabled})`);
        }
    });
}

/**
 * Create offscreen document if it doesn't already exist
 * MV3 requirement: Service worker cannot run long-lived MediaRecorder
 */
async function ensureOffscreenDocument() {
    try {
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT']
        });

        if (existingContexts.length > 0) {
            console.log('[ISweep] Offscreen document already exists');
            return;
        }

        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Audio capture for tab transcription (ASR)'
        });

        console.log('[ISweep] Offscreen document created');
    } catch (error) {
        console.error('[ISweep] Failed to create offscreen document:', error.message || error);
    }
}

/**
 * Start audio capture for active tab (ASR mode)
 */
async function startAsr(tabId, backendUrl, userId) {
    try {
        if (asrSessionActive && activeAsrTabId === tabId) {
            console.log('[ISweep-BG] ASR already active for tab', tabId);
            return;
        }
        if (!backendUrl || typeof backendUrl !== 'string' || backendUrl.trim().length === 0) {
            console.warn('[ISweep-BG] Backend URL not configured; ASR will not start');
            return;
        }
        await ensureOffscreenDocument();

        activeAsrTabId = tabId;
        asrSessionActive = true;

        const message = {
            action: 'START_ASR',
            tabId,
            backendUrl,
            userId
        };

        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('[ISweep-BG] Error sending START_ASR:', chrome.runtime.lastError);
            } else {
                console.log('[ISweep-BG] START_ASR response:', response);
            }
        });

        await chrome.storage.local.set({ isweep_asr_enabled: true });
    } catch (error) {
        console.error('[ISweep-BG] Failed to start ASR:', error.message || error);
    }
}

/**
 * Stop audio capture for current tab
 */
async function stopAsr() {
    try {
        if (!asrSessionActive && !activeAsrTabId) return;
        const message = { action: 'STOP_ASR' };

        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('[ISweep-BG] Error sending STOP_ASR:', chrome.runtime.lastError);
            } else {
                console.log('[ISweep-BG] STOP_ASR response:', response);
            }
        });

        activeAsrTabId = null;
        asrSessionActive = false;

        await chrome.storage.local.set({
            isweep_asr_enabled: false,
            isweep_asr_status: 'stopped'
        });
    } catch (error) {
        console.error('[ISweep-BG] Failed to stop ASR:', error.message || error);
    }
}

async function handleVideoPresence(tabId, hasVideo) {
    if (!tabId) return;

    const { isweep_enabled, isweepPrefs } = await chrome.storage.local.get([
        'isweep_enabled',
        'isweepPrefs'
    ]);

    if (!hasVideo) {
        if (activeAsrTabId === tabId) {
            console.log('[ISweep-BG] Video ended or navigated; stopping ASR for tab', tabId);
            await stopAsr();
        }
        return;
    }

    if (!isweep_enabled) {
        console.log('[ISweep-BG] Video detected but ISweep disabled; skipping ASR');
        return;
    }

    const backendUrl = isweepPrefs?.backendUrl || DEFAULT_BACKEND_URL;
    const userId = isweepPrefs?.user_id || 'user123';

    if (activeAsrTabId && activeAsrTabId !== tabId) {
        await stopAsr();
    }

    await startAsr(tabId, backendUrl, userId);
}

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('[ISweep] Extension installed');
    
    // Set default values on first install
    chrome.storage.local.set({
        isweep_enabled: false,
        isweep_asr_enabled: true,
        isweepPrefs: {
            user_id: 'user123',
            backendUrl: DEFAULT_BACKEND_URL,
            blocked_words: [],
            duration_seconds: 3,
            action: 'mute'
        },
        videosDetected: 0,
        actionsApplied: 0
    });
    
    updateIcon(false);
});

// Listen for extension icon click
chrome.action.onClicked.addListener((tab) => {
    console.log('[ISweep] Icon clicked on tab:', tab.id);
});

const PREFS_KEY = 'isweepPrefs';
const DEBUG = false;

const dbg = (...args) => { if (DEBUG) console.log('[ISweep-BG]', ...args); };

async function ensureDefaultPrefs() {
    const existing = await chrome.storage.sync.get(PREFS_KEY).catch(() => ({}));
    if (!existing[PREFS_KEY]) {
        const defaults = {
            enabled: true,
            categories: { profanity: true, sexual: true, violence: false, horror: false, crude: false },
            actions: { profanity: 'mute', sexual: 'skip', violence: 'skip' },
            sensitivity: 2,
            notifications: { email: true, inapp: true, none: false },
            parental: { pin: '', requirePin: true }
        };
        await chrome.storage.sync.set({ [PREFS_KEY]: defaults });
    }
}

async function broadcastPrefs(prefs) {
    dbg('broadcastPrefs');
    const allTabs = await chrome.tabs.query({});
    await Promise.all(allTabs.map(tab => {
        if (!tab.id) return Promise.resolve();
        return chrome.tabs.sendMessage(tab.id, { type: 'APPLY_PREFS', prefs }).catch(() => {});
    }));
}

async function sendPrefsToActive() {
    const data = await chrome.storage.sync.get(PREFS_KEY).catch(() => chrome.storage.local.get(PREFS_KEY));
    const prefs = data?.[PREFS_KEY];
    if (!prefs) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'APPLY_PREFS', prefs }).catch(() => {});
    }
}

ensureDefaultPrefs();

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'logEvent') {
        console.log('[ISweep]', request.message);
        sendResponse({ success: true });
    } else if (request.action === 'ASR_SEGMENTS') {
        // Forward ASR segments from offscreen to content script
        const { tabId, segments } = request;
        if (tabId && segments && segments.length > 0) {
            chrome.tabs.sendMessage(tabId, {
                action: 'ASR_SEGMENTS',
                segments: segments
            }).catch(err => {
                console.warn('[ISweep-BG] Failed to send ASR segments to tab:', err.message);
            });
        }
        sendResponse({ success: true });
    } else if (request.action === 'startAsr') {
        // Popup requests ASR start
        const { backendUrl, userId } = request;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                startAsr(tabs[0].id, backendUrl, userId);
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'No active tab' });
            }
        });
        return true; // Keep channel open for async
    } else if (request.action === 'stopAsr') {
        // Popup requests ASR stop
        stopAsr();
        sendResponse({ success: true });
    } else if (request.action === 'VIDEO_PRESENT') {
        const tabId = sender?.tab?.id;
        handleVideoPresence(tabId, true);
        sendResponse({ acknowledged: true });
    } else if (request.action === 'VIDEO_GONE') {
        const tabId = sender?.tab?.id;
        handleVideoPresence(tabId, false);
        sendResponse({ acknowledged: true });
    } else if (request.type === 'PREFS_UPDATED') {
        sendPrefsToActive();
        sendResponse?.({ ok: true });
    } else if (request.type === 'TEST_MUTE') {
        sendPrefsToActive();
        sendResponse?.({ ok: true });
    }
});

// Listen for storage changes to update icon and manage ASR
chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== 'local') return;

    if (changes.isweep_enabled) {
        const newValue = Boolean(changes.isweep_enabled.newValue);
        console.log('[ISweep] isweep_enabled changed to:', newValue);
        updateIcon(newValue);

        // If disabled, always stop ASR
        if (!newValue && activeAsrTabId) {
            await stopAsr();
        }
    }

    if (changes.isweep_asr_enabled) {
        const asrEnabled = Boolean(changes.isweep_asr_enabled.newValue);
        console.log('[ISweep] isweep_asr_enabled changed to:', asrEnabled);

        // Get current config
        const { isweepPrefs, isweep_enabled } = await chrome.storage.local.get([
            'isweepPrefs',
            'isweep_enabled'
        ]);

        if (asrEnabled && isweep_enabled && isweepPrefs) {
            // Start ASR for active tab
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    startAsr(
                        tabs[0].id,
                        isweepPrefs.backendUrl,
                        isweepPrefs.user_id
                    );
                }
            });
        } else if (!asrEnabled && activeAsrTabId) {
            // Stop ASR
            stopAsr();
        }
    }

    if (changes[PREFS_KEY]) {
        const next = changes[PREFS_KEY].newValue;
        dbg('prefs changed, broadcasting');
        broadcastPrefs(next);
    }
});

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === activeAsrTabId) {
        console.log('[ISweep] Active ASR tab closed, stopping ASR');
        stopAsr();
    }
});

console.log('[ISweep] Background service worker loaded');


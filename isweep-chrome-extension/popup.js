// popup.js
document.addEventListener('DOMContentLoaded', async () => {
    // Guard: Check for all required elements
    const toggleButton = document.getElementById('toggleButton');
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const userIdInput = document.getElementById('userIdInput');
    const backendUrlInput = document.getElementById('backendUrl');
    const clearStatsBtn = document.getElementById('clearStats');
    const videosDetectedSpan = document.getElementById('videosDetected');
    const actionsAppliedSpan = document.getElementById('actionsApplied');

    // Validate all required elements exist
    const requiredElements = {
        toggleButton,
        statusIndicator,
        statusText,
        userIdInput,
        backendUrlInput,
        clearStatsBtn,
        videosDetectedSpan,
        actionsAppliedSpan
    };

    const missingElements = Object.entries(requiredElements)
        .filter(([_, element]) => !element)
        .map(([name]) => name);

    if (missingElements.length > 0) {
        console.error('[ISweep-Popup] FATAL: Missing required HTML elements:', missingElements);
        return;
    }

    // Guard: Check for status-dot within statusIndicator
    const statusDot = statusIndicator.querySelector('.status-dot');
    if (!statusDot) {
        console.error('[ISweep-Popup] FATAL: Missing .status-dot element inside statusIndicator');
        return;
    }

    // Load state from Chrome storage (single source: isweepPrefs)
    let { isweepPrefs } = await chrome.storage.local.get('isweepPrefs');

    console.log('[ISweep-Popup] Loaded preferences from storage:', isweepPrefs);

    // Initialize prefs with defaults if not set
    isweepPrefs = isweepPrefs || {
        enabled: false,
        user_id: 'user123',
        backendUrl: 'http://127.0.0.1:8001',
        blocked_words: [],
        duration_seconds: 3,
        action: 'mute',
        videosDetected: 0,
        actionsApplied: 0
    };

    // Set initial values in UI
    userIdInput.value = isweepPrefs.user_id || 'user123';
    backendUrlInput.value = isweepPrefs.backendUrl || 'http://127.0.0.1:8001';
    videosDetectedSpan.textContent = isweepPrefs.videosDetected || 0;
    actionsAppliedSpan.textContent = isweepPrefs.actionsApplied || 0;

    // Update UI based on state
    const updateUI = (enabled) => {
        const dot = statusIndicator.querySelector('.status-dot');
        if (!dot) {
            console.error('[ISweep-Popup] WARNING: .status-dot element not found in statusIndicator');
            return;
        }
        if (enabled) {
            dot.classList.remove('inactive');
            dot.classList.add('active');
            statusText.textContent = 'Active';
            toggleButton.textContent = 'Disable ISweep';
            toggleButton.classList.add('active');
        } else {
            dot.classList.remove('active');
            dot.classList.add('inactive');
            statusText.textContent = 'Inactive';
            toggleButton.textContent = 'Enable ISweep';
            toggleButton.classList.remove('active');
        }
    };

    // Ensure enabled is boolean
    isweepPrefs.enabled = Boolean(isweepPrefs.enabled);
    updateUI(isweepPrefs.enabled);
    console.log('[ISweep-Popup] Initial enabled state:', isweepPrefs.enabled);

    // Toggle button (guarded)
    if (toggleButton) {
        toggleButton.addEventListener('click', async () => {
            isweepPrefs.enabled = !isweepPrefs.enabled;
            isweepPrefs.user_id = userIdInput.value.trim();
            isweepPrefs.backendUrl = backendUrlInput.value.trim();
            
            // Save to storage
            await chrome.storage.local.set({ isweepPrefs });
            updateUI(isweepPrefs.enabled);

            console.log('[ISweep-Popup] TOGGLED enabled:', isweepPrefs.enabled);

            // Notify active tab's content script to toggle immediately
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'toggleISweep',
                        enabled: isweepPrefs.enabled,
                        prefs: isweepPrefs
                    }).catch((err) => {
                        console.log('[ISweep-Popup] Could not send message to active tab (expected on non-content pages):', err.message);
                    });
                }
            });
        });
    }

    // Save user ID on input change (guarded)
    if (userIdInput) {
        userIdInput.addEventListener('change', async () => {
            isweepPrefs.user_id = userIdInput.value.trim();
            await chrome.storage.local.set({ isweepPrefs });
            console.log('[ISweep-Popup] Updated user_id to:', isweepPrefs.user_id);
        });
    }

    // Save backend URL on input change (guarded)
    if (backendUrlInput) {
        backendUrlInput.addEventListener('change', async () => {
            isweepPrefs.backendUrl = backendUrlInput.value.trim();
            await chrome.storage.local.set({ isweepPrefs });
            console.log('[ISweep-Popup] Updated backendUrl to:', isweepPrefs.backendUrl);
        });
    }

    // Clear stats (guarded)
    if (clearStatsBtn) {
        clearStatsBtn.addEventListener('click', async () => {
            isweepPrefs.videosDetected = 0;
            isweepPrefs.actionsApplied = 0;
            await chrome.storage.local.set({ isweepPrefs });
            if (videosDetectedSpan) videosDetectedSpan.textContent = '0';
            if (actionsAppliedSpan) actionsAppliedSpan.textContent = '0';
        });
    }

    // Listen for updates from background script (guarded)
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.isweepPrefs) {
            const updated = changes.isweepPrefs.newValue;
            if (updated) {
                isweepPrefs = updated;
                if (videosDetectedSpan) videosDetectedSpan.textContent = updated.videosDetected || 0;
                if (actionsAppliedSpan) actionsAppliedSpan.textContent = updated.actionsApplied || 0;
            }
        }
    });
});

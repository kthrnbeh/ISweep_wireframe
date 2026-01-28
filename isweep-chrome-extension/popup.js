// popup.js
document.addEventListener('DOMContentLoaded', async () => {
    const toggleButton = document.getElementById('toggleButton');
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const userIdInput = document.getElementById('userIdInput');
    const backendUrl = document.getElementById('backendUrl');
    const clearStatsBtn = document.getElementById('clearStats');
    const videosDetectedSpan = document.getElementById('videosDetected');
    const actionsAppliedSpan = document.getElementById('actionsApplied');

    // Load state from Chrome storage
    let { isweep_enabled, userId, backendURL, videosDetected, actionsApplied, isweepPrefs } = await chrome.storage.local.get([
        'isweep_enabled',
        'userId',
        'backendURL',
        'videosDetected',
        'actionsApplied',
        'isweepPrefs'
    ]);

    console.log('[ISweep-Popup] Loaded state from storage:', { isweep_enabled, userId, backendURL });

    // Initialize prefs with defaults if not set
    isweepPrefs = isweepPrefs || {
        blocked_words: [],
        duration_seconds: 3,
        action: 'mute',
        user_id: userId || 'user123',
        backendUrl: backendURL || 'http://127.0.0.1:8001'
    };

    // Set initial values
    userIdInput.value = userId || 'user123';
    backendUrl.value = backendURL || 'http://127.0.0.1:8001';
    videosDetectedSpan.textContent = videosDetected || 0;
    actionsAppliedSpan.textContent = actionsApplied || 0;

    // Update UI based on state
    const updateUI = (enabled) => {
        const dot = statusIndicator.querySelector('.status-dot');
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

    // Ensure isweep_enabled is boolean
    isweep_enabled = Boolean(isweep_enabled);
    updateUI(isweep_enabled);
    console.log('[ISweep-Popup] Initial enabled state loaded as:', isweep_enabled);

    // Toggle button
    toggleButton.addEventListener('click', async () => {
        const newState = !isweep_enabled;
        const newUserId = userIdInput.value.trim();
        const newBackendUrl = backendUrl.value.trim();
        
        // Update prefs with current UI values
        isweepPrefs.user_id = newUserId;
        isweepPrefs.backendUrl = newBackendUrl;
        
        // Save to storage
        await chrome.storage.local.set({
            isweep_enabled: newState,
            userId: newUserId,
            backendURL: newBackendUrl,
            isweepPrefs: isweepPrefs
        });
        isweep_enabled = newState;
        updateUI(newState);

        console.log('[ISweep-Popup] TOGGLED isweep_enabled:', newState);

        // Notify active tab's content script to toggle immediately
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'toggleISweep',
                    enabled: newState,
                    prefs: isweepPrefs
                }).catch((err) => {
                    console.log('[ISweep-Popup] Could not send message to active tab (expected on non-content pages):', err.message);
                });
            }
        });
    });

    // Save user ID on input change
    userIdInput.addEventListener('change', async () => {
        const newUserId = userIdInput.value.trim();
        isweepPrefs.user_id = newUserId;
        await chrome.storage.local.set({
            userId: newUserId,
            isweepPrefs: isweepPrefs
        });
        console.log('[ISweep-Popup] Updated userId to:', newUserId);
    });

    // Save backend URL on input change
    backendUrl.addEventListener('change', async () => {
        const newBackendUrl = backendUrl.value.trim();
        isweepPrefs.backendUrl = newBackendUrl;
        await chrome.storage.local.set({
            backendURL: newBackendUrl,
            isweepPrefs: isweepPrefs
        });
        console.log('[ISweep-Popup] Updated backendURL to:', newBackendUrl);
    });

    // Clear stats
    clearStatsBtn.addEventListener('click', async () => {
        await chrome.storage.local.set({
            videosDetected: 0,
            actionsApplied: 0
        });
        videosDetectedSpan.textContent = '0';
        actionsAppliedSpan.textContent = '0';
    });

    // Listen for updates from background script
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
            if (changes.videosDetected) {
                videosDetectedSpan.textContent = changes.videosDetected.newValue;
            }
            if (changes.actionsApplied) {
                actionsAppliedSpan.textContent = changes.actionsApplied.newValue;
            }
        }
    });
});

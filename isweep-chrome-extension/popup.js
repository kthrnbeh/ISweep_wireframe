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
    const { isEnabled, userId, backendURL, videosDetected, actionsApplied } = await chrome.storage.local.get([
        'isEnabled',
        'userId',
        'backendURL',
        'videosDetected',
        'actionsApplied'
    ]);

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

    updateUI(isEnabled);

    // Toggle button
    toggleButton.addEventListener('click', async () => {
        const newState = !isEnabled;
        await chrome.storage.local.set({
            isEnabled: newState,
            userId: userIdInput.value.trim(),
            backendURL: backendUrl.value.trim()
        });
        updateUI(newState);

        // Notify content scripts
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'toggleISweep',
                    enabled: newState
                }).catch(() => {
                    // Ignore errors for tabs that don't have content script
                });
            });
        });
    });

    // Save user ID on input change
    userIdInput.addEventListener('change', async () => {
        await chrome.storage.local.set({
            userId: userIdInput.value.trim()
        });
    });

    // Save backend URL on input change
    backendUrl.addEventListener('change', async () => {
        await chrome.storage.local.set({
            backendURL: backendUrl.value.trim()
        });
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

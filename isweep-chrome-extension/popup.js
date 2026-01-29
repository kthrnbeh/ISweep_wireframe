// popup.js
document.addEventListener('DOMContentLoaded', async () => {
    // Guard: Check for all required elements
    const toggleButton = document.getElementById('toggleButton');
    const asrToggle = document.getElementById('asrToggle');
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const userIdInput = document.getElementById('userIdInput');
    const backendUrlInput = document.getElementById('backendUrl');
    const backendUrlError = document.getElementById('backendUrlError');
    const clearStatsBtn = document.getElementById('clearStats');
    const videosDetectedSpan = document.getElementById('videosDetected');
    const actionsAppliedSpan = document.getElementById('actionsApplied');

    // ASR status elements
    const asrStatusSection = document.getElementById('asrStatusSection');
    const asrStatusText = document.getElementById('asrStatusText');
    const asrSendMs = document.getElementById('asrSendMs');
    const asrRttMs = document.getElementById('asrRttMs');

    // Validate all required elements exist
    const requiredElements = {
        toggleButton,
        asrToggle,
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

    // Load state from Chrome storage
    let { isweepPrefs, isweep_enabled, isweep_asr_enabled, videosDetected, actionsApplied, isweep_asr_status, isweep_asr_metrics } = await chrome.storage.local.get([
        'isweepPrefs',
        'isweep_enabled',
        'isweep_asr_enabled',
        'videosDetected',
        'actionsApplied',
        'isweep_asr_status',
        'isweep_asr_metrics'
    ]);

    console.log('[ISweep-Popup] Loaded state from storage:', { isweepPrefs, isweep_enabled, isweep_asr_enabled, videosDetected, actionsApplied });

    // Initialize isweepPrefs with defaults if not set
    isweepPrefs = isweepPrefs || {
        user_id: 'user123',
        backendUrl: 'http://127.0.0.1:8001',
        blocked_words: [],
        duration_seconds: 3,
        action: 'mute'
    };

    // Initialize other state with defaults
    isweep_enabled = Boolean(isweep_enabled);
    isweep_asr_enabled = Boolean(isweep_asr_enabled);
    videosDetected = videosDetected || 0;
    actionsApplied = actionsApplied || 0;

    // Set initial values in UI
    userIdInput.value = isweepPrefs.user_id || 'user123';
    backendUrlInput.value = isweepPrefs.backendUrl || 'http://127.0.0.1:8001';
    asrToggle.checked = isweep_asr_enabled;
    videosDetectedSpan.textContent = videosDetected;
    actionsAppliedSpan.textContent = actionsApplied;

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
    isweep_enabled = Boolean(isweep_enabled);
    updateUI(isweep_enabled);
    console.log('[ISweep-Popup] Initial enabled state:', isweep_enabled);

    // Update ASR status display
    const updateAsrStatus = (status, metrics) => {
        if (!asrStatusSection || !asrStatusText) return;

        if (asrToggle && asrToggle.checked && status) {
            asrStatusSection.style.display = 'block';
            
            // Map status to display text
            const statusMap = {
                'idle': 'Off',
                'starting': 'Connecting...',
                'streaming': 'Streaming',
                'error': 'Error',
                'stopped': 'Stopped'
            };
            
            const displayStatus = statusMap[status] || status;
            asrStatusText.textContent = displayStatus;
            
            // Update color based on status
            if (status === 'streaming') {
                asrStatusText.style.color = '#10b981';
            } else if (status === 'error') {
                asrStatusText.style.color = '#ef4444';
            } else {
                asrStatusText.style.color = '#666';
            }
            
            // Update metrics if available
            if (metrics && asrSendMs && asrRttMs) {
                asrSendMs.textContent = metrics.avg_send_ms != null ? `${metrics.avg_send_ms}ms` : '—';
                asrRttMs.textContent = metrics.avg_rtt_ms != null ? `${metrics.avg_rtt_ms}ms` : '—';
            }
        } else {
            asrStatusSection.style.display = 'none';
        }
    };

    // Initial ASR status update
    updateAsrStatus(isweep_asr_status, isweep_asr_metrics);

    // Validation function for backend URL
    const isValidBackendUrl = (url) => {
        if (!url || typeof url !== 'string') return false;
        return url.startsWith('http://') || url.startsWith('https://');
    };

    // Display or clear error message
    const showBackendUrlError = (message) => {
        if (backendUrlError) {
            backendUrlError.textContent = message;
            backendUrlError.style.display = message ? 'block' : 'none';
        }
        if (message) {
            console.warn('[ISweep-Popup] Backend URL validation error:', message);
        }
    };

    // Toggle button (guarded)
    if (toggleButton) {
        toggleButton.addEventListener('click', async () => {
            isweep_enabled = !isweep_enabled;
            isweepPrefs.user_id = userIdInput.value.trim();
            const backendUrl = backendUrlInput.value.trim();
            
            // Validate backend URL before saving
            if (!isValidBackendUrl(backendUrl)) {
                showBackendUrlError('Invalid URL: must start with http:// or https://');
                return;
            }
            
            showBackendUrlError('');
            isweepPrefs.backendUrl = backendUrl;
            
            // Save to storage (separate keys for enabled and prefs)
            await chrome.storage.local.set({
                isweep_enabled,
                isweepPrefs
            });
            updateUI(isweep_enabled);

            console.log('[ISweep-Popup] TOGGLED enabled:', isweep_enabled);

            // Notify active tab's content script to toggle immediately
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'toggleISweep',
                        enabled: isweep_enabled,
                        prefs: isweepPrefs
                    }).catch((err) => {
                        console.log('[ISweep-Popup] Could not send message to active tab (expected on non-content pages):', err.message);
                    });
                }
            });
        });
    }

    // ASR toggle handler
    if (asrToggle) {
        asrToggle.addEventListener('change', async () => {
            isweep_asr_enabled = asrToggle.checked;
            await chrome.storage.local.set({ isweep_asr_enabled });
            console.log('[ISweep-Popup] ASR toggled to:', isweep_asr_enabled);
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

    // Save backend URL on input change (guarded with validation)
    if (backendUrlInput) {
        backendUrlInput.addEventListener('change', async () => {
            const backendUrl = backendUrlInput.value.trim();
            
            // Validate backend URL
            if (!isValidBackendUrl(backendUrl)) {
                showBackendUrlError('Invalid URL: must start with http:// or https://');
                // Revert to saved value
                backendUrlInput.value = isweepPrefs.backendUrl;
                return;
            }
            
            showBackendUrlError('');
            isweepPrefs.backendUrl = backendUrl;
            await chrome.storage.local.set({ isweepPrefs });
            console.log('[ISweep-Popup] Updated backendUrl to:', isweepPrefs.backendUrl);
        });
    }

    // Clear stats (guarded)
    if (clearStatsBtn) {
        clearStatsBtn.addEventListener('click', async () => {
            videosDetected = 0;
            actionsApplied = 0;
            await chrome.storage.local.set({
                videosDetected,
                actionsApplied
            });
            if (videosDetectedSpan) videosDetectedSpan.textContent = '0';
            if (actionsAppliedSpan) actionsAppliedSpan.textContent = '0';
        });
    }

    // Listen for updates from background script or other parts of extension
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;

        // Handle isweepPrefs changes
        if (changes.isweepPrefs) {
            const updated = changes.isweepPrefs.newValue;
            if (updated) {
                isweepPrefs = updated;
                if (userIdInput) userIdInput.value = isweepPrefs.user_id || 'user123';
                if (backendUrlInput) backendUrlInput.value = isweepPrefs.backendUrl || 'http://127.0.0.1:8001';
                showBackendUrlError('');
                console.log('[ISweep-Popup] Updated from isweepPrefs:', isweepPrefs);
            }
        }

        // Handle isweep_enabled changes
        if (changes.isweep_enabled) {
            isweep_enabled = Boolean(changes.isweep_enabled.newValue);
            updateUI(isweep_enabled);
            console.log('[ISweep-Popup] Updated enabled state from isweep_enabled:', isweep_enabled);
        }

        // Handle isweep_asr_enabled changes
        if (changes.isweep_asr_enabled) {
            isweep_asr_enabled = Boolean(changes.isweep_asr_enabled.newValue);
            asrToggle.checked = isweep_asr_enabled;
            console.log('[ISweep-Popup] Updated ASR state from isweep_asr_enabled:', isweep_asr_enabled);
            updateAsrStatus(isweep_asr_status, isweep_asr_metrics);
        }

        // Handle isweep_asr_status changes
        if (changes.isweep_asr_status) {
            isweep_asr_status = changes.isweep_asr_status.newValue;
            updateAsrStatus(isweep_asr_status, isweep_asr_metrics);
            console.log('[ISweep-Popup] Updated ASR status:', isweep_asr_status);
        }

        // Handle isweep_asr_metrics changes
        if (changes.isweep_asr_metrics) {
            isweep_asr_metrics = changes.isweep_asr_metrics.newValue;
            updateAsrStatus(isweep_asr_status, isweep_asr_metrics);
            console.log('[ISweep-Popup] Updated ASR metrics:', isweep_asr_metrics);
        }

        // Handle videosDetected changes
        if (changes.videosDetected && videosDetectedSpan) {
            videosDetected = changes.videosDetected.newValue;
            videosDetectedSpan.textContent = videosDetected || 0;
            console.log('[ISweep-Popup] Updated videosDetected:', videosDetected);
        }

        // Handle actionsApplied changes
        if (changes.actionsApplied && actionsAppliedSpan) {
            actionsApplied = changes.actionsApplied.newValue;
            actionsAppliedSpan.textContent = actionsApplied || 0;
            console.log('[ISweep-Popup] Updated actionsApplied:', actionsApplied);
        }
    });
});

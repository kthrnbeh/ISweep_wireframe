// options.js
document.addEventListener('DOMContentLoaded', async () => {
    const categories = ['language', 'sexual', 'violence'];
    const statusMessage = document.getElementById('statusMessage');

    // Load saved preferences
    async function loadPreferences() {
        const { preferences } = await chrome.storage.local.get(['preferences']) || {};
        
        if (preferences) {
            for (const category of categories) {
                const pref = preferences[category];
                if (pref) {
                    document.getElementById(`${category}Enabled`).checked = pref.enabled;
                    document.getElementById(`${category}Action`).value = pref.action;
                    document.getElementById(`${category}Duration`).value = pref.duration_seconds;
                    document.getElementById(`${category}Words`).value = pref.blocked_words.join(', ');
                }
            }
        }
    }

    // Save preferences
    async function savePreferences() {
        const preferences = {};
        
        for (const category of categories) {
            const enabled = document.getElementById(`${category}Enabled`).checked;
            const action = document.getElementById(`${category}Action`).value;
            const duration = parseInt(document.getElementById(`${category}Duration`).value) || 0;
            const wordsText = document.getElementById(`${category}Words`).value;
            
            // Parse comma-separated words
            const blockedWords = wordsText
                .split(',')
                .map(w => w.trim())
                .filter(w => w.length > 0);

            preferences[category] = {
                category,
                enabled,
                action,
                duration_seconds: duration,
                blocked_words: blockedWords
            };
        }

        // Save to Chrome storage
        await chrome.storage.local.set({ preferences });

        // Also send to backend for each category
        const userId = (await chrome.storage.local.get(['userId'])).userId || 'user123';
        const backendURL = (await chrome.storage.local.get(['backendURL'])).backendURL || 'http://127.0.0.1:8001';

        for (const category of categories) {
            const pref = preferences[category];
            try {
                const response = await fetch(`${backendURL}/preferences`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        user_id: userId,
                        ...pref
                    })
                });

                if (!response.ok) {
                    throw new Error(`Backend error: ${response.status}`);
                }
            } catch (error) {
                console.warn(`[ISweep] Failed to save ${category} to backend:`, error);
            }
        }

        // Show success message
        showStatus('✓ Settings saved successfully!', 'success');
    }

    // Reset to defaults
    async function resetDefaults() {
        const defaults = {
            language: {
                enabled: true,
                action: 'mute',
                duration_seconds: 4,
                blocked_words: []
            },
            sexual: {
                enabled: true,
                action: 'skip',
                duration_seconds: 30,
                blocked_words: []
            },
            violence: {
                enabled: true,
                action: 'fast_forward',
                duration_seconds: 10,
                blocked_words: []
            }
        };

        for (const category of categories) {
            const pref = defaults[category];
            document.getElementById(`${category}Enabled`).checked = pref.enabled;
            document.getElementById(`${category}Action`).value = pref.action;
            document.getElementById(`${category}Duration`).value = pref.duration_seconds;
            document.getElementById(`${category}Words`).value = '';
        }

        await savePreferences();
        showStatus('✓ Reset to default settings', 'success');
    }

    // Show status message
    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status-message ${type}`;
        statusMessage.style.display = 'block';

        // Hide after 3 seconds
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 3000);
    }

    // Event listeners
    document.getElementById('saveButton').addEventListener('click', savePreferences);
    document.getElementById('resetButton').addEventListener('click', () => {
        if (confirm('Reset all settings to defaults?')) {
            resetDefaults();
        }
    });

    // Initial load
    loadPreferences();
});

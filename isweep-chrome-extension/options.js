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
        // options.js
        // Stores:
        // - selectedPacks: { language: { profanity: true, blasphemy: false, ... } }
        // - customWordsByCategory: { language: ["word1", "phrase two"] }
        // - durationSecondsByCategory: { language: 1.5 }
        // - actionByCategory: { language: "mute" }

        document.addEventListener('DOMContentLoaded', async () => {
            const statusMessage = document.getElementById('statusMessage');
            const presetRows = Array.from(document.querySelectorAll('.preset-row'));
            const customList = document.querySelector('.custom-list');
            const addCustomBtn = document.getElementById('addCustom');
            const customInput = document.getElementById('customWord');
            const actionSelect = document.getElementById('langAction');
            const durationInput = document.getElementById('langDuration');

            const DEFAULT_SELECTED = {
                language: {
                    strong_profanity: true,
                    mild_language: false,
                    blasphemy: false
                }
            };

            const DEFAULT_CUSTOM = { language: [] };
            const DEFAULT_DURATION = { language: 4 };
            const DEFAULT_ACTION = { language: 'mute' };

            let selectedPacks = { ...DEFAULT_SELECTED };
            let customWordsByCategory = { ...DEFAULT_CUSTOM };
            let durationSecondsByCategory = { ...DEFAULT_DURATION };
            let actionByCategory = { ...DEFAULT_ACTION };

            function slugify(name) {
                return (name || '')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/^_+|_+$/g, '');
            }

            function normalizeWord(word) {
                return (word || '')
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            function log(msg, data) {
                console.log('[ISweep-Options]', msg, data ?? '');
            }

            async function loadState() {
                const stored = await chrome.storage.local.get([
                    'selectedPacks',
                    'customWordsByCategory',
                    'durationSecondsByCategory',
                    'actionByCategory'
                ]);

                selectedPacks = stored.selectedPacks || { ...DEFAULT_SELECTED };
                customWordsByCategory = stored.customWordsByCategory || { ...DEFAULT_CUSTOM };
                durationSecondsByCategory = stored.durationSecondsByCategory || { ...DEFAULT_DURATION };
                actionByCategory = stored.actionByCategory || { ...DEFAULT_ACTION };

                render();
            }

            function render() {
                const langSelected = selectedPacks.language || {};
                presetRows.forEach(row => {
                    const nameEl = row.querySelector('.preset-name');
                    const cb = row.querySelector('input[type="checkbox"]');
                    if (!nameEl || !cb) return;
                    const slug = slugify(nameEl.textContent);
                    cb.checked = Boolean(langSelected[slug]);
                    cb.onchange = () => {
                        selectedPacks.language = selectedPacks.language || {};
                        selectedPacks.language[slug] = cb.checked;
                        chrome.storage.local.set({ selectedPacks });
                        log('selectedPacks updated:', selectedPacks);
                    };
                });

                // Action & duration
                const langAction = actionByCategory.language ?? DEFAULT_ACTION.language;
                const langDuration = durationSecondsByCategory.language ?? DEFAULT_DURATION.language;
                actionSelect.value = langAction;
                durationInput.value = langDuration;

                // Custom words list
                const words = customWordsByCategory.language || [];
                renderCustom(words);
            }

            function renderCustom(words) {
                customList.innerHTML = '';
                words.forEach(w => {
                    const li = document.createElement('li');
                    li.textContent = w;
                    const btn = document.createElement('button');
                    btn.className = 'remove-btn';
                    btn.setAttribute('aria-label', 'Remove');
                    btn.textContent = '×';
                    btn.onclick = () => removeCustomWord(w);
                    li.appendChild(btn);
                    customList.appendChild(li);
                });
            }

            function removeCustomWord(word) {
                const words = customWordsByCategory.language || [];
                const updated = words.filter(w => w !== word);
                customWordsByCategory.language = updated;
                chrome.storage.local.set({ customWordsByCategory });
                renderCustom(updated);
                log('customWords updated:', customWordsByCategory);
            }

            function addCustomWord() {
                const normalized = normalizeWord(customInput.value);
                if (!normalized) return;
                const current = customWordsByCategory.language || [];
                if (current.includes(normalized)) {
                    customInput.value = '';
                    return;
                }
                const updated = [...current, normalized];
                customWordsByCategory.language = updated;
                chrome.storage.local.set({ customWordsByCategory });
                renderCustom(updated);
                customInput.value = '';
                log('customWords updated:', customWordsByCategory);
            }

            addCustomBtn.addEventListener('click', (e) => {
                e.preventDefault();
                addCustomWord();
            });

            customInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomWord();
                }
            });

            actionSelect.addEventListener('change', () => {
                actionByCategory.language = actionSelect.value;
                chrome.storage.local.set({ actionByCategory });
                log('actionByCategory updated:', actionByCategory);
            });

            durationInput.addEventListener('change', () => {
                const val = parseFloat(durationInput.value);
                const safeVal = Number.isFinite(val) ? Math.max(0, val) : DEFAULT_DURATION.language;
                durationSecondsByCategory.language = safeVal;
                chrome.storage.local.set({ durationSecondsByCategory });
                render();
                log('durationSecondsByCategory updated:', durationSecondsByCategory);
            });

            function showStatus(message, type = 'info') {
                statusMessage.textContent = message;
                statusMessage.className = `status-message ${type}`;
                statusMessage.style.display = 'block';
                setTimeout(() => {
                    statusMessage.style.display = 'none';
                }, 1600);
            }

            // Buttons reuse status feedback
            document.getElementById('saveButton').addEventListener('click', () => {
                showStatus('Settings saved', 'success');
            });
            document.getElementById('resetButton').addEventListener('click', async () => {
                selectedPacks = { ...DEFAULT_SELECTED };
                customWordsByCategory = { ...DEFAULT_CUSTOM };
                durationSecondsByCategory = { ...DEFAULT_DURATION };
                actionByCategory = { ...DEFAULT_ACTION };
                await chrome.storage.local.set({
                    selectedPacks,
                    customWordsByCategory,
                    durationSecondsByCategory,
                    actionByCategory
                });
                render();
                showStatus('Defaults restored', 'info');
            });

            loadState();
        });

import { PRESET_PACKS, getPackWords, mergeWords } from './preset-packs.js';

document.addEventListener('DOMContentLoaded', async () => {
    const statusMessage = document.getElementById('statusMessage');
    const presetRows = Array.from(document.querySelectorAll('.preset-row'));
    const customList = document.querySelector('.custom-list');
    const addCustomBtn = document.getElementById('addCustom');
    const customInput = document.getElementById('customWord');
    const actionSelect = document.getElementById('langAction');
    const durationInput = document.getElementById('langDuration');
    const saveBtn = document.getElementById('saveButton');
    const effectiveCount = document.getElementById('effectiveCount');
    const effectivePreview = document.getElementById('effectivePreview');
    const lastSavedTime = document.getElementById('lastSavedTime');

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

    async function fetchPreferencesFromBackend() {
        try {
            const userId = (await chrome.storage.local.get(['userId'])).userId || 'user123';
            const backendURL = (await chrome.storage.local.get(['backendURL'])).backendURL || 'http://127.0.0.1:8001';

            const res = await fetch(`${backendURL}/preferences/${userId}`);
            if (!res.ok) {
                log('Backend fetch failed, using local storage');
                return false;
            }

            const data = await res.json();
            log('Backend preferences fetched:', data);

            // Parse backend response: { user_id, preferences: { category: {...}, ... } }
            const prefs = data.preferences || {};

            // Hydrate state from backend
            const categories = ['language', 'violence', 'sexual'];
            categories.forEach(category => {
                const categoryPref = prefs[category];
                if (!categoryPref) return;

                // Set action
                if (categoryPref.action) {
                    actionByCategory[category] = categoryPref.action;
                }

                // Set duration
                if (typeof categoryPref.duration_seconds === 'number') {
                    durationSecondsByCategory[category] = categoryPref.duration_seconds;
                }

                // Set custom words from backend blocked_words
                if (Array.isArray(categoryPref.blocked_words)) {
                    customWordsByCategory[category] = categoryPref.blocked_words;
                }
            });

            // Save hydrated state to local storage
            await chrome.storage.local.set({
                actionByCategory,
                durationSecondsByCategory,
                customWordsByCategory
            });

            log('State hydrated from backend:', {
                actionByCategory,
                durationSecondsByCategory,
                customWordsByCategory
            });

            return true;
        } catch (error) {
            log('Error fetching from backend:', error);
            return false;
        }
    }

    async function loadState() {
        // First, load from local storage
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

        // Then, fetch from backend and override with server state
        await fetchPreferencesFromBackend();

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

        const langAction = actionByCategory.language ?? DEFAULT_ACTION.language;
        const langDuration = durationSecondsByCategory.language ?? DEFAULT_DURATION.language;
        actionSelect.value = langAction;
        durationInput.value = langDuration;

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
        log('customWord removed', word);
    }

    function addCustomWord() {
        const normalized = normalizeWord(customInput.value);
        if (!normalized) return;
        if (normalized.length < 2 || normalized.length > 40) {
            showStatus('Word must be 2-40 characters', 'error');
            return;
        }
        const current = customWordsByCategory.language || [];
        if (current.includes(normalized)) {
            showStatus('Already added', 'info');
            customInput.value = '';
            return;
        }
        const updated = [...current, normalized];
        customWordsByCategory.language = updated;
        chrome.storage.local.set({ customWordsByCategory });
        renderCustom(updated);
        customInput.value = '';
        log('customWord added', normalized);
    }

    function buildEffectiveBlockedWords(category) {
        const packs = selectedPacks[category] || {};
        const custom = customWordsByCategory[category] || [];
        const presetWords = [];
        Object.entries(packs).forEach(([sub, enabled]) => {
            if (!enabled) return;
            const words = getPackWords(category, sub) || [];
            presetWords.push(...words);
        });
        // Merge preset words with custom words (backend words are in customWordsByCategory)
        return mergeWords(presetWords, custom);
    }

    async function saveToBackend() {
        const userId = (await chrome.storage.local.get(['userId'])).userId || 'user123';
        const backendURL = (await chrome.storage.local.get(['backendURL'])).backendURL || 'http://127.0.0.1:8001';

        // Build preferences object for all categories
        const categories = ['language', 'violence', 'sexual']; // All supported categories
        const preferences = {};

        categories.forEach(category => {
            const effectiveWords = buildEffectiveBlockedWords(category);
            const duration = durationSecondsByCategory[category] ?? (category === 'language' ? 4 : category === 'violence' ? 10 : 30);
            const action = actionByCategory[category] ?? (category === 'language' ? 'mute' : category === 'violence' ? 'fast_forward' : 'skip');
            
            preferences[category] = {
                enabled: true,
                action: action,
                duration_seconds: duration,
                blocked_words: effectiveWords
            };
        });

        const payload = {
            user_id: userId,
            preferences: preferences
        };

        log('Bulk save payload:', payload);

        try {
            const res = await fetch(`${backendURL}/preferences/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Backend error ${res.status}: ${errorText}`);
            }
            const result = await res.json();
            log('Bulk save response:', result);
            
            // Update local storage to match what was saved to backend
            await chrome.storage.local.set({
                actionByCategory,
                durationSecondsByCategory,
                customWordsByCategory
            });
            
            // Update summary with language category words for display
            const langWords = preferences.language.blocked_words;
            updateSummary(langWords);
            showStatus(`Saved ${result.categories_saved?.length || 0} categories`, 'success');
        } catch (err) {
            console.warn('[ISweep-Options] Failed to save to backend', err);
            showStatus('Save failed', 'error');
        }
    }

    function updateSummary(effectiveWords) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString();

        effectiveCount.textContent = effectiveWords.length;

        effectivePreview.innerHTML = '';
        effectiveWords.slice(0, 10).forEach(word => {
            const tag = document.createElement('span');
            tag.className = 'preview-tag';
            tag.textContent = word;
            effectivePreview.appendChild(tag);
        });

        lastSavedTime.textContent = timeStr;
        log('Summary updated:', { count: effectiveWords.length, time: timeStr });
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

    saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        saveToBackend();
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

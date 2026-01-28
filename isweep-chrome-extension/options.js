import { PRESET_PACKS, getPackWords, mergeWords } from './preset-packs.js';

document.addEventListener('DOMContentLoaded', async () => {
    const statusMessage = document.getElementById('statusMessage');
    const saveBtn = document.getElementById('saveButton');
    const resetBtn = document.getElementById('resetButton');
    const effectiveCount = document.getElementById('effectiveCount');
    const effectivePreview = document.getElementById('effectivePreview');
    const lastSavedTime = document.getElementById('lastSavedTime');

    let currentCategory = 'language';

    const DEFAULT_SELECTED = {
        language: { strong_profanity: true, mild_language: false, blasphemy: false },
        violence: {},
        sexual: {}
    };

    const DEFAULT_CUSTOM = {
        language: [],
        violence: [],
        sexual: []
    };

    const DEFAULT_DURATION = {
        language: 0.5,
        violence: 10,
        sexual: 30
    };

    const DEFAULT_ACTION = {
        language: 'mute',
        violence: 'fast_forward',
        sexual: 'skip'
    };

    const DEFAULT_CAPTION_OFFSET = {
        language: 300,
        violence: 300,
        sexual: 300
    };

    let selectedPacks = { ...DEFAULT_SELECTED };
    let customWordsByCategory = { ...DEFAULT_CUSTOM };
    let durationSecondsByCategory = { ...DEFAULT_DURATION };
    let actionByCategory = { ...DEFAULT_ACTION };
    let captionOffsetByCategory = { ...DEFAULT_CAPTION_OFFSET };

    function log(msg, data) {
        console.log('[ISweep-Options]', msg, data ?? '');
    }

    function slugify(name) {
        return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }

    function normalizeWord(word) {
        return (word || '').toLowerCase().replace(/\s+/g, ' ').trim();
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

            const prefs = data.preferences || {};
            const categories = ['language', 'violence', 'sexual'];

            categories.forEach(category => {
                const categoryPref = prefs[category];
                if (!categoryPref) return;

                if (categoryPref.action) actionByCategory[category] = categoryPref.action;
                if (typeof categoryPref.duration_seconds === 'number') durationSecondsByCategory[category] = categoryPref.duration_seconds;
                if (typeof categoryPref.caption_offset_ms === 'number') captionOffsetByCategory[category] = categoryPref.caption_offset_ms;
                if (categoryPref.selected_packs && typeof categoryPref.selected_packs === 'object') {
                    if (!selectedPacks[category]) selectedPacks[category] = {};
                    selectedPacks[category] = categoryPref.selected_packs;
                }
                if (Array.isArray(categoryPref.custom_words)) customWordsByCategory[category] = categoryPref.custom_words;
            });

            await chrome.storage.local.set({ selectedPacks, actionByCategory, durationSecondsByCategory, customWordsByCategory, captionOffsetByCategory });
            log('State hydrated from backend');
            return true;
        } catch (error) {
            log('Error fetching from backend:', error);
            return false;
        }
    }

    async function loadState() {
        const stored = await chrome.storage.local.get(['selectedPacks', 'customWordsByCategory', 'durationSecondsByCategory', 'actionByCategory', 'captionOffsetByCategory']);
        selectedPacks = stored.selectedPacks || { ...DEFAULT_SELECTED };
        customWordsByCategory = stored.customWordsByCategory || { ...DEFAULT_CUSTOM };
        durationSecondsByCategory = stored.durationSecondsByCategory || { ...DEFAULT_DURATION };
        actionByCategory = stored.actionByCategory || { ...DEFAULT_ACTION };
        captionOffsetByCategory = stored.captionOffsetByCategory || { ...DEFAULT_CAPTION_OFFSET };

        await fetchPreferencesFromBackend();
        render();
    }

    function switchCategory(category) {
        currentCategory = category;
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });
        document.querySelectorAll('.category-panel').forEach(panel => {
            panel.style.display = panel.id === `panel-${category}` ? 'block' : 'none';
        });
        render();
    }

    function render() {
        renderLanguagePresets();
        renderCategoryControls('language');
        renderCategoryControls('violence');
        renderCategoryControls('sexual');
        renderCustomWords('language');
        renderCustomWords('violence');
        renderCustomWords('sexual');
    }

    function renderLanguagePresets() {
        const presetList = document.getElementById('langPresets');
        if (!presetList) return;

        const langSelected = selectedPacks.language || {};
        const presetRows = presetList.querySelectorAll('.preset-row');

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
    }

    function renderCategoryControls(category) {
        const actionSelect = document.getElementById(`${category}Action`);
        const durationInput = document.getElementById(`${category}Duration`);
        const captionOffsetInput = document.getElementById(`${category}CaptionOffset`);

        if (actionSelect) {
            actionSelect.value = actionByCategory[category] ?? DEFAULT_ACTION[category];
            actionSelect.onchange = () => {
                actionByCategory[category] = actionSelect.value;
                chrome.storage.local.set({ actionByCategory });
                log(`${category} action updated:`, actionByCategory[category]);
            };
        }

        if (durationInput) {
            durationInput.value = durationSecondsByCategory[category] ?? DEFAULT_DURATION[category];
            durationInput.onchange = () => {
                const val = parseFloat(durationInput.value);
                const safeVal = Number.isFinite(val) ? Math.max(0, val) : DEFAULT_DURATION[category];
                durationSecondsByCategory[category] = safeVal;
                chrome.storage.local.set({ durationSecondsByCategory });
                log(`${category} duration updated:`, durationSecondsByCategory[category]);
            };
        }

        if (captionOffsetInput) {
            captionOffsetInput.value = captionOffsetByCategory[category] ?? DEFAULT_CAPTION_OFFSET[category];
            captionOffsetInput.onchange = () => {
                const val = parseInt(captionOffsetInput.value, 10);
                const safeVal = Number.isFinite(val) ? Math.max(0, Math.min(2000, val)) : DEFAULT_CAPTION_OFFSET[category];
                captionOffsetByCategory[category] = safeVal;
                chrome.storage.local.set({ captionOffsetByCategory });
                log(`${category} caption_offset_ms updated:`, captionOffsetByCategory[category]);
            };
        }
    }

    function renderCustomWords(category) {
        const customList = document.getElementById(`${category}CustomList`);
        if (!customList) return;

        const words = customWordsByCategory[category] || [];
        customList.innerHTML = '';

        words.forEach(w => {
            const li = document.createElement('li');
            li.textContent = w;
            const btn = document.createElement('button');
            btn.className = 'remove-btn';
            btn.setAttribute('aria-label', 'Remove');
            btn.textContent = '×';
            btn.onclick = () => removeCustomWord(category, w);
            li.appendChild(btn);
            customList.appendChild(li);
        });
    }

    function removeCustomWord(category, word) {
        const words = customWordsByCategory[category] || [];
        const updated = words.filter(w => w !== word);
        customWordsByCategory[category] = updated;
        chrome.storage.local.set({ customWordsByCategory });
        renderCustomWords(category);
        log(`Custom word removed from ${category}:`, word);
    }

    function addCustomWord(category) {
        const input = document.getElementById(`${category}CustomInput`);
        if (!input) return;

        // Parse input: split on commas/newlines, trim, lowercase, remove empties
        const words = input.value
            .split(/[,\n]/)
            .map(w => (w || '').trim().toLowerCase())
            .filter(w => w.length > 0)
            .map(w => w.replace(/\s+/g, ' ')) // Collapse multiple spaces
            .filter((w, i, arr) => arr.indexOf(w) === i); // Dedupe

        if (words.length === 0) {
            showStatus('Please enter at least one word', 'error');
            return;
        }

        const current = customWordsByCategory[category] || [];
        const newWords = words.filter(w => {
            if (w.length < 2 || w.length > 40) {
                showStatus(`Word must be 2-40 characters: "${w}"`, 'error');
                return false;
            }
            if (current.includes(w)) {
                showStatus(`Already added: "${w}"`, 'info');
                return false;
            }
            return true;
        });

        if (newWords.length === 0) {
            input.value = '';
            return;
        }

        const updated = [...current, ...newWords];
        customWordsByCategory[category] = updated;
        chrome.storage.local.set({ customWordsByCategory });
        renderCustomWords(category);
        input.value = '';
        log(`Added ${newWords.length} word(s) to ${category}:`, newWords);
        showStatus(`Added ${newWords.length} word(s)`, 'success');
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

        return mergeWords(presetWords, custom);
    }

    async function saveToBackend() {
        const userId = (await chrome.storage.local.get(['userId'])).userId || 'user123';
        const backendURL = (await chrome.storage.local.get(['backendURL'])).backendURL || 'http://127.0.0.1:8001';

        const categories = ['language', 'violence', 'sexual'];
        const preferences = {};

        log(`[saveToBackend] Starting save for userId: ${userId}`);

        categories.forEach(category => {
            const effectiveWords = buildEffectiveBlockedWords(category);
            const duration = durationSecondsByCategory[category] ?? DEFAULT_DURATION[category];
            const action = actionByCategory[category] ?? DEFAULT_ACTION[category];
            const captionOffset = captionOffsetByCategory[category] ?? DEFAULT_CAPTION_OFFSET[category];
            const packs = selectedPacks[category] || {};
            const customWords = customWordsByCategory[category] || [];

            log(`[saveToBackend] ${category}: ${effectiveWords.length} blocked words, action="${action}", duration=${duration}s, caption_offset=${captionOffset}ms`);
            log(`[saveToBackend] ${category} blocked words:`, effectiveWords);

            preferences[category] = {
                enabled: true,
                action: action,
                duration_seconds: duration,
                caption_offset_ms: captionOffset,
                blocked_words: effectiveWords,
                selected_packs: packs,
                custom_words: customWords
            };
        });

        const payload = { user_id: userId, preferences: preferences };
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

            await chrome.storage.local.set({ selectedPacks, actionByCategory, durationSecondsByCategory, customWordsByCategory });

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

    function showStatus(message, type = 'info') {
        statusMessage.textContent = message;
        statusMessage.className = `status-message ${type}`;
        statusMessage.style.display = 'block';
        setTimeout(() => { statusMessage.style.display = 'none'; }, 1600);
    }

    // Category tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchCategory(btn.dataset.category));
    });

    // Custom word add buttons
    document.querySelectorAll('.custom-input-row button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const category = btn.dataset.category;
            if (category) addCustomWord(category);
        });
    });

    // Enter key to add custom words
    ['language', 'violence', 'sexual'].forEach(category => {
        const input = document.getElementById(`${category}CustomInput`);
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomWord(category);
                }
            });
        }
    });

    saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        saveToBackend();
    });

    resetBtn.addEventListener('click', async () => {
        selectedPacks = { ...DEFAULT_SELECTED };
        customWordsByCategory = { ...DEFAULT_CUSTOM };
        durationSecondsByCategory = { ...DEFAULT_DURATION };
        actionByCategory = { ...DEFAULT_ACTION };
        await chrome.storage.local.set({ selectedPacks, customWordsByCategory, durationSecondsByCategory, actionByCategory });
        render();
        showStatus('Defaults restored', 'info');
    });

    loadState();
});

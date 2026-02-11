// popup.js — shared for popup and options
document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('[data-settings-root]');
    if (!root || !chrome?.storage) return;

    const storage = chrome.storage.sync || chrome.storage.local;

    const DEFAULT_PREFS = {
        enabled: true,
        filters: {
            profanity: true,
            sexual: true,
            violence: false,
            horror: false,
            crude: false
        },
        actions: {
            profanity: 'mute',
            sexual: 'skip',
            violence: 'skip'
        },
        sensitivity: 2,
        notifications: {
            email: true,
            inapp: true,
            none: false
        },
        parental: {
            pin: '',
            requirePin: true
        }
    };

    const els = {
        filtersForm: document.getElementById('contentFiltersForm'),
        actionsForm: document.getElementById('filterActionsForm'),
        sensitivityForm: document.getElementById('sensitivityForm'),
        notificationsForm: document.getElementById('notificationsForm'),
        parentalForm: document.getElementById('parentalForm'),
        filterChecks: {
            profanity: document.getElementById('filter-profanity'),
            sexual: document.getElementById('filter-sexual'),
            violence: document.getElementById('filter-violence'),
            horror: document.getElementById('filter-horror'),
            crude: document.getElementById('filter-crude')
        },
        actionSelects: {
            profanity: document.getElementById('action-profanity'),
            sexual: document.getElementById('action-sexual'),
            violence: document.getElementById('action-violence')
        },
        sensitivity: document.getElementById('sensitivity'),
        sensitivityValue: document.getElementById('sensitivityValue'),
        notifyEmail: document.getElementById('notify-email'),
        notifyInapp: document.getElementById('notify-inapp'),
        notifyNone: document.getElementById('notify-none'),
        parentPin: document.getElementById('parent-pin'),
        requirePin: document.getElementById('require-pin'),
        saveStatus: document.getElementById('saveStatus'),
        openFullSettings: document.getElementById('openFullSettings'),
        openSidebar: document.getElementById('openSidebar'),
        testMute: document.getElementById('testMute')
    };

    const normalizeAction = (raw) => {
        const value = String(raw || '').toLowerCase().trim();
        if (value.includes('mute')) return 'mute';
        if (value.includes('skip') || value.includes('fast')) return 'skip';
        return 'none';
    };

    const uiValueForAction = (normalized) => {
        if (normalized === 'mute') return 'mute';
        if (normalized === 'skip') return 'skip';
        return 'log-only';
    };

    let prefs = null;
    let saveTimeout = null;

    const showSaved = (message = 'Saved') => {
        if (!els.saveStatus) return;
        els.saveStatus.textContent = message;
    };

    const safeSet = async (next) => {
        prefs = next;
        try {
            await storage.set({ isweepPrefs: prefs });
            showSaved('Saved');
            chrome.runtime.sendMessage({ type: 'PREFS_UPDATED' }).catch(() => {});
        } catch (err) {
            console.warn('[ISweep] Failed to save prefs', err);
            showSaved('Save failed');
        }
    };

    const collectPrefs = () => {
        const filters = {
            profanity: Boolean(els.filterChecks.profanity?.checked),
            sexual: Boolean(els.filterChecks.sexual?.checked),
            violence: Boolean(els.filterChecks.violence?.checked),
            horror: Boolean(els.filterChecks.horror?.checked),
            crude: Boolean(els.filterChecks.crude?.checked)
        };

        const actions = {
            profanity: normalizeAction(els.actionSelects.profanity?.value || DEFAULT_PREFS.actions.profanity),
            sexual: normalizeAction(els.actionSelects.sexual?.value || DEFAULT_PREFS.actions.sexual),
            violence: normalizeAction(els.actionSelects.violence?.value || DEFAULT_PREFS.actions.violence)
        };

        const notifications = {
            email: Boolean(els.notifyEmail?.checked),
            inapp: Boolean(els.notifyInapp?.checked),
            none: Boolean(els.notifyNone?.checked)
        };

        const parental = {
            pin: els.parentPin?.value || '',
            requirePin: Boolean(els.requirePin?.checked)
        };

        const sensitivity = Number(els.sensitivity?.value || DEFAULT_PREFS.sensitivity);

        return {
            enabled: prefs?.enabled !== false, // preserve enabled unless explicitly off
            filters,
            categories: { ...filters },
            actions,
            sensitivity,
            notifications,
            parental
        };
    };

    const applyPrefs = (p) => {
        const next = { ...DEFAULT_PREFS, ...p };
        next.filters = { ...DEFAULT_PREFS.filters, ...(p?.filters || {}) };
        next.actions = { ...DEFAULT_PREFS.actions, ...(p?.actions || {}) };
        next.notifications = { ...DEFAULT_PREFS.notifications, ...(p?.notifications || {}) };
        next.parental = { ...DEFAULT_PREFS.parental, ...(p?.parental || {}) };

        prefs = next;

        Object.entries(next.filters).forEach(([key, value]) => {
            const box = els.filterChecks[key];
            if (box) box.checked = Boolean(value);
        });

        Object.entries(next.actions).forEach(([key, value]) => {
            const sel = els.actionSelects[key];
            if (sel) sel.value = uiValueForAction(normalizeAction(value));
        });

        if (els.sensitivity) {
            els.sensitivity.value = String(next.sensitivity);
        }
        if (els.sensitivityValue) {
            els.sensitivityValue.textContent = String(next.sensitivity);
        }

        if (els.notifyEmail) els.notifyEmail.checked = Boolean(next.notifications.email);
        if (els.notifyInapp) els.notifyInapp.checked = Boolean(next.notifications.inapp);
        if (els.notifyNone) els.notifyNone.checked = Boolean(next.notifications.none);

        if (els.parentPin) els.parentPin.value = next.parental.pin || '';
        if (els.requirePin) els.requirePin.checked = Boolean(next.parental.requirePin);
    };

    const autoSave = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => safeSet(collectPrefs()), 150);
    };

    const handleNotifyToggle = () => {
        if (els.notifyNone?.checked) {
            if (els.notifyEmail) els.notifyEmail.checked = false;
            if (els.notifyInapp) els.notifyInapp.checked = false;
        } else {
            if (els.notifyNone) els.notifyNone.checked = false;
        }
        autoSave();
    };

    const addListeners = () => {
        [els.filtersForm, els.actionsForm, els.sensitivityForm, els.notificationsForm, els.parentalForm].forEach((form) => {
            form?.addEventListener('submit', (e) => {
                e.preventDefault();
                autoSave();
            });
        });

        Object.values(els.filterChecks).forEach((box) => box?.addEventListener('change', autoSave));
        Object.values(els.actionSelects).forEach((sel) => sel?.addEventListener('change', autoSave));

        if (els.sensitivity) {
            els.sensitivity.addEventListener('input', () => {
                if (els.sensitivityValue) els.sensitivityValue.textContent = String(els.sensitivity.value);
            });
            els.sensitivity.addEventListener('change', autoSave);
        }

        if (els.notifyEmail) els.notifyEmail.addEventListener('change', handleNotifyToggle);
        if (els.notifyInapp) els.notifyInapp.addEventListener('change', handleNotifyToggle);
        if (els.notifyNone) els.notifyNone.addEventListener('change', handleNotifyToggle);

        if (els.parentPin) els.parentPin.addEventListener('change', autoSave);
        if (els.requirePin) els.requirePin.addEventListener('change', autoSave);

        if (els.openFullSettings) {
            els.openFullSettings.addEventListener('click', () => {
                chrome.runtime.openOptionsPage().catch(() => {
                    const url = chrome.runtime.getURL('options.html');
                    chrome.tabs.create({ url, active: true });
                }).finally(() => window.close());
            });
        }

        if (els.openSidebar) {
            els.openSidebar.addEventListener('click', async () => {
                try {
                    if (chrome.sidePanel?.open) {
                        const win = await chrome.windows.getCurrent();
                        await chrome.sidePanel.open({ windowId: win?.id });
                        window.close();
                        return;
                    }
                } catch (err) {
                    console.warn('[ISweep] Side panel open failed, falling back', err);
                }

                chrome.runtime.openOptionsPage().catch(() => {
                    const url = chrome.runtime.getURL('options.html');
                    chrome.tabs.create({ url, active: true });
                }).finally(() => window.close());
            });
        }

        if (els.testMute) {
            els.testMute.addEventListener('click', () => {
                chrome.runtime.sendMessage({ type: 'TEST_MUTE' }).catch(() => {});
            });
        }
    };

    const init = async () => {
        try {
            const stored = await storage.get('isweepPrefs');
            applyPrefs(stored?.isweepPrefs || DEFAULT_PREFS);
            showSaved('Changes save automatically.');
        } catch (err) {
            console.warn('[ISweep] Failed to load prefs', err);
            applyPrefs(DEFAULT_PREFS);
            showSaved('Loaded defaults');
        }

        addListeners();

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== (storage === chrome.storage.sync ? 'sync' : 'local')) return;
            if (changes.isweepPrefs?.newValue) {
                applyPrefs(changes.isweepPrefs.newValue);
                showSaved('Updated');
            }
        });
    };

    init();
});

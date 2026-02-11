// plumbing.js - lightweight prefs->mute pipeline
(() => {
    const DEBUG = false;
    const PREFS_KEY = 'isweepPrefs';
    const MSG_APPLY = 'APPLY_PREFS';

    let currentPrefs = null;
    let warnedUnknown = false;

    const log = (...args) => { if (DEBUG) console.log('[ISweep-plumb]', ...args); };

    const getVideos = () => Array.from(document.querySelectorAll('video'));

    const normalizeAction = (raw) => {
        const value = String(raw || '').toLowerCase().trim();
        if (value.includes('mute')) return 'mute';
        if (value.includes('skip') || value.includes('fast')) return 'skip';
        if (!warnedUnknown) {
            console.warn('[ISweep-plumb] Unknown action, defaulting to none:', raw);
            warnedUnknown = true;
        }
        return 'none';
    };

    const applyPrefs = (prefs) => {
        currentPrefs = prefs;
        const enabled = prefs?.enabled !== false;
        const categories = prefs?.categories || prefs?.filters || { profanity: true };
        const act = normalizeAction(prefs?.actions?.profanity);
        const doMute = enabled && categories.profanity !== false && act === 'mute';
        log('applyPrefs', { enabled, doMute });
        getVideos().forEach(v => {
            if (!(v instanceof HTMLVideoElement)) return;
            if (doMute) {
                v.muted = true;
                v.volume = 0;
            } else {
                v.muted = false;
            }
        });
    };

    const loadPrefs = async () => {
        try {
            const data = await chrome.storage.sync.get(PREFS_KEY).catch(() => chrome.storage.local.get(PREFS_KEY));
            const prefs = data?.[PREFS_KEY];
            if (prefs) applyPrefs(prefs);
        } catch (err) {
            log('loadPrefs error', err);
        }
    };

    const handleMessage = (message, sender, sendResponse) => {
        if (message?.type === MSG_APPLY && message.prefs) {
            applyPrefs(message.prefs);
            sendResponse?.({ ok: true });
        } else if (message?.type === 'TEST_MUTE') {
            applyPrefs(currentPrefs || {});
            sendResponse?.({ ok: true });
        }
    };

    const observeVideos = () => {
        const observer = new MutationObserver(() => {
            if (currentPrefs) applyPrefs(currentPrefs);
        });
        observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    };

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        handleMessage(msg, sender, sendResponse);
        return false;
    });

    loadPrefs();
    observeVideos();
})();

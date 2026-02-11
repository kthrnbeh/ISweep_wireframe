// plumbing.js - lightweight prefs->mute pipeline
(() => {
    const DEBUG = false;
    const PREFS_KEY = 'isweepPrefs';
    const MSG_APPLY = 'APPLY_PREFS';
    const PACK_URL = chrome.runtime.getURL('filters/profanity_packs.js');

    const profanityPacksPromise = import(PACK_URL)
        .then(mod => mod?.PROFANITY_PACKS || {})
        .catch(() => ({}));
    let lastLoggedPackSignature = '';

    let currentPrefs = null;
    let warnedUnknown = false;
    let muteState = {
        timerId: null,
        restore: new Map()
    };
    const appliedState = new WeakMap();

    const normalizeWord = (word) => (word || '').toString().toLowerCase().trim();

    const mapPackName = (raw) => {
        const key = normalizeWord(raw).replace(/\s+/g, '_');
        const aliases = {
            strong: 'strong',
            strong_profanity: 'strong',
            mild: 'mild',
            mild_language: 'mild',
            blasphemy: 'blasphemy'
        };
        return aliases[key] || null;
    };

    const extractEnabledPackNames = (prefs, packMap) => {
        const enabled = new Set();
        const candidates = [
            prefs?.profanityPacks,
            prefs?.packs?.profanity,
            prefs?.selectedPacks?.language,
            prefs?.selected_packs?.language,
            prefs?.selected_packs?.profanity
        ];

        candidates.forEach(entry => {
            if (!entry) return;
            if (Array.isArray(entry)) {
                entry.forEach(name => {
                    const mapped = mapPackName(name);
                    if (mapped && packMap[mapped]) enabled.add(mapped);
                });
            } else if (typeof entry === 'object') {
                Object.entries(entry).forEach(([name, value]) => {
                    if (!value) return;
                    const mapped = mapPackName(name);
                    if (mapped && packMap[mapped]) enabled.add(mapped);
                });
            } else if (typeof entry === 'string') {
                const mapped = mapPackName(entry);
                if (mapped && packMap[mapped]) enabled.add(mapped);
            }
        });

        return Array.from(enabled);
    };

    const dedupeWords = (words = []) => {
        const set = new Set();
        words
            .map(normalizeWord)
            .filter(Boolean)
            .forEach(w => set.add(w));
        return Array.from(set);
    };

    const buildVocabulary = async (prefs) => {
        const packMap = await profanityPacksPromise;
        const enabledPackNames = extractEnabledPackNames(prefs, packMap);
        const customWords = [];

        if (Array.isArray(prefs?.customWords)) customWords.push(...prefs.customWords);
        if (Array.isArray(prefs?.blocked_words)) customWords.push(...prefs.blocked_words);

        const vocab = [...customWords];
        enabledPackNames.forEach(name => {
            const packWords = packMap[name];
            if (Array.isArray(packWords)) vocab.push(...packWords);
        });

        const deduped = dedupeWords(vocab);

        if (enabledPackNames.length) {
            const signature = enabledPackNames.join(',');
            if (signature !== lastLoggedPackSignature) {
                console.log(`[ISweep] Loaded profanity packs: ${enabledPackNames.join(', ')}`);
                lastLoggedPackSignature = signature;
            }
        }

        return deduped;
    };

    const log = (...args) => { if (DEBUG) console.log('[ISweep-plumb]', ...args); };
    const timeLog = (...args) => console.log('[ISweep-time]', ...args);

    const getVideos = () => Array.from(document.querySelectorAll('video'));

    const normalizeAction = (raw) => {
        const value = String(raw || '').toLowerCase().trim();
        if (value === 'none') return 'none';
        if (value.includes('mute')) return 'mute';
        if (value.includes('skip') || value.includes('fast')) return 'skip';
        if (!warnedUnknown) {
            console.warn('[ISweep-plumb] Unknown action, defaulting to none:', raw);
            warnedUnknown = true;
        }
        return 'none';
    };

    const shouldMute = (prefs) => {
        const enabled = prefs?.enabled !== false;
        const categories = prefs?.categories || prefs?.filters || { profanity: true };
        const act = normalizeAction(prefs?.actions?.profanity ?? 'none');
        return enabled && categories.profanity !== false && act === 'mute';
    };

    const applyToVideo = (videoEl, doMute) => {
        if (!(videoEl instanceof HTMLVideoElement)) return;
        const already = appliedState.get(videoEl);
        const targetMute = Boolean(doMute || muteState.timerId);
        if (already === targetMute) return;
        if (targetMute) {
            ensureMuted(videoEl);
            appliedState.set(videoEl, true);
            console.log('[ISweep] auto-apply mute');
        } else {
            videoEl.muted = false;
            appliedState.set(videoEl, false);
        }
    };

    const applyPrefs = async (prefs) => {
        const nextPrefs = { ...(prefs || {}) };
        const vocab = await buildVocabulary(nextPrefs);

        if (vocab.length || Array.isArray(nextPrefs.blocked_words)) {
            nextPrefs.blocked_words = vocab.length ? vocab : dedupeWords(nextPrefs.blocked_words);
        }

        currentPrefs = nextPrefs;
        const doMute = shouldMute(nextPrefs);
        console.log('[ISweep] prefs received');
        getVideos().forEach(v => {
            registerVideo(v);
            applyToVideo(v, doMute);
        });
    };

    const ensureMuted = (videoEl) => {
        if (!(videoEl instanceof HTMLVideoElement)) return;
        if (!muteState.restore.has(videoEl)) {
            muteState.restore.set(videoEl, { muted: videoEl.muted, volume: videoEl.volume });
        }
        videoEl.muted = true;
        videoEl.volume = 0;
    };

    const restoreMuteState = () => {
        muteState.restore.forEach((state, videoEl) => {
            if (!(videoEl instanceof HTMLVideoElement)) return;
            videoEl.muted = state.muted;
            if (typeof state.volume === 'number') videoEl.volume = state.volume;
        });
        muteState.restore.clear();
    };

    const muteFor = (durationMs) => {
        const ms = Number(durationMs);
        if (!Number.isFinite(ms) || ms <= 0) return;

        if (muteState.timerId) {
            clearTimeout(muteState.timerId);
        }

        muteState.restore.clear();
        getVideos().forEach(ensureMuted);
        timeLog('mute start', `${ms}ms`);

        muteState.timerId = setTimeout(() => {
            restoreMuteState();
            muteState.timerId = null;
            timeLog('mute restore');
            // Re-apply prefs after restore to respect persistent settings
            if (currentPrefs) applyPrefs(currentPrefs);
        }, ms);
    };

    const loadPrefs = async () => {
        try {
            const data = await chrome.storage.sync.get(PREFS_KEY).catch(() => chrome.storage.local.get(PREFS_KEY));
            const prefs = data?.[PREFS_KEY];
            if (prefs) await applyPrefs(prefs);
        } catch (err) {
            log('loadPrefs error', err);
        }
    };

    const handleMessage = (message, sender, sendResponse) => {
        if (message?.type === MSG_APPLY && message.prefs) {
            applyPrefs(message.prefs)
                .then(() => sendResponse?.({ ok: true }))
                .catch(() => sendResponse?.({ ok: false }));
            return true; // keep channel open for async response
        } else if (message?.type === 'TEST_MUTE') {
            applyPrefs(currentPrefs || {});
            sendResponse?.({ ok: true });
        } else if (message?.type === 'MUTE_FOR') {
            muteFor(message.durationMs);
            sendResponse?.({ ok: true });
        }
    };

    const registerVideo = (videoEl) => {
        if (!(videoEl instanceof HTMLVideoElement)) return;
        if (appliedState.has(videoEl)) return;
        const handler = () => {
            const doMute = shouldMute(currentPrefs || {});
            applyToVideo(videoEl, doMute);
        };
        ['play', 'loadeddata', 'loadedmetadata', 'canplay', 'emptied', 'suspend', 'seeked'].forEach(ev => {
            videoEl.addEventListener(ev, handler, { passive: true });
        });
        appliedState.set(videoEl, null);
        handler();
    };

    const observeVideos = () => {
        const observer = new MutationObserver(() => {
            getVideos().forEach(v => registerVideo(v));
            if (currentPrefs) {
                const doMute = shouldMute(currentPrefs);
                getVideos().forEach(v => applyToVideo(v, doMute));
            }
            if (muteState.timerId) getVideos().forEach(ensureMuted);
        });
        observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
        getVideos().forEach(v => registerVideo(v));
    };

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        const keepChannel = handleMessage(msg, sender, sendResponse);
        return keepChannel === true;
    });

    loadPrefs();
    observeVideos();
})();

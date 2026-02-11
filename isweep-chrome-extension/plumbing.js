// plumbing.js - lightweight prefs->mute pipeline
(() => {
    const DEBUG = true;
    const PREFS_KEY = 'isweepPrefs';
    const MSG_APPLY = 'APPLY_PREFS';
    const PACK_URL = chrome.runtime.getURL('filters/profanity_packs.js');

    const profanityPacksPromise = import(PACK_URL)
        .then(mod => mod?.PROFANITY_PACKS || {})
        .catch(() => ({}));
    let lastLoggedPackSignature = '';

    // Track current preferences plus mute and caption state used for on-page enforcement.
    let currentPrefs = null;
    let warnedUnknown = false;
    let muteState = {
        timerId: null,
        restore: new Map(),
        activeUntil: 0
    };
    const appliedState = new WeakMap();

    // Track YouTube caption monitoring lifecycle so we only observe when needed.
    let captionObserver = null;
    let lastCaptionHash = '';
    let lastCaptionAt = 0;
    let lastTriggerAt = 0;

    // Normalize a single word for consistent comparisons across packs, prefs, and captions.
    const normalizeWord = (word) => (word || '').toString().toLowerCase().trim();

    // Map UI/legacy pack names to the internal ids so packs stay loadable across prefs shapes.
    // Why: user prefs may store different slugs; this keeps pack loading resilient.
    // Effect: ensures the right vocabulary is merged before caption matching runs.
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

    // Gather all enabled pack names from multiple prefs shapes into a single set of ids.
    // Why: options, popup, or backend may store pack selections differently; we need one view.
    // Effect: determines which built-in vocab groups become active for filtering.
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

    // Remove duplicates and normalize casing so matching is consistent and fast.
    // Why: packs + custom words may overlap; we only want unique normalized terms.
    // Effect: keeps the active blocked list minimal for caption scanning.
    const dedupeWords = (words = []) => {
        const set = new Set();
        words
            .map(normalizeWord)
            .filter(Boolean)
            .forEach(w => set.add(w));
        return Array.from(set);
    };

    // Normalize caption text into a stable format so vocabulary matches are reliable.
    // Why: YouTube captions vary in punctuation/casing; normalization aligns them with prefs.
    // Effect: boosts match accuracy without changing stored user preferences.
    const normalizeText = (text) => {
        return (text || '')
            .toString()
            .toLowerCase()
            .replace(/[.,!?;:\-"()\[\]{}]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // Check if a normalized caption contains any blocked term using padded includes.
    // Why: simple, fast matching suits real-time captions; padding reduces mid-word false hits.
    // Effect: triggers mutes only when whole blocked terms appear in captions.
    const containsBlockedTerm = (normalizedCaption, blockedWords = []) => {
        if (!normalizedCaption || !blockedWords.length) return null;
        const paddedCaption = ` ${normalizedCaption} `;
        for (const word of blockedWords) {
            const normWord = normalizeText(word);
            if (!normWord) continue;
            const paddedWord = ` ${normWord} `;
            if (paddedCaption.includes(paddedWord)) return normWord;
        }
        return null;
    };

    // Merge built-in packs with user vocabulary so caption matching uses a single deduped list.
    // Why: users expect pack selections and custom entries to work together automatically.
    // Effect: currentPrefs.blocked_words becomes the definitive vocabulary for filtering.
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

        if (enabledPackNames.length && DEBUG) {
            const signature = enabledPackNames.join(',');
            if (signature !== lastLoggedPackSignature) {
                console.log(`[ISweep] Loaded profanity packs: ${enabledPackNames.join(', ')}`);
                lastLoggedPackSignature = signature;
            }
        }

        return deduped;
    };

    // Detect whether we should attach YouTube-specific caption listeners for the current page.
    // Why: caption scanning only applies on YouTube watch pages; other sites skip this path.
    // Effect: prevents unnecessary observers and keeps filtering scoped to relevant pages.
    const isYouTubeWatch = () => {
        return location.hostname.includes('youtube.com') && location.pathname.includes('/watch');
    };

    // Extract the currently visible caption text across both YouTube renderers (player + overlay).
    // Why: YouTube uses multiple DOM paths; we collect from both so matching stays reliable.
    // Effect: returns the live caption string used for blocked-term detection.
    const getYouTubeCaptionText = () => {
        const selectors = [
            '.ytp-caption-segment',
            '.ytp-caption-window-container span',
            '.ytp-transcript-segment-text',
            'ytd-transcript-renderer .segment-text'
        ];

        const collected = new Set();
        selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(node => {
                const text = (node.textContent || '').trim();
                if (text) collected.add(text);
            });
        });

        if (!collected.size) return null;
        return Array.from(collected).join(' ');
    };

    // Handle caption updates: dedupe repeats, match vocabulary, and trigger timed mute when needed.
    // Why: avoids re-triggering on the same line while still reacting quickly to new captions.
    // Effect: starts/extends the mute window when blocked terms appear in captions.
    const handleCaptionChange = (rawText) => {
        const normalized = normalizeText(rawText);
        if (!normalized) return;

        const now = Date.now();
        // Captions often re-render the same line; skip repeats within ~1.2s to avoid rapid remutes.
        if (normalized === lastCaptionHash && now - lastCaptionAt < 1200) return;
        lastCaptionHash = normalized;
        lastCaptionAt = now;

        // Secondary debounce to avoid multiple triggers inside the same second window.
        if (now - lastTriggerAt < 800) return;

        if (!currentPrefs || !shouldMute(currentPrefs)) return;
        const vocab = currentPrefs.blocked_words || [];
        const matched = containsBlockedTerm(normalized, vocab);
        if (!matched) return;

        const durationSeconds = Number(currentPrefs.duration_seconds ?? currentPrefs.durationSeconds ?? 4);
        const durationMs = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds * 1000 : 4000;

        muteFor(durationMs);
        lastTriggerAt = now;

        if (DEBUG) {
            console.log('[ISweep DEBUG] Caption match -> mute', { matched, durationMs, sample: normalized.slice(0, 120) });
        }
    };

    // Start observing caption DOM when on YouTube watch pages and mute action is enabled.
    // Why: we only want to watch captions when user prefs allow auto-mute on language.
    // Effect: feeds caption text into the matcher so mutes fire from detected terms.
    const attachYouTubeCaptionObserver = () => {
        if (captionObserver || !isYouTubeWatch()) return;
        const target = document.body || document.documentElement;
        if (!target) return;

        captionObserver = new MutationObserver(() => {
            const text = getYouTubeCaptionText();
            if (text) handleCaptionChange(text);
        });

        captionObserver.observe(target, { childList: true, subtree: true, characterData: true });

        // Minimal production log so users/devs know captions monitoring is on for this page.
        if (!DEBUG) console.log('[ISweep] YouTube captions monitoring enabled');
    };

    // Tear down caption observer when user prefs or page context says auto mute should not run.
    // Why: reduces overhead and prevents unwanted mutes when the feature is off.
    // Effect: stops caption-driven filtering until conditions become valid again.
    const detachYouTubeCaptionObserver = () => {
        if (captionObserver) {
            captionObserver.disconnect();
            captionObserver = null;
        }
    };

    // Ensure caption observer state matches the latest preferences and page context.
    // Why: APPLY_PREFS can flip enabled/action states; observer must follow immediately.
    // Effect: dynamically starts/stops caption monitoring without extra observers.
    const syncCaptionObserver = (prefs) => {
        if (!prefs || !isYouTubeWatch()) {
            detachYouTubeCaptionObserver();
            return;
        }

        if (!shouldMute(prefs)) {
            detachYouTubeCaptionObserver();
            return;
        }

        attachYouTubeCaptionObserver();
    };

    // Debug-only logging helpers to keep production consoles clean.
    // Why: diagnostics should be opt-in so normal browsing stays quiet.
    // Effect: when DEBUG is false, only the minimal startup line is emitted.
    const log = (...args) => { if (DEBUG) console.log('[ISweep-plumb]', ...args); };
    const timeLog = (...args) => { if (DEBUG) console.log('[ISweep-time]', ...args); };

    // Collect all video elements on the page for mute application.
    // Why: ISweep must silence every video instance when a match occurs.
    // Effect: ensures caption-driven mutes and manual tests cover all videos.
    const getVideos = () => Array.from(document.querySelectorAll('video'));

    // Normalize action strings so prefs from different sources resolve to the same intent.
    // Why: keeps popup/options/backend values compatible with the mute pipeline.
    // Effect: determines whether captions should trigger mutes or be ignored.
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

    // Decide if profanity captions should mute based on enabled flag, category, and action.
    // Why: user control must be respected; no muting when disabled or non-mute action.
    // Effect: gates both caption observer activation and actual mute enforcement.
    const shouldMute = (prefs) => {
        const enabled = prefs?.enabled !== false;
        const categories = prefs?.categories || prefs?.filters || { profanity: true };
        const act = normalizeAction(prefs?.actions?.profanity ?? 'none');
        return enabled && categories.profanity !== false && act === 'mute';
    };

    // Apply or remove mute state on a single video element based on current policy.
    // Why: keeps per-video state aligned with global mute windows and user prefs.
    // Effect: toggles audio on the element whenever a mute window starts or ends.
    const applyToVideo = (videoEl, doMute) => {
        if (!(videoEl instanceof HTMLVideoElement)) return;
        const already = appliedState.get(videoEl);
        const targetMute = Boolean(doMute || muteState.timerId);
        if (already === targetMute) return;
        if (targetMute) {
            ensureMuted(videoEl);
            appliedState.set(videoEl, true);
            if (DEBUG) console.log('[ISweep DEBUG] auto-apply mute');
        } else {
            videoEl.muted = false;
            appliedState.set(videoEl, false);
        }
    };

    // Ingest new preferences, merge vocabulary, attach caption observer, and apply mute policy.
    // Why: APPLY_PREFS must immediately update what we watch for and how we respond.
    // Effect: updates blocked_words, starts/stops caption monitoring, and re-applies mute state.
    const applyPrefs = async (prefs) => {
        const nextPrefs = { ...(prefs || {}) };
        const vocab = await buildVocabulary(nextPrefs);

        if (vocab.length || Array.isArray(nextPrefs.blocked_words)) {
            nextPrefs.blocked_words = vocab.length ? vocab : dedupeWords(nextPrefs.blocked_words);
        }

        currentPrefs = nextPrefs;
        const doMute = shouldMute(nextPrefs);
        if (DEBUG) console.log('[ISweep DEBUG] prefs received');
        syncCaptionObserver(nextPrefs);
        getVideos().forEach(v => {
            registerVideo(v);
            applyToVideo(v, doMute);
        });
    };

    // Force a video to mute while remembering prior state so we can restore safely.
    // Why: avoids permanently altering user volume when auto-muting.
    // Effect: sets muted+volume=0 and stores previous values for later restore.
    const ensureMuted = (videoEl) => {
        if (!(videoEl instanceof HTMLVideoElement)) return;
        if (!muteState.restore.has(videoEl)) {
            muteState.restore.set(videoEl, { muted: videoEl.muted, volume: videoEl.volume });
        }
        videoEl.muted = true;
        videoEl.volume = 0;
    };

    // Restore videos to their prior mute/volume settings after a timed mute completes.
    // Why: respects the user’s previous audio choices once filtering has passed.
    // Effect: returns each video to its stored state and clears the cache.
    const restoreMuteState = () => {
        muteState.restore.forEach((state, videoEl) => {
            if (!(videoEl instanceof HTMLVideoElement)) return;
            videoEl.muted = state.muted;
            if (typeof state.volume === 'number') videoEl.volume = state.volume;
        });
        muteState.restore.clear();
    };

    // Timed mute controller that extends the window on overlapping detections.
    // Why: captions can surface repeated terms; we extend the window instead of flickering audio.
    // Effect: mutes all videos immediately and restores only after the final window expires.
    const muteFor = (durationMs) => {
        const ms = Number(durationMs);
        if (!Number.isFinite(ms) || ms <= 0) return;

        const now = Date.now();
        const targetUntil = now + ms;
        const shouldExtend = targetUntil > muteState.activeUntil;
        muteState.activeUntil = Math.max(muteState.activeUntil, targetUntil);

        if (muteState.timerId) {
            clearTimeout(muteState.timerId);
        }

        muteState.restore.clear();
        getVideos().forEach(ensureMuted);
        timeLog('mute start', `${ms}ms`);

        const scheduleUnmute = () => {
            const remaining = muteState.activeUntil - Date.now();
            if (remaining > 10) {
                muteState.timerId = setTimeout(scheduleUnmute, remaining);
                return;
            }

            restoreMuteState();
            muteState.timerId = null;
            muteState.activeUntil = 0;
            timeLog('mute restore');

            // Re-apply prefs after restore to respect persistent settings
            if (currentPrefs) applyPrefs(currentPrefs);
        };

        muteState.timerId = setTimeout(scheduleUnmute, muteState.activeUntil - Date.now());

        return shouldExtend;
    };

    // Load initial prefs from sync/local storage so auto-mute has the latest settings on page load.
    // Why: ensures caption logic and video handlers use the user’s saved preferences.
    // Effect: hydrates currentPrefs and kicks off observer + mute alignment.
    const loadPrefs = async () => {
        try {
            const data = await chrome.storage.sync.get(PREFS_KEY).catch(() => chrome.storage.local.get(PREFS_KEY));
            const prefs = data?.[PREFS_KEY];
            if (prefs) await applyPrefs(prefs);
        } catch (err) {
            log('loadPrefs error', err);
        }
    };

    // Route messages from background/popup to apply prefs or run manual test mutes.
    // Why: popup buttons and background updates rely on this bridge to trigger behavior.
    // Effect: updates prefs live or runs manual mute commands without altering auto logic.
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

    // Attach listeners to a video so state changes (play/seek/load) re-apply mute rules.
    // Why: dynamic players may reset audio; we reassert the desired mute state on events.
    // Effect: keeps each video aligned with current mute window and prefs.
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

    // Watch the DOM for new/removed videos so mute policy applies to dynamic content.
    // Why: many sites inject videos after load; we must register them automatically.
    // Effect: ensures all present videos follow the current mute and caption rules.
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

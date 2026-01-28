# ISweep Extension - Quick Testing Guide

## What Was Fixed

1. **Enabled State Persistence** ✅
   - `isweep_enabled` boolean now saved to `chrome.storage.local`
   - Popup shows correct Active/Inactive on load
   - Toggle messages active tab immediately

2. **Preference Parsing** ✅
   - Input fields now parse comma/newline-separated words
   - Each word: trimmed, lowercased, deduplicated
   - Saved as proper arrays (not strings) to backend

3. **Mute Locking** ✅
   - Tracks `isMuted` state and `muteUntil` timestamp
   - Prevents restarting mute timer during active mute
   - Eliminates over-muting on rapid captions

4. **Comprehensive Logging** ✅
   - Initialization logs (enabled state, userId, word counts)
   - Caption processing logs
   - Mute decision logs (including lock status)

---

## How to Test

### Test 1: Enabled State Persistence
1. Open popup → Verify UI shows "Active" or "Inactive" correctly
2. Click toggle → UI should flip immediately
3. Reload the page → Popup should remember the state
4. Check console: Look for `[ISweep-Popup] Initial enabled state loaded as: true|false`

### Test 2: Disable/Enable on Page
1. Disable extension via popup
2. Reload YouTube page
3. Open DevTools → Console
4. Look for: `[ISweep] Extension is DISABLED, skipping preference fetch`
5. Enable extension via popup
6. Look for: `[ISweep] Extension is ENABLED, fetching fresh preferences from backend...`

### Test 3: Word Parsing in Options
1. Go to chrome://extensions → ISweep → Options
2. Enter custom words: `fight, slap, punch` (comma-separated) or on multiple lines
3. Click Save
4. Check console for: `[ISweep-Options] Added 3 word(s) to language: ["fight", "slap", "punch"]`
5. Backend GET /preferences/user123 should show `blocked_words: [...]` (not comma string)

### Test 4: Mute Locking (YouTube)
1. Enable extension
2. Play Rap God video
3. Watch console for mute logs:
   ```
   [ISweep] MUTED: term="god" duration=0.90s unmute_at=...
   [ISweep] MUTE LOCK ACTIVE: Already muted until ..., skipping restart
   [ISweep] UNMUTED after word duration
   ```
4. If you see "MUTE LOCK ACTIVE" → Mute lock is working correctly
5. Audio should mute/unmute smoothly without flapping

### Test 5: Multiple Mutes in Succession
1. Play a video with rapid profanity
2. Each blocked word should mute for its duration
3. After unmute, next blocked word should mute again
4. No "flapping" (rapid mute/unmute cycles)

---

## Debugging

### If extension doesn't load:
- Check for errors in DevTools console
- Reload extension: chrome://extensions → Reload button
- Clear cache: DevTools → Application → Clear storage

### If muting doesn't work:
1. Verify `isweep_enabled` is `true` in DevTools:
   ```javascript
   chrome.storage.local.get(['isweep_enabled'], (result) => console.log(result));
   ```

2. Check backend is running:
   ```
   GET http://127.0.0.1:8001/preferences/user123
   ```

3. Verify blocked_words are in backend:
   ```javascript
   // Should return real array, not comma string
   console.log(preferences.language.blocked_words);
   ```

### If word parsing fails:
- Check DevTools console in options page
- Look for `[ISweep-Options]` logs
- Verify input field is not empty after clicking Save

---

## Expected Console Logs by Feature

### Initialization (page load)
```
[ISweep] LOADED enabled state from storage: true
[ISweep] LOADED userId: user123
[ISweep] LOADED backendURL: http://127.0.0.1:8001
[ISweep] LOADED language blocked_words count: 45
[ISweep] Extension is ENABLED, fetching fresh preferences from backend...
```

### Caption Processing
```
[ISweep] Processing caption: {original: "Rap God", normalized: "rap god", source: "youtube_dom"}
[ISweep] MATCHED blocked word in "language": "god"
```

### Muting
```
[ISweep] APPLYING ACTION: mute (duration: 0.90s) - Matched blocked word in "language": "god"
[ISweep] MUTED: term="god" duration=0.90s unmute_at=2026-01-28T22:45:09.807Z
[ISweep] UNMUTED after word duration
```

### Mute Lock (Rapid Captions)
```
[ISweep] MUTE LOCK ACTIVE: Already muted until 2026-01-28T22:45:09.807Z, skipping restart
```

---

## Common Issues & Solutions

| Issue | Cause | Fix |
|-------|-------|-----|
| Popup shows "Inactive" even after clicking "Enable" | State not saved | Reload popup, check chrome://extensions |
| Words show as comma string in backend | Old code path | Clear storage, re-save preferences |
| Rapid mutes/unmutes (flapping) | No mute lock | Check console for "MUTE LOCK ACTIVE" logs |
| Backend 422 error on save | Missing Body() annotation | Already fixed in rules.py |
| No console logs | `__ISWEEP_DEBUG` set to false | Run `window.__ISWEEP_DEBUG = true` in console |


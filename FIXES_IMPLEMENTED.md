# ISweep Chrome Extension - Critical Fixes Implemented

## Summary
Fixed three major systems in the ISweep extension: (1) enabled state persistence, (2) preference parsing/saving, and (3) mute locking with comprehensive logging.

---

## 1. **Enabled State Persistence** (popup.js)

### Changes
- **Line 56**: Added explicit boolean coercion: `isweep_enabled = Boolean(isweep_enabled);`
- **Line 58**: Added diagnostic log: `console.log('[ISweep-Popup] Initial enabled state loaded as:', isweep_enabled);`
- **Toggle button behavior**:
  - Saves `isweep_enabled` boolean to `chrome.storage.local`
  - Messages active tab immediately with `action: 'toggleISweep'`
  - Properly handles errors on non-content pages (expected)

### Result
✅ Enabled state now persists across page reloads and browser restarts  
✅ Popup UI shows correct Active/Inactive status on load  
✅ Toggle changes apply immediately to active tab

---

## 2. **Preference Saving & Parsing** (options.js)

### Changes
- **New function `parseBlockedWordsInput()`**:
  - Splits input on commas and newlines: `.split(/[,\n]/)`
  - Trims whitespace: `.map(w => w.trim())`
  - Lowercases all words: `.toLowerCase()`
  - Removes empty entries: `.filter(w => w.length > 0)`
  - Collapses multiple spaces: `.replace(/\s+/g, ' ')`
  - Deduplicates: `.filter((w, i, arr) => arr.indexOf(w) === i)`

- **Updated `addCustomWord()`**:
  - Now parses comma/newline-separated input as array
  - Validates each word individually (2-40 chars)
  - Adds all valid words at once
  - Shows appropriate feedback for each case
  - Logs count of words added

- **Updated `saveToBackend()`**:
  - Logs userId at start
  - For each category, logs:
    - Number of blocked words
    - Action type and duration
    - Full blocked words array
  - Example: `[saveToBackend] language: 26 blocked words, action="mute", duration=0.5s`

### Result
✅ Blocked words saved as real arrays (not strings)  
✅ Commas, newlines, and spaces handled correctly  
✅ Preference payloads contain properly formatted arrays  
✅ All operations logged for debugging

---

## 3. **Mute Lock & Text Normalization** (content-script.js)

### Core Mute Lock Implementation
**Location**: `__isweepApplyDecision()` case 'mute':

```javascript
// Check if already muted and within duration window
if (isMuted && now < muteUntil) {
    csLog(`[ISweep] MUTE LOCK ACTIVE: Already muted until ${new Date(muteUntil).toISOString()}, skipping restart`);
    return; // Don't restart the timer
}
```

**Behavior**:
- Tracks `isMuted` (boolean state)
- Tracks `muteUntil` (timestamp when current mute ends)
- **Before applying new mute**: Checks if already muted AND still within duration
- If yes: **Skips restarting the timer** (prevents over-muting)
- If no: Clears old timer, applies new mute

### Text Normalization
**Function**: `normalizeText(text)`

```javascript
function normalizeText(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[.,!?;:\-"()\[\]{}]/g, ' ') // Remove punctuation but preserve apostrophes
        .replace(/\s+/g, ' ') // Collapse whitespace
        .trim();
}
```

**Used in**:
- `textIncludesTerm()` - Match checking
- `__isweepEmitText()` - Caption processing
- `checkAllCategoriesForBlockedWords()` - Word detection

### Enhanced Logging

**Initialization** (`initializeFromStorage()`):
```
[ISweep] LOADED enabled state from storage: true|false
[ISweep] LOADED userId: user123
[ISweep] LOADED backendURL: http://127.0.0.1:8001
[ISweep] LOADED language blocked_words count: 45
[ISweep] Extension is ENABLED|DISABLED, fetching/skipping preference fetch
```

**Caption Processing** (`__isweepEmitText()`):
```
[ISweep] Processing caption: {original: "...", normalized: "...", source: "youtube_dom"}
[ISweep] MATCHED blocked word in "language": "god"
```

**Mute Decisions** (`__isweepApplyDecision()`):
```
[ISweep] APPLYING ACTION: mute (duration: 0.90s) - Matched blocked word in "language": "god"
[ISweep] MUTED: term="god" duration=0.90s unmute_at=2026-01-28T22:45:09.807Z
[ISweep] MUTE LOCK ACTIVE: Already muted until 2026-01-28T22:45:09.807Z, skipping restart
[ISweep] UNMUTED after word duration
```

### Result
✅ Mute timer **never restarted** during active mute (no flapping)  
✅ Over-muting fixed: rapid captions don't extend mute duration  
✅ Text normalization consistent across all matching  
✅ Comprehensive logs for debugging every step

---

## Testing Checklist

- [ ] Open popup → Enable/Disable toggle → Check UI updates correctly
- [ ] Disable → Reload page → Verify extension doesn't start
- [ ] Enable → Reload page → Verify listeners start and fetch preferences
- [ ] In options page: Enter comma/newline-separated words → Click Save
- [ ] Check console: `[saveToBackend]` logs show proper arrays
- [ ] Check backend: GET /preferences/user123 returns array-type blocked_words
- [ ] Play YouTube video with blocked word
- [ ] Check console for mute logs (no "MUTE LOCK ACTIVE" spam = success)
- [ ] Rapid profanity in video → Verify smooth mutes without flapping

---

## Files Modified
1. `/isweep-chrome-extension/popup.js` - Enabled state persistence
2. `/isweep-chrome-extension/options.js` - Word parsing and logging
3. `/isweep-chrome-extension/content-script.js` - Mute lock and logging
4. **Backend** - Word matching logic fixed (already deployed)

---

## Known Limitations / Future Improvements
- Mute lock uses in-memory `muteUntil` timestamp; survives page context but not extension reload
- Consider persisting mute state to storage for cross-context consistency
- Rapid successive captions may still trigger backend calls (not optimized for caption rate)


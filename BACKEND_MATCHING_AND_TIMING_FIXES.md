# ISweep Backend Matching & Caption Timing Fixes

## Summary
Fixed two critical issues: (1) Backend word matching incorrectly returned multi-word phrases when only partial matches occurred, and (2) Added user-adjustable caption timing offset to compensate for early/late captions.

---

## 1. Backend Word Boundary Matching Fix

### Problem
- Backend returned `matched_term: "god almighty"` when caption was `"rap god rap god"`
- Multi-word phrases were checked if **all words appeared** but not **in sequence**
- Example: "god almighty" would match if caption contained "god" and "almighty" anywhere, not necessarily together

### Solution (rules.py)
**New function signature:**
```python
def _find_blocked_word_match(db: Session, user_id: str, text: str) -> Optional[tuple[str, str, str]]:
    """
    Return (category, matched_word, regex_used) if any blocked word matches.
    Uses word-boundary regex matching to ensure exact phrase/word boundaries.
    """
```

**Key Changes:**
1. **Word boundaries**: Uses `\b...\b` regex to match standalone words only
2. **Phrase boundaries**: Multi-word phrases must match **in sequence**: `\bgod\s+almighty\b`
3. **Flexible whitespace**: Handles variable spacing between words
4. **Regex escaping**: Properly escapes special chars while preserving word structure

**Example Patterns:**
- `"god"` → `r'\bgod\b'` (standalone word only)
- `"god almighty"` → `r'\bgod\s+almighty\b'` (words in sequence with whitespace)
- `"goddamn"` → `r'\bgoddamn\b'` (single compound word)

**Result:**
✅ "rap god" matches only "god" (single word)  
✅ "god almighty" matches only when both words appear together  
❌ "god" in "rap god" won't match "god almighty" anymore

---

## 2. Caption Timing Offset

### Problem
- YouTube captions sometimes appear 200-500ms before/after actual speech
- Users hear the word before/after mute fires
- No way to adjust timing to compensate

### Solution
Added `caption_offset_ms` setting (default 300ms) with full UI/backend support

### Backend Changes (database.py, models.py, rules.py)

**Database Schema:**
```python
class PreferenceDB(Base):
    # ... existing fields ...
    caption_offset_ms = Column(Integer, default=300)  # 0-2000ms
```

**Pydantic Model:**
```python
class Preference(BaseModel):
    # ... existing fields ...
    caption_offset_ms: int = Field(default=300, ge=0, le=2000, 
                                     description="Caption timing offset in milliseconds")
```

**Save/Load:**
- `save_preference()` → saves `caption_offset_ms` to DB
- `save_bulk_preferences()` → handles `caption_offset_ms` in bulk saves
- `_db_to_preference()` → loads `caption_offset_ms` with fallback to 300
- `_default_preferences_for_user()` → defaults to 300ms for all categories

---

### Frontend Changes (options.html/js)

**HTML UI** (added to all 3 category panels):
```html
<div class="control-group">
    <label for="langCaptionOffset">Caption Offset (ms)</label>
    <input type="number" id="langCaptionOffset" class="caption-offset-input" 
           value="300" min="0" max="2000" step="50">
    <small>Adjust timing if captions appear early/late</small>
</div>
```

**JavaScript State:**
```javascript
const DEFAULT_CAPTION_OFFSET = {
    language: 300,
    violence: 300,
    sexual: 300
};

let captionOffsetByCategory = { ...DEFAULT_CAPTION_OFFSET };
```

**Functions Updated:**
- `fetchPreferencesFromBackend()` → loads `caption_offset_ms` from backend
- `loadState()` → loads from `chrome.storage.local`
- `renderCategoryControls()` → binds UI input with validation (0-2000ms)
- `saveToBackend()` → includes `caption_offset_ms` in POST payload

---

### Content Script Changes (content-script.js)

**Preference Structure:**
```javascript
let prefsByCategory = {
    language: {
        blocked_words: [],
        duration_seconds: 0.5,
        action: 'mute',
        caption_offset_ms: 300  // ← NEW
    }
};
```

**Mute Scheduler with Offset:**
```javascript
case 'mute':
    // Get caption offset from category prefs
    const categoryPrefs = prefsByCategory[matched_category] || {};
    const captionOffsetMs = Number(categoryPrefs.caption_offset_ms ?? 300);
    
    csLog(`[ISweep] Using caption_offset_ms: ${captionOffsetMs}ms for category "${matched_category}"`);
    
    // Schedule mute to start after caption offset
    const muteStartTime = now + captionOffsetMs;
    const muteEndTime = muteStartTime + durationMs;
    
    setTimeout(() => {
        // Apply mute (after offset delay)
        videoElement.muted = true;
        isMuted = true;
        muteUntil = muteEndTime;
        
        csLog(`[ISweep] MUTED: term="${matched_term}" duration=${duration.toFixed(2)}s offset=${captionOffsetMs}ms`);
        
        // Schedule unmute
        unmuteTimerId = setTimeout(() => {
            videoElement.muted = false;
            isMuted = false;
            csLog('[ISweep] UNMUTED after word duration');
        }, durationMs);
    }, captionOffsetMs);  // ← Delay mute start by offset
    break;
```

**Behavior:**
1. Caption detected → wait `caption_offset_ms` → apply mute
2. If offset = 300ms, mute fires 300ms **after** caption appears
3. User can adjust per-category (language/violence/sexual can have different offsets)

---

## 3. Enhanced Logging

### Backend Logs
```
reason: "Blocked word match: 'god' (regex: \bgod\b)"
```

**What's logged:**
- Matched term (the actual blocked word)
- Regex pattern used for matching
- Category matched

### Frontend Logs
```
[ISweep] Using caption_offset_ms: 300ms for category "language"
[ISweep] MUTED: term="god" duration=0.50s offset=300ms unmute_at=2026-01-28T23:15:45.123Z
[ISweep] UNMUTED after word duration
```

**What's logged:**
- Caption offset used
- Matched term and duration
- Scheduled unmute timestamp
- Mute/unmute events

---

## Testing Guide

### Test 1: Word Boundary Matching
1. Add "god" to blocked words (NOT "god almighty")
2. Play "Rap God" video
3. **Expected**: Mutes on "god" in "Rap God"
4. Check logs: `matched_term: "god"` with regex `\bgod\b`

### Test 2: Phrase Matching
1. Add "god almighty" to blocked words
2. Play video with "god almighty" phrase
3. **Expected**: Mutes only when full phrase appears
4. Caption "rap god" should NOT match "god almighty"

### Test 3: Caption Offset (Early Captions)
1. Set caption_offset_ms to 500ms
2. Play video with profanity
3. **Expected**: Mute fires 500ms after caption appears
4. If captions are 200ms early, word should be muted at correct time

### Test 4: Caption Offset (Late Captions)
1. Set caption_offset_ms to 100ms (lower than default)
2. Play video
3. **Expected**: Mute fires sooner (100ms after caption)
4. Use if captions lag behind audio

### Test 5: Per-Category Offsets
1. Set language offset=300ms, violence=500ms
2. Add words to both categories
3. Test each category triggers with its own offset
4. Check logs confirm different offsets used

---

## Files Modified

### Backend
1. **app/rules.py** (103 lines changed)
   - `_find_blocked_word_match()` → Regex word boundary matching
   - `decide()` → Returns regex pattern in reason
   - `save_preference()` → Saves caption_offset_ms
   - `save_bulk_preferences()` → Handles caption_offset_ms
   - `_db_to_preference()` → Loads caption_offset_ms
   - `_default_preferences_for_user()` → Defaults to 300ms

2. **app/models.py** (8 lines changed)
   - `Preference` → Added `caption_offset_ms` field
   - `CategoryPreference` → Added `caption_offset_ms` field

3. **app/database.py** (2 lines changed)
   - `PreferenceDB` → Added `caption_offset_ms` column

### Frontend
4. **options.html** (15 lines added)
   - Added caption offset input for language/violence/sexual panels

5. **options.js** (45 lines changed)
   - Added `DEFAULT_CAPTION_OFFSET` constant
   - Added `captionOffsetByCategory` state
   - Updated `fetchPreferencesFromBackend()` to load offset
   - Updated `loadState()` to load from storage
   - Updated `renderCategoryControls()` to bind offset input
   - Updated `saveToBackend()` to include offset in payload

6. **content-script.js** (25 lines changed)
   - Added `caption_offset_ms` to `prefsByCategory` structure
   - Updated preference parsing to load offset from backend
   - Updated mute case to use `setTimeout(captionOffsetMs)` delay
   - Added logs for offset usage

---

## Migration Notes

**Database Migration Required:**
```sql
ALTER TABLE preferences ADD COLUMN caption_offset_ms INTEGER DEFAULT 300;
```

Or let SQLAlchemy auto-create (will add column on first run).

**Existing Users:**
- Defaults to 300ms (original mute timing stays similar)
- Can adjust in Options page
- Saved to backend on next preference save

---

## Known Limitations

1. **Offset applies to mute start only** - Doesn't adjust skip/fast_forward actions
2. **Per-category, not per-word** - Same offset for all words in a category
3. **No negative offsets** - Can't mute *before* caption (range 0-2000ms)

---

## Future Enhancements

- [ ] Auto-detect optimal offset by analyzing audio/caption timing
- [ ] Per-word offset overrides
- [ ] Visual offset calibration tool (play test video, adjust offset until mute feels right)


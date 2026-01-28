# ISweep - Where to Edit Guide

Quick reference for where specific functionality lives in the codebase.

---

## Extension Files (Chrome Extension)

### Preset Word Packs
📄 **File**: `isweep-chrome-extension/preset-packs.js`

**Add new words**:
```javascript
export const PRESET_PACKS = {
    language: {
        strong_profanity: { words: ["fuck", "shit", ...] },
        mild_language: { words: ["damn", "hell", ...] },
        blasphemy: { words: ["god", "jesus", ...] }
    },
    sexual: {
        explicit_terms: { words: ["cock", "penis", ...] },
        intimate_acts: { words: ["sex", "masturbate", ...] }
    },
    violence: {
        graphic_violence: { words: ["kill", "murder", ...] }
    }
};
```

**Add new pack**:
1. Add to category object (e.g., `violence.weapon_use: { words: [...] }`)
2. Update `options.html` with new preset row
3. Update `options.js` to render new pack

---

### Options Page UI
📄 **File**: `isweep-chrome-extension/options.html`

**Add preset pack control**:
```html
<div class="preset-row">
    <span class="preset-name">Pack Display Name</span>
    <label class="toggle">
        <input type="checkbox">
        <span class="toggle-slider"></span>
    </label>
</div>
```

**Where to add**:
- Language packs: `<div id="langPresets">`
- Violence packs: `<div id="violencePresets">`
- Sexual packs: `<div id="sexualPresets">`

---

### Options Page Logic
📄 **File**: `isweep-chrome-extension/options.js`

**Default pack selections** (line ~15):
```javascript
const DEFAULT_SELECTED = {
    language: { strong_profanity: true, mild_language: false, ... },
    violence: { graphic_violence: false },
    sexual: { explicit_terms: false, intimate_acts: false }
};
```

**Render presets** (line ~130):
- `renderLanguagePresets()` - Language packs
- `renderViolencePresets()` - Violence packs  
- `renderSexualPresets()` - Sexual packs

**Save to backend** (line ~285):
- `saveToBackend()` - POSTs to `/preferences/bulk`
- Contains all logging and error handling

**Adjust logging**:
- Add more `log()` calls in `saveToBackend()`
- Change log level/verbosity

---

### Content Script (Caption Detection & Muting)
📄 **File**: `isweep-chrome-extension/content-script.js`

**Caption offset** (line ~55):
```javascript
let prefsByCategory = {
    language: {
        blocked_words: [],
        duration_seconds: 0.5,
        action: 'mute',
        caption_offset_ms: 300  // ← Default delay before mute
    }
};
```

**Mute duration calculation** (line ~88):
```javascript
function computeMuteDuration(term, baseDurationSeconds) {
    const knownDurations = {
        'god': 0.35,    // ← Add known word durations here
        'fuck': 0.40,
        // ...
    };
    
    // Heuristic: base + chars + words + padding
    let duration = 0.20 + (charCount * 0.04) + ((wordCount - 1) * 0.15);
    duration += 0.08; // Release padding
    
    // Clamp: 0.25s - 0.90s
    return Math.min(0.90, Math.max(0.25, duration));
}
```

**Mute logic** (line ~425):
- `window.__isweepApplyDecision()` - Handles mute/skip/fast_forward actions
- Uses `caption_offset_ms` from category prefs
- Implements cooldown and mute lock

**Cooldown/anti-flapping** (line ~105):
```javascript
let muteCooldownMs = 250; // ← Prevent re-muting same term within 250ms
```

**Caption normalization** (line ~70):
```javascript
function normalizeText(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[.,!?;:\-"()\[\]{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
```

---

## Backend Files (FastAPI)

### Word Matching Logic
📄 **File**: `isweep-backend/app/rules.py`

**Blocked word matching** (line ~195):
```python
def _find_blocked_word_match(db: Session, user_id: str, text: str):
    """Word boundary regex matching"""
    text_lower = text.lower()
    
    for blocked_word in pref.blocked_words:
        w_clean = blocked_word.strip().lower()
        
        # Build regex: \bword\b or \bword1\s+word2\b
        pattern = re.escape(w_clean).replace(r'\ ', r'\s+')
        pattern = r'\b' + pattern + r'\b'
        
        match = re.search(pattern, text_lower)
        if match:
            return (category, blocked_word, pattern)
```

**Decision engine** (line ~235):
```python
def decide(db: Session, event: Event) -> DecisionResponse:
    """Main decision logic"""
    # 1. Check blocked words (highest priority)
    # 2. Check content_type + confidence
    # 3. Default: no action
```

---

### Database Schema
📄 **File**: `isweep-backend/app/database.py`

**Preference table** (line ~30):
```python
class PreferenceDB(Base):
    __tablename__ = "preferences"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(String, index=True)
    category = Column(String, index=True)
    enabled = Column(Boolean, default=True)
    action = Column(String, default="none")
    duration_seconds = Column(Float, default=0.0)
    blocked_words = Column(String, default="")
    selected_packs = Column(String, default="{}")
    custom_words = Column(String, default="[]")
    caption_offset_ms = Column(Integer, default=300)  // ← Caption timing offset
```

**Migration** (line ~60):
```python
def migrate_db():
    """Add missing columns to existing database"""
    inspector = inspect(engine)
    existing_columns = {col['name'] for col in inspector.get_columns('preferences')}
    
    if 'caption_offset_ms' not in existing_columns:
        with engine.connect() as conn:
            conn.execute(text('ALTER TABLE preferences ADD COLUMN caption_offset_ms INTEGER DEFAULT 300'))
            conn.commit()
```

---

### API Models
📄 **File**: `isweep-backend/app/models.py`

**Preference schema**:
```python
class Preference(BaseModel):
    user_id: str
    category: str
    enabled: bool = True
    action: Action = Action.none
    duration_seconds: float = 0.0
    blocked_words: list[str] = []
    selected_packs: dict[str, bool] = {}
    custom_words: list[str] = []
    caption_offset_ms: int = Field(default=300, ge=0, le=2000)  // ← 0-2000ms range
```

---

### API Endpoints
📄 **File**: `isweep-backend/app/main.py`

**Save preferences** (line ~95):
```python
@app.post("/preferences/bulk")
def set_bulk_preferences(bulk: dict = Body(...), db: Session = Depends(get_db)):
    user_id = bulk.get('user_id')
    preferences = bulk.get('preferences', {})
    rules.save_bulk_preferences(db, user_id, preferences)
    return {"status": "saved", "categories_saved": list(preferences.keys())}
```

**Get preferences** (line ~120):
```python
@app.get("/preferences/{user_id}")
def get_all_preferences(user_id: str, db: Session = Depends(get_db)):
    prefs = rules.get_all_preferences(db, user_id)
    return {"user_id": user_id, "preferences": {cat: p.model_dump() for cat, p in prefs.items()}}
```

**Process caption event** (line ~135):
```python
@app.post("/event")
def handle_event(event: Event, db: Session = Depends(get_db)):
    decision = rules.decide(db, event)
    return decision
```

---

## Common Tasks

### Add a New Blocked Word
1. **Via UI**: Options → Category → Custom Words → Add → Save
2. **Via Preset Pack**: Edit `preset-packs.js` → Add to pack words array

### Add a New Preset Pack
1. **Define pack**: `preset-packs.js` → Add to category object
2. **Add UI control**: `options.html` → Add preset-row in category panel
3. **Add renderer**: `options.js` → Update render function for category
4. **Set default**: `options.js` → Update DEFAULT_SELECTED

### Adjust Mute Duration
1. **Known words**: `content-script.js` → Edit `knownDurations` map in `computeMuteDuration()`
2. **Heuristic**: `content-script.js` → Adjust formula: base + chars + words + padding
3. **Bounds**: `content-script.js` → Change `Math.min(0.90, Math.max(0.25, ...))`

### Adjust Caption Timing
1. **Per category**: Options UI → Category → Caption Offset (ms) → Save
2. **Change default**: `content-script.js` → Edit `caption_offset_ms: 300`
3. **Change range**: `options.html` → Edit `min="0" max="2000"` attributes

### Fix Save Errors
1. **Check backend**: Ensure running on port 8001
2. **Check logs**: `options.js` → Look for `[saveToBackend]` logs in console
3. **Check CORS**: Backend must allow `*` origin (already configured)
4. **Check DB**: Run migration if `caption_offset_ms` column missing

### Debug Matching Issues
1. **Frontend**: `content-script.js` → Check `normalizeText()` output in console
2. **Backend**: `rules.py` → Check regex pattern in `_find_blocked_word_match()`
3. **Compare**: Ensure both use same normalization (lowercase, no punctuation, collapsed spaces)

---

## Quick File Navigation

**Extension**:
- Word lists: `preset-packs.js`
- Options UI: `options.html`
- Options logic: `options.js`
- Caption detection: `content-script.js`
- YouTube handler: `youtube-handler.js`

**Backend**:
- Matching logic: `rules.py`
- Database schema: `database.py`
- API models: `models.py`
- API endpoints: `main.py`

**Documentation**:
- Testing guide: `COMPREHENSIVE_TESTING_GUIDE.md`
- Fixes summary: `FIXES_SUMMARY.md`
- This guide: `WHERE_TO_EDIT.md`

---

**Quick edit checklist**:
- [ ] Updated word list in `preset-packs.js`
- [ ] Added UI control in `options.html`
- [ ] Updated renderer in `options.js`
- [ ] Tested save in Options page
- [ ] Verified matching in YouTube console
- [ ] Confirmed backend logs show correct pattern

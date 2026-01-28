# ISweep Testing Checklist - Backend Matching & Caption Timing

## Pre-Test Setup

- [ ] Backend restarted: `cd isweep-backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8001`
- [ ] Extension reloaded: chrome://extensions → ISweep → Reload button
- [ ] Options page opened: chrome://extensions → ISweep → Options
- [ ] DevTools console open on both Options page and YouTube

---

## Test Suite 1: Word Boundary Matching

### Test 1.1: Single Word Match
**Setup:**
- Go to Options → Language tab
- Add custom word: `god`
- Save settings
- Open console, verify: `[saveToBackend] language: X blocked words`

**Test:**
- Play "Rap God" by Eminem: https://youtube.com/watch?v=XbGs_qK2PQA
- Look for caption "Rap God"

**Expected:**
- Console shows: `[ISweep] MATCHED blocked word in "language": "god"`
- Backend reason includes: `(regex: \bgod\b)`
- Mute fires when "god" appears
- Does NOT match "goddamn" or words containing "god" inside them

**Pass Criteria:**
✅ Logs show `matched_term: "god"` with regex `\bgod\b`  
✅ Video mutes on "god" word  
✅ "goddamn" (if present) does NOT trigger mute for single "god" word  

---

### Test 1.2: Multi-Word Phrase Match
**Setup:**
- Remove "god" from blocked words
- Add custom phrase: `god almighty`
- Save settings

**Test:**
- Find video with "god almighty" phrase (or add to custom words for testing)
- Play video

**Expected:**
- Only matches when BOTH words appear together: `\bgod\s+almighty\b`
- Caption "rap god" does NOT match "god almighty"
- Caption "god" alone does NOT match "god almighty"

**Pass Criteria:**
✅ Logs show `matched_term: "god almighty"` with regex `\bgod\s+almighty\b`  
✅ Single "god" does NOT trigger match  
✅ Only full phrase "god almighty" triggers mute  

---

### Test 1.3: Preset Pack - Blasphemy
**Setup:**
- Go to Options → Language tab
- Enable "Blasphemy" preset pack (contains "god", "jesus", "christ", "god almighty")
- Save settings

**Test:**
- Play "Rap God" video
- Watch for captions: "Rap God", "goddamn", etc.

**Expected:**
- "god" (standalone) matches
- "god almighty" (phrase) matches only when together
- Each term uses correct regex pattern

**Pass Criteria:**
✅ Backend logs show different regex for each match  
✅ No false positives (e.g., "good" doesn't match "god")  
✅ All blasphemy words mute correctly  

---

## Test Suite 2: Caption Timing Offset

### Test 2.1: Default Offset (300ms)
**Setup:**
- Options → Language → Caption Offset should show 300ms
- Add "god" to blocked words
- Save

**Test:**
- Play "Rap God" video
- Watch closely when caption "Rap God" appears vs when audio says "god"

**Expected:**
- Mute fires ~300ms after caption appears
- Log shows: `Using caption_offset_ms: 300ms`
- If captions are slightly early, mute should hit audio correctly

**Pass Criteria:**
✅ Log confirms offset: `offset=300ms`  
✅ Mute timing feels natural (not too early/late)  
✅ Scheduled mute time logged  

---

### Test 2.2: Increased Offset (500ms) - Early Captions
**Setup:**
- Options → Language → Caption Offset → Change to 500ms
- Save settings

**Test:**
- Play same video
- Note if mute feels delayed

**Expected:**
- Mute fires 500ms after caption appears
- Useful if captions show up way before speech

**Pass Criteria:**
✅ Log shows: `offset=500ms`  
✅ Mute delayed noticeably from caption appearance  
✅ Mute still hits the spoken word correctly  

---

### Test 2.3: Decreased Offset (100ms) - Late Captions
**Setup:**
- Options → Language → Caption Offset → Change to 100ms
- Save settings

**Test:**
- Play video
- Mute should fire very quickly after caption

**Expected:**
- Mute fires almost immediately (100ms) after caption
- Useful if captions lag behind audio

**Pass Criteria:**
✅ Log shows: `offset=100ms`  
✅ Mute fires quickly after caption appears  
✅ Doesn't fire before the spoken word  

---

### Test 2.4: Per-Category Offsets
**Setup:**
- Language → Caption Offset: 300ms
- Violence → Caption Offset: 500ms
- Sexual → Caption Offset: 200ms
- Add test words to each category
- Save

**Test:**
- Test each category separately
- Check logs for which offset is used

**Expected:**
- Language uses 300ms
- Violence uses 500ms
- Sexual uses 200ms

**Pass Criteria:**
✅ Each category logs its own offset value  
✅ Correct offset applied based on matched category  
✅ Settings persist across page reload  

---

## Test Suite 3: Integration Tests

### Test 3.1: Full Workflow - New Word
**Steps:**
1. Open Options page
2. Language → Add custom word: `test`
3. Caption Offset: 400ms
4. Save Settings
5. Reload extension
6. Check GET http://127.0.0.1:8001/preferences/user123
7. Verify response includes:
   ```json
   {
     "language": {
       "blocked_words": ["test", ...],
       "caption_offset_ms": 400,
       ...
     }
   }
   ```
8. Play video and add caption "test word here" manually
9. Check mute fires with 400ms offset

**Pass Criteria:**
✅ Backend saves caption_offset_ms correctly  
✅ GET request returns caption_offset_ms  
✅ Extension loads and uses offset  
✅ Logs confirm offset in use  

---

### Test 3.2: Mute Lock Still Works
**Test:** Rapid profanity (multiple blocked words in quick succession)

**Expected:**
- First match: mute fires (with offset)
- Subsequent matches during mute: MUTE LOCK ACTIVE message
- No mute restart during active mute
- Clean unmute after duration

**Pass Criteria:**
✅ First mute logs: `MUTED: term="..." offset=...ms`  
✅ Subsequent logs: `MUTE LOCK ACTIVE: Already muted until ...`  
✅ No audio flapping  
✅ Clean unmute at end  

---

### Test 3.3: Edge Cases

#### Edge Case 1: Zero Offset
- Set caption_offset_ms to 0
- Expected: Mute fires immediately (no delay)
- Log should show: `offset=0ms`

#### Edge Case 2: Max Offset (2000ms)
- Set caption_offset_ms to 2000
- Expected: Mute fires 2 seconds after caption
- Log should show: `offset=2000ms`

#### Edge Case 3: Missing Offset (Legacy Prefs)
- Clear browser storage
- Don't set offset
- Expected: Defaults to 300ms
- Log should show: `offset=300ms`

---

## Test Suite 4: Regression Tests

### Test 4.1: Mute Duration Still Computed
**Test:** Check that mute duration is still word-length based

**Expected:**
- Short word (3-4 chars): ~0.30-0.40s
- Long word (10+ chars): ~0.70-0.90s
- Multi-word phrase: longer duration

**Pass Criteria:**
✅ Logs show: `duration=0.XXs` (varies by word)  
✅ Not fixed at 0.5s for all words  
✅ Clamp still applies (0.25-0.90s range)  

---

### Test 4.2: Cooldown Still Active
**Test:** Same word repeats rapidly

**Expected:**
- First occurrence: mutes
- Subsequent within 250ms: cooldown message
- After cooldown: mutes again

**Pass Criteria:**
✅ Log shows: `Cooldown active for term "..."`  
✅ 250ms window enforced  
✅ Multiple mutes don't spam  

---

### Test 4.3: Other Actions (Skip/Fast Forward)
**Test:** Violence category with fast_forward action

**Note:** Caption offset currently only applies to mute action

**Expected:**
- Fast forward still works
- No offset delay (instant action)

**Pass Criteria:**
✅ Fast forward fires immediately  
✅ No caption_offset_ms applied to non-mute actions  

---

## Success Criteria Summary

**Backend Matching:**
- [ ] Single words match with `\b...\b` boundaries
- [ ] Multi-word phrases match only when in sequence
- [ ] Regex patterns logged correctly
- [ ] No false positives (e.g., "good" ≠ "god")

**Caption Timing:**
- [ ] UI shows caption offset input (0-2000ms range)
- [ ] Backend saves and loads caption_offset_ms
- [ ] Content script uses offset to delay mute
- [ ] Logs confirm offset value used
- [ ] Per-category offsets work independently

**Integration:**
- [ ] End-to-end save/load works
- [ ] Mute lock still prevents restart during active mute
- [ ] Cooldown still enforces 250ms window
- [ ] Duration still computed per word
- [ ] All existing features still work

---

## Known Issues / Limitations

1. **Offset doesn't apply to skip/fast_forward** - Only mute action uses offset
2. **Can't go negative** - Minimum 0ms (can't mute before caption)
3. **Same offset for all words in category** - No per-word override

---

## Post-Test Cleanup

- [ ] Remove test words from blocked lists
- [ ] Reset caption offsets to 300ms
- [ ] Verify no test data persisted to backend
- [ ] Document any bugs found
- [ ] Create GitHub issues for any regressions


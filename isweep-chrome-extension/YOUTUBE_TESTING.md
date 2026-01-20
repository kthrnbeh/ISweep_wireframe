# ISweep YouTube Support - Testing Guide

## ✨ What's New

ISweep now works on **YouTube videos** with captions! 

How it works:
1. Detects when you're watching YouTube
2. Monitors YouTube's caption display
3. Extracts caption text in real-time
4. Sends to backend for analysis
5. Applies mute/skip/fast-forward actions
6. Shows visual feedback

---

## 🧪 Testing YouTube Support

### Prerequisites

1. **Backend running:**
   ```bash
   cd c:\ISweep_wireframe\isweep-backend
   python -m app --port 8001 --no-reload
   ```

2. **Extension enabled in Chrome**
   - Go to `chrome://extensions/`
   - Ensure ISweep has latest changes (reload button)

3. **Preferences configured:**
   - Click ISweep icon → ⚙️ Preferences
   - Add blocked words you want to test (e.g., `music`, `beat`, `song`)
   - Click Save Settings

### Test Steps

**Step 1: Find a YouTube video with captions**
- Go to YouTube.com
- Search for any video (music, news, educational works well)
- Click on it to play
- Enable captions (CC button in bottom right)

**Step 2: Enable ISweep**
- Click ISweep icon in top right
- Set User ID (e.g., `user123`)
- Click **Enable ISweep**
- Should see ✓ ISweep Active badge on video

**Step 3: Watch for filtering**
- Play the video
- Watch for your blocked words in captions
- When detected:
  - Video will **mute/skip/speed up** based on your preference
  - Large text ("MUTED", "SKIPPED", "FAST-FORWARD") appears in center
  - Stats update in popup

**Step 4: Monitor console**
- Press F12 to open DevTools
- Go to Console tab
- Look for logs like:
  ```
  [ISweep-YT] Initializing YouTube handler
  [ISweep-YT] Caption monitoring started
  [ISweep-YT] Caption: "This is a song about..."
  [ISweep-YT] Action: mute - Blocked word match: 'song'
  ```

---

## 🎯 Test Scenarios

### Scenario 1: Music Video (easiest)
- Go to any music video
- Add `music`, `song`, `beat` as blocked words
- Most music videos have lots of these words in captions
- Should filter frequently

### Scenario 2: News Video
- Go to CNN or BBC News on YouTube
- Add words like `breaking`, `alert`, `news`
- Should filter throughout video

### Scenario 3: Educational Content
- Go to TED Talks or educational channel
- Add specific topic words
- Test that filtering works when words appear

### Scenario 4: Movie Trailer
- Go to movie trailer with captions
- Add common dialogue phrases
- Test filtering on entertainment content

---

## ✅ What Should Happen

When captions contain your blocked words:

1. **Visual Feedback** ✓
   - Large "MUTED", "SKIPPED", or "FAST-FORWARD" text appears in center
   - Fades out after 1.5 seconds

2. **Audio/Video Changes** ✓
   - Video mutes for duration specified in preferences (default 4s)
   - Or skips forward by duration (default 30s for sexual)
   - Or speeds up to 2x playback for duration (default 10s for violence)

3. **Stats Update** ✓
   - Popup shows "Actions Applied" count increasing
   - Refresh popup to see latest count

4. **Console Logs** ✓
   - `[ISweep-YT] Action:` message shows in Console
   - Includes reason and matched word

---

## 🐛 Troubleshooting

### "No captions showing on YouTube"?
- Enable captions: Click CC icon in bottom-right of video
- Some videos don't have captions (disable captions)
- Try a different video with more captions

### Badge not appearing?
- Reload extension (`chrome://extensions/` → reload)
- Refresh YouTube page
- Check Console for errors (`[ISweep-YT]` logs)

### Actions not applying?
- Verify blocked words match caption text exactly (case-insensitive)
- Check Console for `[ISweep-YT] Caption:` logs
- Reload page and try again

### Backend errors?
- Verify backend is running: `http://127.0.0.1:8001/health`
- Check Network tab in DevTools
- Ensure User ID in popup matches (consistency)

### Captions not detected?
- Some videos use auto-generated captions (should still work)
- Try enabling "auto-generated captions" if available
- Different YouTube UI versions may have different caption placement

---

## 📊 How to Debug

### Check Console Logs
Open DevTools (F12) and filter for `[ISweep-YT]`:

```javascript
// Search for these patterns:
[ISweep-YT] Initializing YouTube handler
[ISweep-YT] Caption monitoring started
[ISweep-YT] Caption: "..."
[ISweep-YT] Action: ...
```

### Check Network Requests
In DevTools Network tab:
- Look for POST requests to `http://127.0.0.1:8001/event`
- Click on request → Preview tab
- Should show caption text being sent

### Manual Test
In Console, test muting:
```javascript
document.querySelector('video').muted = true;
```
Should immediately mute video.

---

## 🎬 Common Test Videos

**YouTube videos with good captions:**

1. **Music Videos** - Heavy caption usage
   - Any official music video (lots of words to filter)
   - Try: "Despacito" or similar

2. **TED Talks** - Great for educational testing
   - High-quality captions
   - Full transcripts usually available

3. **News Channels** - Consistent captioning
   - BBC, CNN, Fox News channels
   - Always have captions enabled

4. **Movie Trailers** - Quick to test
   - Usually 2-3 minutes
   - Most have captions

5. **Tutorials/Educational** - Good for specific word testing
   - Add topic-specific words
   - See filtering in action

---

## 🚀 Advanced Testing

### Test Different Actions
1. Set Language to **Mute** (test muting)
2. Set Sexual to **Skip** (test skipping forward)
3. Set Violence to **Fast-forward** (test speed change)

Add different blocked words for each category and verify each action works.

### Test Duration Settings
1. Set mute duration to 2 seconds
2. Play video
3. When muted, count seconds until unmutes
4. Should be ~2 seconds

### Test Multiple Words
Add multiple comma-separated words:
```
music, song, beat, rhythm, melody
```

Each should trigger independently.

---

## 📝 Known Limitations

1. **Live Streams** - May have delays in caption processing
2. **Scrambled Captions** - Some captions may not extract perfectly
3. **Multiple Caption Languages** - Only monitors first caption track
4. **YouTube Shorts** - May need special handling
5. **Downloaded Captions** - Can extract but timing may be off

---

## ✨ Next Steps

After YouTube works:
1. Test on multiple videos
2. Try different categories and words
3. Report any issues
4. Consider:
   - Netflix support
   - Vimeo support
   - Streaming platform expansion

---

## 🎯 Success Criteria

✅ Extension loads without errors
✅ YouTube page detected (console shows YouTube support)
✅ Badge appears on video when enabled
✅ Captions being monitored (console logs caption text)
✅ Blocked words trigger actions
✅ Visual feedback appears
✅ Stats update in popup
✅ Actions apply correctly (mute/skip/speed)

If all 8 work, YouTube support is fully functional! 🎉

---

Enjoy filtering YouTube! 📺

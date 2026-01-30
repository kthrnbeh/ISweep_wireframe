# YouTube Filtering Debug Guide

## Quick Diagnosis (60 seconds)

1. **Go to:** https://www.youtube.com/watch?v=Bg59q4puhmg (or any video with captions)
2. **Open DevTools:** Press `F12`
3. **Go to Console tab**
4. **Search for:** `[ISweep-YT]`
5. **Expected logs:**
   ```
   [ISweep-YT] Initializing YouTube handler
   [ISweep-YT] Player reference obtained
   [ISweep-YT] Found caption container with selector: .captions-text
   [ISweep-YT] Caption monitoring started
   [ISweep-YT] Extracted caption: [ACTUAL TEXT FROM VIDEO]
   ```

---

## Common Issues & Fixes

### Issue 1: No `[ISweep-YT]` logs appear at all

**Symptoms:**
- DevTools shows no YouTube-related logs
- Extension shows as "Active" but nothing happens

**Diagnosis:**
```javascript
// In console, paste this:
console.log('YouTube page?', location.hostname.includes('youtube.com'));
```

**Fixes:**
1. **Reload extension:** Go to `chrome://extensions/` → Find ISweep → Click reload button
2. **Reload page:** Press F5
3. **Hard reload:** Press Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
4. **Clear storage:** 
   - DevTools → Application → Storage → Clear All
   - Reload page

---

### Issue 2: "Caption container not found, retrying in 1s..."

**Symptoms:**
- Logs show `[ISweep-YT] Caption container not found`
- Keeps retrying forever

**Diagnosis:**
YouTube's caption selectors may have changed. Let's see what's on the page:

```javascript
// In console, paste this:
console.log('Video element:', document.querySelector('video') ? 'FOUND' : 'NOT FOUND');
console.log('Caption selectors:');
console.log('  .captions-text:', document.querySelector('.captions-text') ? 'FOUND' : 'NOT FOUND');
console.log('  .ytp-caption-segment:', document.querySelector('div.ytp-caption-segment') ? 'FOUND' : 'NOT FOUND');
console.log('  [aria-live="off"]:', document.querySelectorAll('div[aria-live="off"]').length, 'found');
console.log('  [class*="caption"]:', document.querySelectorAll('[class*="caption"]').length, 'found');
```

**Likely Fixes:**
1. **Video not playing:** Captions only appear when video is playing
2. **Captions not enabled:** Click CC button (bottom-right of video) to enable captions
3. **Wrong video:** Some videos don't have captions available - try a different one

**If nothing found:**
- YouTube may have changed their caption HTML structure
- Report the issue with your diagnostic output

---

### Issue 3: Captions appear but no filtering happens

**Symptoms:**
- Logs show `[ISweep-YT] Extracted caption: [text]`
- But no muting or skipping occurs
- Popup shows `Actions Applied: 0`

**Diagnosis:**
```javascript
// In console, paste:
console.log('Backend URL:', localStorage.getItem('backendURL'));
console.log('User ID:', localStorage.getItem('userId'));
console.log('ISweep enabled?', localStorage.getItem('isweepEnabled'));
```

**Fixes:**
1. **Check backend URL:** Should match your configured backend URL
   - Click ISweep popup → Settings
   - Verify URL is correct
   - No trailing slash

2. **Check backend is running:**
   Start your backend if you intend to use one, then verify its health endpoint

3. **Check preferences saved:**
   - Click ISweep popup → Preferences
   - Add blocked word (e.g., "music")
   - Click Save Settings
   - Should show green checkmark

4. **Check ISweep is enabled:**
   - In ISweep popup, there's a toggle
   - Should show "ISweep Active" (green)
   - If disabled, click toggle to enable

---

### Issue 4: No feedback overlay (no "MUTED" text)

**Symptoms:**
- Filtering works (stats show actions applied)
- But no visual "MUTED", "SKIPPED", "FAST-FORWARD" text appears

**Diagnosis:**
Feedback is added to the video element's parent. Check:

```javascript
// In console:
const video = document.querySelector('video');
console.log('Video element:', video ? 'FOUND' : 'NOT FOUND');
console.log('Video parent:', video?.parentElement ? 'FOUND' : 'NOT FOUND');
console.log('Parent is positioned:', window.getComputedStyle(video.parentElement).position);
```

**Fix:**
The feedback overlay requires the parent to be positioned. YouTube usually has this, but in rare cases:
1. Reload page (F5)
2. Try a different video

---

## Network Debugging

If `[ISweep-YT]` logs appear but API calls fail:

1. **Open DevTools → Network tab**
2. **Filter for:** `event` or your backend host
3. **Play video and watch for requests**
4. **Look for:**
   - Request URL: `<BACKEND_URL>/event`
   - Method: `POST`
   - Status: Should be `200` (not 400, 500, etc.)

**If requests show 500 errors:**
- Backend crashed
- Restart your backend

**If requests don't appear at all:**
- Caption extraction may be failing
- Add debug logging to caption extraction

---

## Advanced Debugging

### Enable maximum logging

Paste in console to see ALL activity:

```javascript
// Patch the YouTube handler to log everything
const originalExtract = window.extractYouTubeCaptions;
window.extractYouTubeCaptions = function() {
    const result = originalExtract.call(this);
    if (result) {
        console.log('[DEBUG-YT] extractYouTubeCaptions returned:', result);
    }
    return result;
};

// Watch for API calls
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    if (args[0].includes('/event')) {
        console.log('[DEBUG-API] Sending:', args[1].body);
    }
    const response = await originalFetch.apply(this, args);
    if (args[0].includes('/event')) {
        console.log('[DEBUG-API] Response:', response.status, await response.clone().json());
    }
    return response;
};
```

### Check what YouTube thinks about captions

```javascript
// Some YouTube players expose caption info
if (window.yt) {
    console.log('[YT-API] yt object found');
    // This varies by YouTube version, but you can explore:
    console.dir(window.yt);
}
```

---

## Testing Checklist

Before reporting an issue, verify:

- [ ] Video is playing (not paused)
- [ ] Captions are enabled (CC button shows as on)
- [ ] ISweep extension is loaded (`chrome://extensions/`)
- [ ] ISweep toggle shows "Active" (green)
- [ ] Backend is running (`python -m app --port 8001 --no-reload`)
- [ ] Backend URL is `http://127.0.0.1:8001` (exact)
- [ ] Blocked words are configured and saved
- [ ] DevTools console shows `[ISweep-YT]` logs
- [ ] Captions are actually being extracted (see "Extracted caption:" logs)

---

## Sample Successful Log Output

When everything works, you should see:

```
[ISweep] YouTube page detected
[ISweep-YT] Initializing YouTube handler
[ISweep-YT] Player reference obtained
[ISweep-YT] Badge added
[ISweep-YT] Starting caption monitoring
[ISweep-YT] Found caption container with selector: .captions-text
[ISweep-YT] Caption monitoring started
[ISweep-YT] Extracted caption: "some text from video"
[ISweep-YT] Caption: "some text from video"
[ISweep-YT] Action: mute - Blocked word match: 'music'
[ISweep-YT] Badge added (multiple times as new captions appear)
```

---

## Still Broken?

1. Try the **HTML5 test first** (`test.html`)
   - If HTML5 works but YouTube doesn't → YouTube-specific issue
   - If HTML5 doesn't work → Core extension issue

2. **Share these diagnostics:**
   - Console logs (copy from DevTools)
   - Network tab (show the `/event` POST request and response)
   - Video URL you're testing
   - Screenshot of ISweep popup settings

3. **Try different videos:**
   - YouTube music: https://www.youtube.com/watch?v=dQw4w9WgXcQ (has captions)
   - Tutorial video with captions
   - News video with auto-generated captions

---

## Quick Fix Restart

1. Stop backend: Press Ctrl+C in terminal
2. Reload extension: `chrome://extensions/` → reload ISweep
3. Close YouTube tab
4. Start backend: `python -m app --port 8001 --no-reload`
5. Open YouTube in new tab
6. Enable ISweep
7. Open DevTools: F12
8. Play video with captions enabled
9. Check console for logs

Good luck! 🎬

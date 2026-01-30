# ISweep - Testing Guide for Caption Extraction

## 🎬 How It Now Works

1. **Extension detects videos** on page
2. **Extracts caption text** from `<track>` elements  
3. **Sends actual caption text** to backend
4. **Backend analyzes text** against blocked words
5. **Action applied** → mute/skip/fast-forward seamlessly
6. **Visual feedback** → shows action on screen

---

## 🧪 Test Steps

### Step 1: Set Up Blocked Words

1. Click ISweep icon → **⚙️ Preferences**
2. Under "Language" category, add blocked words:
   ```
   profanity, swear, curse, bad word
   ```
3. Click **Save Settings**
4. Verify in console: `[ISweep] Loaded X caption cues`

### Step 2: Test with Sample Video

Create a test HTML file with captions:

**test-captions.html:**
```html
<!DOCTYPE html>
<html>
<head>
    <title>ISweep Caption Test</title>
    <style>
        body { font-family: Arial; padding: 20px; background: #f5f5f5; }
        video { border: 2px solid #333; max-width: 100%; margin: 20px 0; }
        .info { background: white; padding: 15px; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="info">
        <h1>ISweep Caption Extraction Test</h1>
        <p><strong>Instructions:</strong></p>
        <ol>
            <li>Click ISweep icon → Enable ISweep</li>
            <li>Click ISweep Preferences and add blocked words (e.g., "test")</li>
            <li>Play the video below</li>
            <li>Watch for captions mentioning your blocked words</li>
            <li>ISweep should automatically mute/skip/fast-forward</li>
            <li>Check DevTools (F12) Console for [ISweep] logs</li>
        </ol>
    </div>

    <video width="640" height="360" controls>
        <track kind="captions" src="captions.vtt" srclang="en" label="English">
        <source src="https://www.w3schools.com/html/mov_bbb.mp4" type="video/mp4">
    </video>

    <div class="info">
        <p><strong>No captions file?</strong> Create <code>captions.vtt</code> in the same folder with this content:</p>
        <pre>WEBVTT

00:00:00.000 --> 00:00:03.000
This is a test video.

00:00:03.000 --> 00:00:06.000
The next word will trigger ISweep: profanity

00:00:06.000 --> 00:00:09.000
Back to normal content now.</pre>
    </div>
</body>
</html>
```

### Step 3: Watch DevTools Console

Open DevTools (F12) → Console tab. You should see:

```
[ISweep] Content script loaded - Caption extraction enabled
[ISweep] Detected 1 video(s)
[ISweep] Video 0: Found 1 caption track(s)
[ISweep] Loaded 3 caption cues
[ISweep] Video 0 started playing
[ISweep] Caption: "This is a test video."
[ISweep] Caption: "The next word will trigger ISweep: profanity"
[ISweep] Action: mute - Blocked word match: 'profanity'
```

---

## ✅ What Should Happen

When ISweep detects a blocked word in captions:

1. **Visual Feedback** → Large "MUTED" / "SKIPPED" / "FAST-FORWARD" text appears in center of video
2. **Action Applied** → Video is muted/skipped/sped-up
3. **Stats Updated** → Popup shows incremented "Actions Applied" counter
4. **Console Logs** → `[ISweep] Action:` message appears

---

## 🔄 Real-World Test Sites

Most modern video sites have captions:

- **YouTube** — Right-click video → "Show transcript" (see captions)
- **Vimeo** — Most videos have captions
- **Netflix** — Has captions (but player is special)
- **TED Talks** — Has captions
- **News Sites** — Many have embedded videos with captions

⚠️ **Note:** YouTube's player is custom-built, not HTML5 `<video>`, so it needs special handling (Phase 2).

---

## 🐛 Troubleshooting

### "Detected 0 videos"?
- Some sites don't use HTML5 `<video>` (YouTube, TikTok use custom players)
- Try a site like Vimeo, Dailymotion, or a news site
- Create your own test file (easiest)

### "No captions loaded"?
- Video doesn't have captions
- Check: Right-click video → "Inspect" → Look for `<track>` elements
- If none exist, you need to add them

### Action not applying?
- Check DevTools Console for errors
- Verify blocked words in Preferences match caption text (case-insensitive)
- Reload extension (`chrome://extensions/` → reload button)

### Backend connection failing?
- Ensure backend is running at your configured URL
- Check Network tab in DevTools
- Verify User ID in popup matches backend preferences

---

## 📊 What Stats Mean

- **Videos Detected:** Count of `<video>` elements found
- **Actions Applied:** Times ISweep actually filtered (muted/skipped/fast-forwarded)

Clear stats button resets both to 0.

---

## 🚀 Next: YouTube Support

The extension currently works with HTML5 videos but YouTube uses a custom player. To add YouTube support, we'd need to:

1. Detect YouTube player
2. Intercept YouTube's caption API
3. Apply actions to YouTube's player API

Want me to build that next?

---

## Quick Test Without Setup

If you don't have captions, you can manually test muting:

1. Open any video site
2. Click extension → Enable ISweep
3. In DevTools Console, run:
   ```javascript
   document.querySelector('video').muted = true;
   ```
4. See if the action tracking works

---

Enjoy testing! 🎬

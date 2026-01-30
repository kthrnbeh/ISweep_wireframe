# ISweep Chrome Extension - Quick Start

## 📦 Installation

### Step 1: Open Chrome Extensions Page
```
chrome://extensions/
```

### Step 2: Enable Developer Mode
Toggle **Developer mode** in the top right corner.

### Step 3: Load Unpacked Extension
1. Click **Load unpacked**
2. Navigate to and select: `c:\ISweep_wireframe\isweep-chrome-extension`
3. Click **Select Folder**

### Step 4: Extension Installed ✓
You should see the ISweep extension appear in your extensions list and in the top toolbar.

---

## 🚀 Usage

### Step 1: Backend (Optional)
If you want backend decisions, start your backend and note its base URL.

### Step 2: Configure Extension
1. Click the **ISweep icon** in Chrome's top right
2. Enter a **User ID** (e.g., `user123`)
3. If using a backend, set **Backend URL** to your backend base URL
4. Click **Enable ISweep**

### Step 3: Test on a Video
1. Go to a website with HTML5 videos (e.g., most news sites, videos on Twitter, etc.)
2. Play a video
3. You should see a **green "✓ ISweep Active" badge** on the video
4. Stats should increase in the popup

---

## 🧪 Testing

### Test Event
Open the extension popup and you'll see:
- **Status**: Active/Inactive (green/red dot)
- **Videos Detected**: Count of `<video>` elements found
- **Actions Applied**: Count of times ISweep applied an action

### Chrome DevTools
To see detailed logs:
1. Right-click the ISweep icon → **Inspect popup** (for popup debugging)
2. Open DevTools (F12) on any page with videos
3. Look for `[ISweep]` logs in Console

Example logs:
```
[ISweep] Detected 1 video(s)
[ISweep] Video 0 started playing
[ISweep] Action: mute - Matched category 'language'
```

---

## 🔧 Testing with Local Videos

Create a test HTML file to try the extension locally:

**test-video.html:**
```html
<!DOCTYPE html>
<html>
<head>
    <title>ISweep Video Test</title>
    <style>
        body { font-family: Arial; padding: 20px; background: #f0f0f0; }
        video { border: 2px solid #333; max-width: 100%; margin-top: 20px; }
    </style>
</head>
<body>
    <h1>ISweep Extension Test</h1>
    <p>Play this video and watch ISweep in action:</p>
    
    <video width="640" height="360" controls>
        <source src="https://www.w3schools.com/html/mov_bbb.mp4" type="video/mp4">
        Your browser does not support the video tag.
    </video>
    
    <p>✓ ISweep should show a green badge when enabled</p>
</body>
</html>
```

Then open with `file://` protocol and test.

---

## 📊 How to Verify It's Working

1. **Extension Enabled?** 
   - Popup shows "Active" with green dot ✓

2. **Video Detected?**
   - Popup shows `Videos Detected: 1` ✓
   - Green badge "✓ ISweep Active" appears on video ✓

3. **Decision Working?**
   - If you set up blocked words in preferences, video should mute/skip
   - Popup `Actions Applied` counter increments ✓
   - DevTools console shows action logs ✓

---

## 🐛 Troubleshooting

### Extension doesn't appear?
- Reload `chrome://extensions/`
- Verify folder path contains all files

### Videos not detected?
- Videos must be `<video>` HTML5 elements
- Some embedded videos (YouTube, Vimeo) may need special handling
- Check DevTools console for errors

### Backend connection fails?
- Verify backend is running on your configured URL
- Check Network tab in DevTools
- Ensure correct URL in popup

### Popup button not working?
- Reload extension (`chrome://extensions/` → reload icon)
- Check DevTools console for JavaScript errors

---

## 📝 Next Steps

1. ✅ Test extension with local HTML5 videos
2. ⏳ Add YouTube player detection
3. ⏳ Implement caption detection
4. ⏳ Build user preferences UI
5. ⏳ Package for Chrome Web Store

---

## 📚 Files

- `manifest.json` — Extension configuration
- `popup.html` / `popup.js` — Extension popup UI
- `content-script.js` — Video detection & control (injected into pages)
- `background.js` — Service worker for background tasks
- `styles.css` — Styling
- `icons/` — Extension icons

---

Enjoy ISweep! 🎬

# ISweep Chrome Extension - Complete Guide

**ISweep** is a smart content filter that seamlessly mutes, skips, or fast-forwards video content based on your preferences.

✅ **Works on:** HTML5 videos + YouTube
✅ **Filters:** Language, Sexual Content, Violence
✅ **Actions:** Mute, Skip, Fast-forward
✅ **No video editing:** Plays videos through as-is

---

## 🚀 Quick Start (5 minutes)

### 1. Install Extension

```
1. Open chrome://extensions/
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select: c:\ISweep_wireframe\isweep-chrome-extension
5. ISweep appears in extensions!
```

### 2. Start Backend

```bash
cd c:\ISweep_wireframe\isweep-backend
python -m app --port 8001 --no-reload
```

### 3. Configure ISweep

1. Click ISweep icon → **⚙️ Preferences**
2. Add blocked words (e.g., `profanity, curse`)
3. Click **Save Settings**
4. Click ISweep icon → **Enable ISweep**

### 4. Test It

- Go to any video (YouTube with captions recommended)
- Play video
- When blocked word appears in captions → automatic filter applied!
- See stats in popup

---

## 📋 Features

### ✨ Supported Video Types

| Platform | Status | Notes |
|----------|--------|-------|
| YouTube | ✅ Full | Captions extraction |
| HTML5 `<video>` | ✅ Full | Any site with video+captions |
| Vimeo | ✅ Partial | Requires manual caption support |
| Netflix | ⏳ Future | Custom player API needed |
| TikTok | ⏳ Future | Custom player API needed |

### 🎯 Filter Categories

**Language** → Profanity, offensive speech
- Default: Mute for 4 seconds
- Customizable words & action

**Sexual Content** → NSFW material
- Default: Skip 30 seconds
- Customizable words & action

**Violence** → Violent content
- Default: Fast-forward 2x for 10 seconds
- Customizable words & action

### 🎮 Actions Available

- **Mute** — Silences audio for duration
- **Skip** — Jumps forward by seconds
- **Fast-forward** — Increases speed 2x for duration
- **None** — Disabled filtering

---

## 📁 File Structure

```
isweep-chrome-extension/
├── manifest.json          # Extension config
├── popup.html            # Popup UI
├── popup.js              # Popup logic
├── popup.css             # Popup styling
├── options.html          # Preferences page
├── options.js            # Preferences logic
├── options.css           # Preferences styling
├── content-script.js     # Main filtering logic
├── youtube-handler.js    # YouTube support
├── background.js         # Service worker
├── icons/                # Extension icons
├── README.md            # This file
├── QUICKSTART.md        # Quick setup
├── TESTING_CAPTIONS.md  # HTML5 video testing
└── YOUTUBE_TESTING.md   # YouTube testing
```

---

## 🧪 Testing

### For HTML5 Videos
See [TESTING_CAPTIONS.md](TESTING_CAPTIONS.md)

**Quick test:**
1. Create test.html with video and captions
2. Add blocked words in preferences
3. Play video
4. Blocked words trigger filters

### For YouTube
See [YOUTUBE_TESTING.md](YOUTUBE_TESTING.md)

**Quick test:**
1. Go to YouTube.com
2. Play any video with captions
3. Enable ISweep
4. Add blocked words
5. Captions with blocked words trigger filters

---

## ⚙️ Configuration

### Extension Settings

**Popup:**
- User ID — Identifier for preferences (sync between backend/extension)
- Backend URL — Where ISweep backend is running
- Enable/Disable ISweep — Toggle filtering on/off

**Preferences (⚙️ button):**
- For each category:
  - Toggle on/off
  - Select action (mute/skip/fast-forward)
  - Set duration in seconds
  - Add blocked words (comma-separated)

### Backend Integration

Settings automatically sync to backend when saved:
```
POST http://127.0.0.1:8001/preferences
{
  "user_id": "user123",
  "category": "language",
  "enabled": true,
  "action": "mute",
  "duration_seconds": 4,
  "blocked_words": ["profanity", "curse"]
}
```

---

## 🔄 How It Works

### HTML5 Videos

```
1. Content script finds <video> elements
2. Extracts <track> captions (WebVTT format)
3. Monitors caption changes in real-time
4. Sends caption text to backend /event endpoint
5. Backend checks against blocked words
6. Returns decision (mute/skip/fast-forward)
7. Action applied to video
8. Visual feedback shown
9. Stats updated
```

### YouTube

```
1. Detects YouTube page
2. Finds HTML5 video element (YouTube embeds one)
3. Monitors YouTube's caption display DOM
4. Extracts visible caption text
5. Sends to backend /event endpoint
6. Rest same as HTML5...
```

---

## 📊 API Integration

### Backend Connection

ISweep backend must be running at configured URL (default: `http://127.0.0.1:8001`)

**Endpoints used:**
- `POST /event` — Send caption text, get decision
- `POST /preferences` — Save user preferences
- `GET /health` — Check backend status

**Example request:**
```json
POST /event
{
  "user_id": "user123",
  "text": "This contains profanity word",
  "content_type": null,
  "confidence": 0.9
}
```

**Example response:**
```json
{
  "action": "mute",
  "duration_seconds": 4,
  "reason": "Blocked word match: 'profanity'",
  "matched_category": "language"
}
```

---

## 🐛 Troubleshooting

### General

**Extension not working?**
- Reload: `chrome://extensions/` → reload button
- Check backend running: `http://127.0.0.1:8001/health`
- Open DevTools (F12) → Console for errors

**Actions not applying?**
- Verify blocked words added in Preferences
- Check captions enabled on video
- Ensure User ID is set

### YouTube Specific

**YouTube videos not detected?**
- Reload extension and YouTube page
- Enable captions (CC button)
- Try different video
- Check console for `[ISweep-YT]` logs

**Captions not extracting?**
- Ensure captions are visible on video
- Try enabling auto-generated captions
- Different YouTube UI versions may vary

### Backend Errors

**"Cannot connect to backend"?**
- Start backend: `python -m app --port 8001 --no-reload`
- Verify URL in popup (default: `http://127.0.0.1:8001`)
- Check Network tab in DevTools

---

## 🛠️ Development

### Adding New Features

1. **New video platform?** Create `xxx-handler.js` similar to YouTube
2. **New filter action?** Update `backend/app/models.py` with new `Action` enum
3. **New filter category?** Add to backend preferences + extension options.html

### Debugging

Enable console logs:
- `[ISweep]` — General logs
- `[ISweep-YT]` — YouTube-specific logs

Open DevTools (F12) → Console → Filter by `[ISweep`

### Testing Without Backend

For quick UI testing, you can mock API responses:
```javascript
// In browser console
const mockDecision = { action: 'mute', duration_seconds: 4, reason: 'test' };
```

---

## 📋 Requirements

### Browser
- Chrome 90+ (Manifest V3)
- Firefox support planned

### Backend
- Python 3.11+
- FastAPI, SQLAlchemy, Pydantic
- See [isweep-backend/README.md](../isweep-backend/BACKEND_README.md)

### System
- 100MB disk space (for database)
- Broadband internet connection

---

## 🗺️ Roadmap

**Phase 1 (Done)** ✅
- [x] HTML5 video support
- [x] YouTube support
- [x] Caption extraction
- [x] Preferences UI

**Phase 2 (Planned)**
- [ ] Netflix/TikTok/Twitch support
- [ ] Audio-only transcription (fallback when no captions)
- [ ] ML-based confidence scoring
- [ ] Cloud sync for preferences
- [ ] Keyboard shortcuts

**Phase 3 (Future)**
- [ ] Browser sync (Firefox/Edge/Safari)
- [ ] Content analysis improvements
- [ ] Analytics dashboard
- [ ] Chrome Web Store publishing

---

## 📞 Support

### Common Issues

**Q: Can it detect profanity without captions?**
A: Currently needs captions/subtitles. Audio transcription planned for future.

**Q: Does it modify the actual video file?**
A: No! It only controls playback (mute, skip, speed). Video unchanged.

**Q: Can I use multiple ISweep accounts?**
A: Yes! Change User ID in popup, settings sync separately.

**Q: Does it work offline?**
A: Needs internet for captions/audio analysis. Local backend can run offline.

---

## 📝 License

ISweep is open source for educational purposes.

---

## 🎯 Next Steps

1. **Install & configure** extension
2. **Test on HTML5 videos** (see TESTING_CAPTIONS.md)
3. **Test on YouTube** (see YOUTUBE_TESTING.md)
4. **Add custom blocked words** for your preferences
5. **Report issues** or request features

---

**Happy filtering!** 🎬

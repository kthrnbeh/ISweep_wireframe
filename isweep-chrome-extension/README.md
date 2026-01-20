# ISweep Chrome Extension

Browser extension that detects and controls video playback based on content filtering preferences.

## Features

✅ Detects HTML5 `<video>` elements on any page
✅ Shows status badge on active videos
✅ Seamlessly applies filters (mute, skip, fast-forward)
✅ Connects to ISweep backend API
✅ Real-time stats tracking
✅ Easy on/off toggle

## Installation

### For Development

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `isweep-chrome-extension` folder
5. The extension should appear in your extensions list

### Using the Extension

1. Click the ISweep icon in the top right
2. Enter your **User ID** (must match backend)
3. Ensure **Backend URL** points to running backend (default: `http://127.0.0.1:8001`)
4. Click **Enable ISweep**
5. The extension will now monitor all videos on the page

## How It Works

### Detection
- Scans page for `<video>` elements
- Uses MutationObserver to detect dynamically added videos
- Shows "✓ ISweep Active" badge on each video

### Decision Making
1. Content script monitors video playback
2. Sends event data to backend via POST `/event`
3. Backend returns decision (mute, skip, fast-forward)
4. Action is applied seamlessly to video

### Actions
- **Mute** — Silences video for specified duration
- **Skip** — Jumps forward by specified seconds
- **Fast-forward** — Speeds up playback 2x for duration
- **None** — No action taken

## Files

```
isweep-chrome-extension/
├── manifest.json          # Extension configuration
├── popup.html            # Popup UI
├── popup.js              # Popup logic
├── styles.css            # Styles
├── content-script.js     # Injected into pages
├── background.js         # Service worker
├── README.md             # This file
└── icons/                # Extension icons (placeholder)
```

## Backend Integration

The extension communicates with ISweep backend:

```
Backend URL: http://127.0.0.1:8001
Endpoint: POST /event

Request:
{
  "user_id": "user123",
  "text": null,
  "content_type": "video",
  "confidence": 0.8,
  "timestamp_seconds": 12.5
}

Response:
{
  "action": "mute",
  "duration_seconds": 4,
  "reason": "Matched category 'language'",
  "matched_category": "language"
}
```

## Console Logs

Enable Chrome DevTools (F12) to see ISweep logs:
- `[ISweep] Detected X video(s)`
- `[ISweep] Action: mute - Blocked word match`
- `[ISweep] Enabled/Disabled`

## Troubleshooting

### Extension not detecting videos?
- Open DevTools (F12) and check Console for errors
- Ensure content script is enabled in Extension page
- Try reloading the page

### Backend connection failing?
- Verify backend is running on specified URL
- Check backend URL in extension popup
- Look for API errors in Console

### Stats not updating?
- Clear stats using "Clear Stats" button
- Refresh the page and play a video

## Future Enhancements

- [ ] YouTube player support
- [ ] Caption/subtitle detection
- [ ] ML-based confidence scoring
- [ ] User preferences UI
- [ ] Keyboard shortcuts
- [ ] Analytics dashboard
- [ ] Firefox support

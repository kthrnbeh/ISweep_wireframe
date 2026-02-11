ISweep Chrome Extension

ISweep is a local-first content filtering Chrome extension that automatically mutes, skips, or fast-forwards video content based on your preferences for language, violence, and sexual content.

Filtering actions are applied immediately and locally. An optional backend enhances the system with audio transcription (ASR) and future ML-based analysis, but ISweep continues working even if the backend is unavailable.

Core Principles

Local-first: Filtering actions run in the browser with no required backend.

Real-time: Videos are detected and handled as they play.

User-controlled: You define what categories are filtered and how.

Resilient: Backend outages do not break core functionality.

Features

✅ Detects HTML5 <video> elements on any site
✅ Automatically applies actions: mute, skip, fast-forward, or none
✅ Per-category controls (language, violence, sexual content)
✅ Full-page Settings / Options UI (opens in a tab, not embedded)
✅ Popup dashboard with live stats (videos detected, actions applied)
✅ Optional ASR (audio transcription) via offscreen audio capture
✅ Works with dynamically loaded videos (MutationObserver)

Installation (Development)

Open Chrome and navigate to chrome://extensions

Enable Developer mode (top-right)

Click Load unpacked

Select the isweep-chrome-extension/ folder

The ISweep icon will appear in the toolbar

Using ISweep
Popup (Quick Controls)

Enable / disable ISweep

View live stats:

Videos detected

Actions applied

Open:

Sidebar

Full Settings

Test actions:

Mute on this tab

Timed mute (debug)

Full Settings (Options Page)

Opened via “Open full settings” — always opens in a full browser tab.

You can configure:

Categories

Language

Violence

Sexual content

Per-category behavior

Action: mute / skip / fast-forward / none

Duration (seconds)

Caption timing offset

Preset word packs

Custom words / phrases

All settings are saved locally and applied instantly.

How It Works
Video Detection

Scans pages for HTML5 <video> elements

Uses MutationObserver to catch dynamically added videos

Tracks videos per tab

Action Engine (Local)

Video playback is observed

Local preferences (isweepPrefs) are evaluated

The selected action is applied immediately:

video.muted = true

video.currentTime += N

video.playbackRate = 2.0

No network request is required for actions to occur.

ASR (Optional Backend Integration)

ISweep can optionally capture tab audio and send it to a backend for automatic speech recognition.

ASR is enabled by default

Runs via Chrome’s offscreen document

Used for:

Transcription

Future classification / ML enrichment

Core filtering does not depend on ASR availability

Backend Configuration

Popup fields:

User ID

Backend URL (e.g. http://127.0.0.1:8001)

If the backend is unreachable:

Filtering continues locally

No user intervention required

Project Structure
isweep-chrome-extension/
├── manifest.json          # MV3 configuration
├── popup.html             # Popup UI
├── popup.js               # Popup logic & messaging
├── options.html           # Full settings page (tab)
├── options.css            # Settings UI styles
├── options.js             # Settings logic & storage
├── plumbing.js            # Content script (video control)
├── offscreen.html         # Offscreen ASR document
├── offscreen.js           # Audio capture + ASR transport
├── background.js          # Service worker
├── icons/                 # Extension icons
└── README.md

Storage & State

Key local storage objects:

isweepPrefs — filtering rules and actions

asrEnabled — ASR state (default: true)

Session counters — stats displayed in popup

Console Logging

Use Chrome DevTools → Console:

[ISweep] Videos detected: N

[ISweep] Action applied: mute / skip / fast-forward

[ISweep] ASR active

[ISweep] Preferences updated

Troubleshooting
Options page looks narrow or broken

Ensure settings are opened via “Open full settings”

Reload extension and hard-refresh the options tab (Ctrl+Shift+R)

Actions not triggering

Confirm ISweep is enabled in the popup

Verify category actions are not set to “None”

Test with the popup “Test mute” button

Backend not responding

Filtering still works without backend

Check backend URL and logs if ASR is required

Roadmap (Intentional & Realistic)

🔜 Improved per-event logs and session history

🔜 Confidence-based filtering (ASR + ML)

🔜 User profiles / presets

🔜 Firefox support

🔜 Analytics dashboard (local + optional backend)

Philosophy

ISweep prioritizes control, reliability, and simplicity:

Your rules

Your device

Your media

No surprises
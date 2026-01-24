# ISweep Icon Setup Guide

## Overview
The extension now dynamically changes icons when toggled ON/OFF using `chrome.action.setIcon()`.

## Required Icon Files

Create the following icon PNG files in the `icons/` directory:

### ON Icons (When ISweep is enabled)
- `icons/icon-16-on.png` (16x16 pixels)
- `icons/icon-48-on.png` (48x48 pixels)
- `icons/icon-128-on.png` (128x128 pixels)

### OFF Icons (When ISweep is disabled)
- `icons/icon-16-off.png` (16x16 pixels)
- `icons/icon-48-off.png` (48x48 pixels)
- `icons/icon-128-off.png` (128x128 pixels)

## Design Recommendations

### ON Icons
- Use a bright green color (e.g., #27c93f or #22C55E)
- Visual indicator: ✓ or checkmark
- Can include the broom emoji 🧹

### OFF Icons
- Use a gray or muted color (e.g., #999999 or #757575)
- Visual indicator: ✗ or crossed out
- Dimmed appearance

## How It Works

1. **On Startup**: Extension defaults to OFF state and displays OFF icons
2. **On Toggle**: When user clicks toggle in popup.html:
   - State is saved to `chrome.storage.local`
   - Storage change triggers `chrome.storage.onChanged` listener
   - `updateIcon()` function swaps icon set based on enabled state
   - All open tabs are notified via `chrome.tabs.sendMessage()`

## Icon Path References

The background.js script automatically constructs paths:
```javascript
// When enabled = true
icons/icon-16-on.png
icons/icon-48-on.png
icons/icon-128-on.png

// When enabled = false
icons/icon-16-off.png
icons/icon-48-off.png
icons/icon-128-off.png
```

No manifest.json changes are needed - the dynamic `setIcon()` API handles all icon switching at runtime.

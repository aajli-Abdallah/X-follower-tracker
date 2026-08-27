# X Follower Tracker & Enhancer

Adds author follower badges (e.g. `?? 12.3K`) next to timestamps and automatically expands "Show more" posts across your X (Twitter) timeline.

## Features & Options (v1.1.0)

- **Auto-Expand "Show more"**: Automatically unfolds long-form posts on your timeline.
- **Author Follower Badges**: Shows each author's follower count directly next to post timestamps.
- **Extension Popup**: Click the extension icon to toggle settings or clear cache. Changes sync immediately to all open tabs.

## Install (unpacked, for development/personal use)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `x-follower-badge` folder.
4. Open `x.com` (make sure you're logged in) and scroll your feed.

## Files

- `manifest.json` ? extension config (Manifest V3)
- `content.js` ? finds tweets, auto-expands "Show more", resolves follower counts, injects badges
- `popup.html` ? settings popup UI
- `popup.css` ? popup styling
- `popup.js` ? popup interaction & storage sync
- `styles.css` ? badge styling
- `icons/` ? extension icons

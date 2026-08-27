# X Follower Tracker & Enhancer (Chrome Extension) 👥✨

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen.svg)](x-follower-badge/manifest.json)
[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](x-follower-badge/manifest.json)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Available-blue?logo=googlechrome)](https://chromewebstore.google.com/detail/x-follower-badge/ndhpilocfkkgojkbamejgngmmnfaljin)
[![Browser Support](https://img.shields.io/badge/browsers-Chrome%20%7C%20Brave%20%7C%20Edge-orange.svg)](#installation)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A lightweight Chromium browser extension (Manifest V3) that enriches your X (Twitter) browsing experience by displaying author follower count badges (e.g., `👥 12.3K`) next to timestamps and automatically expanding long posts ("Show more") across your timeline.

Available on the [Chrome Web Store](https://chromewebstore.google.com/detail/x-follower-badge/ndhpilocfkkgojkbamejgngmmnfaljin).

---

## ✨ Features

- **Auto-Expand "Show more" (v1.1.0)**: Automatically unfolds all loaded long-form posts on your timeline so you never have to manually click "Show more" again. Can be toggled on/off anytime.
- **Inline Follower Badges**: Shows author follower counts next to post timestamps on your timeline.
- **Interactive Settings Popup**: Fast, dark-mode extension popup to toggle features and manage cached data with live synchronization across open tabs.
- **Smart Caching Layer**: Multi-tier caching (in-memory Map + `chrome.storage.local`) with a 6-hour TTL to prevent redundant network requests.
- **Request Throttling**: Queues and throttles GraphQL requests (~1.2s gap) to respect rate limits and keep the browsing experience smooth.
- **Zero API Key Setup**: Uses your active browser session on `x.com` / `twitter.com`.
- **Dynamic Timeline Support**: Observes dynamic feed updates and Infinite Scroll via `MutationObserver`.

---

## 🚀 Installation

Works with **Google Chrome**, **Brave**, **Microsoft Edge**, and any Chromium-based browser.

### Option 1: Chrome Web Store (Recommended)
Install directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/x-follower-badge/ndhpilocfkkgojkbamejgngmmnfaljin).

### Option 2: Load Unpacked (Development)
1. **Clone or download** this repository:
   ```bash
   git clone https://github.com/aajli-Abdallah/X-follower-tracker.git
   ```
2. Open your browser's extension management page:
   - **Chrome**: `chrome://extensions`
   - **Brave**: `brave://extensions`
   - **Edge**: `edge://extensions`
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the `x-follower-badge` folder inside this repository.
6. Open [x.com](https://x.com) (ensure you are logged in) ? enjoy automatic "Show more" expansions and author follower badges!

---

## ⚙️ Configuration & Options

Click the extension icon in your browser toolbar to open the settings popup:

- **Auto-Expand "Show more"**: Toggle on to automatically expand truncated posts; toggle off to restore standard manual "Show more" behavior.
- **Author Follower Badges**: Toggle follower count badges on or off.
- **Clear Cache**: Clears stored profile data to force fresh queries if needed.

---

## 📁 Project Structure

```
??? .gitignore                  # Git ignore rules for browser extension projects
??? README.md                   # Project documentation & installation guide
??? x-follower-badge/           # Extension root (load this directory in Chrome)
    ??? manifest.json           # Manifest V3 configuration & permissions
    ??? content.js              # Content script (DOM observer, auto-expand, API query)
    ??? popup.html              # Settings popup interface
    ??? popup.css               # Settings popup styling
    ??? popup.js                # Settings controller & sync
    ??? styles.css              # Badge styling and themes
    ??? icons/                  # Extension icons (16px, 48px, 128px)
    ??? README.md               # Extension-specific notes
```

---

## 🔧 Troubleshooting & Known Limitations

- **Authentication Required**: You must be logged into X in the active browser tab.
- **Internal GraphQL Query ID**: X periodically updates GraphQL query hashes. If badges display `?` error states:
  1. Open DevTools (`F12`) on X, go to the **Network** tab, and filter by `UserByScreenName`.
  2. Hover over any profile card to trigger the request.
  3. Copy the updated query ID from the request URL (`/i/api/graphql/<QUERY_ID>/UserByScreenName`).
  4. Update `QUERY_ID` at the top of `x-follower-badge/content.js` and reload the extension in `chrome://extensions`.

---

## 🏷️ Release Notes

### v1.1.0
- **Added Auto-Expand "Show more" feature**: Automatically expands truncated posts across the timeline when enabled.
- **Added Extension Popup Settings UI**: Allows enabling/disabling Auto-Expand and Follower Badges with live sync.
- **Added Cache Management**: Easily inspect cached profiles count and clear cache from popup.
- **Added extension icons**: Bundled high-resolution extension icons.

### v1.0.1
- Added standard `.gitignore` for extension projects.
- Bumped extension version to `1.0.1` in `manifest.json`.
- Enhanced badge styling and hover transition effects.

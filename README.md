# X Follower Tracker (Chrome Extension) 👥✨

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen.svg)](x-follower-badge/manifest.json)
[![Version](https://img.shields.io/badge/version-1.0.1-blue.svg)](x-follower-badge/manifest.json)
[![Browser Support](https://img.shields.io/badge/browsers-Chrome%20%7C%20Brave%20%7C%20Edge-orange.svg)](#installation)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A lightweight Chromium browser extension (Manifest V3) that injects an author follower count badge (e.g., `👥 12.3K`) directly next to the timestamp on every post across your X (Twitter) timeline.
# chromewebstore
https://chromewebstore.google.com/detail/x-follower-badge/ndhpilocfkkgojkbamejgngmmnfaljin
---

## ✨ Features

- **Inline Follower Badges**: Shows author follower counts next to post timestamps on your timeline.
- **Smart Caching Layer**: Multi-tier caching (in-memory Map + `chrome.storage.local`) with a 6-hour TTL to prevent redundant network requests.
- **Request Throttling**: Queues and throttles GraphQL requests (~1.2s gap) to respect rate limits and keep the browsing experience smooth.
- **Zero API Key Setup**: Uses your active browser session on `x.com` / `twitter.com`.
- **Dynamic Timeline Support**: Observes dynamic feed updates and Infinite Scroll via `MutationObserver`.

---

## 🚀 Installation

Works with **Google Chrome**, **Brave**, **Microsoft Edge**, and any Chromium-based browser.

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
6. Open [x.com](https://x.com) (ensure you are logged in) and scroll your timeline — badges will appear next to post timestamps!

---

## ⚙️ How It Works

1. **DOM Monitoring**: Uses `MutationObserver` to watch for `article[data-testid="tweet"]` elements.
2. **Handle Resolution**: Extracts the author's screen name from the status permalink timestamp.
3. **Session Querying**: Calls X's internal GraphQL endpoint (`UserByScreenName`) utilizing the active `ct0` CSRF cookie and public client bearer authorization.
4. **Badge Injection**: Formats the numerical count (e.g., `1.2K`, `3.4M`) and injects a styled pill badge next to the `<time>` link.

---

## 📁 Project Structure

```
├── .gitignore                  # Git ignore rules for browser extension projects
├── README.md                   # Project documentation & installation guide
└── x-follower-badge/           # Extension root (load this directory in Chrome)
    ├── manifest.json           # Manifest V3 configuration & permissions
    ├── content.js              # Content script (DOM observer, caching, API query)
    ├── styles.css              # Badge styling and themes
    └── README.md               # Extension-specific notes
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

## 🏷️ Release Notes (v1.0.1)

- Added standard `.gitignore` for extension projects.
- Bumped extension version to `1.0.1` in `manifest.json`.
- Enhanced badge styling and hover transition effects.
- Added comprehensive repository documentation and installation guide.

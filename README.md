# X Follower Tracker & Enhancer (Chrome Extension) 👥⚡

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen.svg)](x-follower-badge/manifest.json)
[![Version](https://img.shields.io/badge/version-2.0.3-blue.svg)](x-follower-badge/manifest.json)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Available-blue?logo=googlechrome)](https://chromewebstore.google.com/detail/x-follower-badge/ndhpilocfkkgojkbamejgngmmnfaljin)
[![Browser Support](https://img.shields.io/badge/browsers-Chrome%20%7C%20Brave%20%7C%20Edge-orange.svg)](#installation)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A high-performance Chromium browser extension (Manifest V3) that enriches your X (Twitter) experience with **0ms instant follower badges**, **quality & trust signals**, **custom user tags & private notes (CRM-Lite)**, **feed dimming**, and **automatic "Show more" expansion**.

Available on the [Chrome Web Store](https://chromewebstore.google.com/detail/x-follower-badge/ndhpilocfkkgojkbamejgngmmnfaljin).

---

## ✨ Features (v2.0.0)

### ⚡ 1. Zero-Network Request Interceptor (0ms Latency)
- Injects directly into the page context (`MAIN` world) to passively extract author metadata from X's native GraphQL timeline responses (`HomeTimeline`, `TweetDetail`, `UserTweets`).
- **Zero extra network requests** and **zero rate limits**.
- **Immune to stale Query IDs**: Auto-detects live GraphQL query IDs directly from browser traffic.
- Fallback queued fetcher retained for SSR or edge-case cached tweets.

### 🏷️ 2. Custom User Tags & Private Notes (CRM-Lite)
- **Tag Any Account**: Tag users directly from your timeline with preset chips (`[Founder]`, `[VC]`, `[Dev]`, `[Recruiter]`, `[VIP]`, `[Spam]`) or custom tags.
- **Private Notes**: Jot down quick local notes for any user (e.g., *"Met at SF AI meetup", "Senior Rust dev"*).
- **Timeline Presence**: Tags appear as sleek colored pills right beside follower badges.
- **Popup CRM Directory**: Search, edit, and delete tagged users in one place.
- **1-Click Export**: Export your CRM directory anytime to **CSV** or **JSON**.

### 🛡️ 3. Trust & Quality Signals
- **Follower-to-Following Ratio**: Instant ratio indicator (e.g., `🎯 14.5x`) to differentiate authentic creators from follow-for-follow bots.
- **New Account Alert**: Highlights accounts created within the last 30 days (`🐣 New`) to flag burner spam.

### 📇 4. Interactive Rich Hover Card
- Click on any follower badge to open an inline profile card:
  - Total followers, following, and ratio
  - Account join date & age (e.g. *Joined Jul 2021 · 5y ago*)
  - Manage active tags with 1-click removal
  - Quick-preset tagging buttons & custom tag input
  - Auto-saving private notes textarea

### 🔍 5. Feed Filtering & Low-Follower Dimmer
- Dim or de-emphasize low-follower accounts (e.g., < 50 followers) with an adjustable threshold in settings.
- Restores full opacity on hover so you never miss context (configurable).

### 📖 6. Auto-Expand "Show more"
- Automatically unfolds long posts across your timeline so you never have to click "Show more" again.

### 🎬 7. Video Speed Controller & Power Tools (v2.0.3)
- Floating on-video overlay with speed controls (**0.25x – 4.0x**), presets, and `−0.1x` / `+0.1x` steppers.
- **Quick Seek (±5s)** rewind and forward buttons.
- **Picture-in-Picture (PiP)** and high-resolution **Frame Screenshot (PNG)** capture.
- **Audio Volume Booster (up to 300%)** via Web Audio API.
- **Auto-Hide** on idle to prevent obstructing subtitles.
- Dedicated **Video** settings tab in the popup dashboard.

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
6. Open [x.com](https://x.com) (ensure you are logged in) — enjoy instant follower badges, CRM tags, and rich cards!

---

## 📁 Project Structure

```
├── .gitignore                  # Git ignore rules for browser extension projects
├── README.md                   # Project documentation & release guide
└── x-follower-badge/           # Extension root (load this directory in Chrome)
    ├── manifest.json           # Manifest V3 configuration & MAIN world scripts
    ├── interceptor.js          # Zero-network response sniffer (MAIN world)
    ├── content.js              # Content script (DOM observer, badge injector, CRM & hover card)
    ├── popup.html              # Tabbed settings & CRM directory UI
    ├── popup.css               # Popup styling & modern dark theme
    ├── popup.js                # Settings controller, search filter & CSV/JSON export
    ├── styles.css              # Badge styling, tag pills, dimmer, and hover card
    ├── icons/                  # High-resolution extension icons (16px, 48px, 128px)
    └── README.md               # Extension-specific quick start guide
```

---

## 🏷️ Release Notes

### v2.0.3
- **🎬 X Video Speed Controller**: Full video speed overlay ported and adapted from the FB Video Speed project:
  - Compact pill badge (`⚡ 1.5x`) that expands on hover/click into full controls tray.
  - Speed presets (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x) — fully customizable from the new **Video** popup tab.
  - Fine `−0.1x` / `+0.1x` step buttons for granular control.
  - **Quick Seek** ±5s jump buttons.
  - **Picture-in-Picture** button to float any X video in a detachable mini-player.
  - **Frame Screenshot** — download any video frame as a high-resolution PNG.
  - **Audio Boost** up to 300% using Web Audio API GainNode (cycle via button or set in popup).
  - **Auto-Hide** after 2s of inactivity so subtitles/captions are never obscured.
  - **Overlay Position** chooser: top-right, top-left, bottom-right, or bottom-left.
  - React-immune position tracking via `IntersectionObserver` + `ResizeObserver` + rAF debouncing.
  - New **Video** tab in popup for full control over all overlay options.

### v2.0.2
- **Permanent Dimmer Lock on Hover**:
  - Fixed Twitter's React component re-renders that stripped the dimmed CSS class on mouseenter/hover.
  - Implemented CSS `:has(.xfb-badge-group[data-dimmed="true"])` selector targeting child badge elements that React cannot wipe.
  - Locked `:hover` opacity directly to `--xfb-dim-opacity` so low-follower posts strictly stay dimmed.
  - Slider range now extends all the way down to `0%` for complete post hiding.

### v2.0.1
- **Enhanced Low-Follower Dimmer**:
  - **Customizable Dimmed Opacity**: Added fine-tuned opacity slider (0% to 80%, default: 25%).
  - **Optional Hover Restore**: Dedicated toggle for whether hovering restores 100% opacity or keeps the post dimmed.
- **Direct React Fiber DOM Extraction**: Instant 0ms follower count pulled from React component tree for SSR feeds and initial timeline posts.
- **Bidirectional Interceptor Handshake**: Eliminated timing gaps with in-memory buffering.

### v2.0.0
- **Zero-Network Interceptor**: Extracts profile metadata from native timeline calls in 0ms without hitting rate limits.
- **Custom User Tags & Notes (CRM-Lite)**: Full timeline tagging system with persistent local notes.
- **Interactive Rich Hover Card**: Popover interface to view detailed metrics, manage tags, and write private notes.
- **Trust & Quality Signals**: Added Follower/Following ratio badges and 30-day new account warnings.
- **Low-Follower Dimmer**: Configurable threshold dimmer for low-follower/spam accounts.
- **Popup UI Overhaul**: Tabbed layout featuring Settings, CRM Directory, and Engine Health & Cache controls.
- **Data Export**: Export saved CRM data to CSV and JSON formats.
- **Auto-Healing Query ID**: Auto-detects live GraphQL query IDs from web app traffic.
- **New Modern Icon Set**: Pixel-perfect squircle icons in 16px, 48px, and 128px.

### v1.1.0
- Added Auto-Expand "Show more" feature for long posts.
- Added Settings popup UI with live storage sync.
- Added multi-tier cache with 6-hour TTL.

### v1.0.1
- Initial release with author follower count badges and GraphQL fetch queue.

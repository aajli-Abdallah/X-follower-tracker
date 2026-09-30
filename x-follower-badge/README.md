# X Follower Tracker & Enhancer (v2.0.2)

A powerful, lightweight Chromium extension (Manifest V3) that enriches your X (Twitter) experience with real-time author follower badges, trust & quality signals, inline CRM tagging & private notes, and automatic "Show more" post expansion.

## 🚀 What's New in v2.0.2

- 🔒 **Permanent Dimmer Lock on Hover**:
  - Fixed Twitter's React component re-renders that previously stripped the dimmed class when hovering.
  - Implemented CSS `:has(.xfb-badge-group[data-dimmed="true"])` selector targeting child badge elements that React cannot wipe.
  - Locked `:hover` opacity directly to `--xfb-dim-opacity` so low-follower posts strictly stay dimmed.
  - Slider range now extends all the way down to `0%` for complete post hiding.
- 🎛️ **Enhanced Dimmer Controls**:
  - **Customizable Dimmed Opacity**: Slider to adjust opacity from 0% to 80% (default: 25%).
  - **Optional Hover Restore**: Dedicated toggle if you ever want hover to restore full opacity.
- ⚡ **React Fiber Extraction Engine**: Instant 0ms badge rendering directly from DOM React components with zero network requests.

## 🛠️ Installation (Developer Mode)

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select this `x-follower-badge` directory.
4. Open [x.com](https://x.com) (make sure you are logged in).

## 📁 Architecture Files

- `manifest.json` — Manifest V3 configuration, permissions, and MAIN-world content scripts.
- `interceptor.js` — Zero-network payload sniffer running in MAIN world (page context).
- `content.js` — DOM observer, badge injector, CRM manager, and hover card engine.
- `popup.html` — Tabbed settings UI (Settings, CRM Directory, Engine status).
- `popup.css` — Modern GitHub/Twitter dark theme styling.
- `popup.js` — Popup controller, search filter, export handlers, and live storage sync.
- `styles.css` — Badge pills, tag badges, hover card, and dimmer styles.
- `icons/` — Pixel-perfect 16px, 48px, and 128px extension icons.

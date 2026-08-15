# X Follower Badge

Adds a small "👥 12.3K" badge right next to the timestamp on every post in your X (Twitter) timeline, showing that post's author's follower count.

## Install (unpacked, for development/personal use)

1. Unzip this folder somewhere permanent (don't delete it after installing).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `x-follower-badge` folder.
5. Open `x.com` (make sure you're logged in) and scroll your feed — badges will fade in next to timestamps within a second or two.

## How it works

X doesn't put follower counts in a tweet's HTML. This extension calls X's internal `UserByScreenName` GraphQL endpoint — the same one the site itself uses when you hover a profile — using your existing logged-in session (your `ct0` cookie) plus X's public web-client bearer token. Results are cached per handle for 6 hours (in `chrome.storage.local`) so the same author isn't re-fetched on every scroll, and requests are throttled to one every ~1.2s.

## Known limitations

- **You must be logged into X** in that tab — logged-out/guest sessions won't have the cookie this needs.
- **This is an undocumented, internal API.** X can change the query ID or response shape at any time, which will break the badge (you'll see a `?` badge instead of a count). If that happens:
  1. Open X in Chrome, open DevTools → Network tab, filter for `UserByScreenName`.
  2. Hover a profile card or visit a profile to trigger the request.
  3. Copy the new query ID from the request URL (`/i/api/graphql/<QUERY_ID>/UserByScreenName`) into `content.js`.
- Heavy scrolling through very active feeds will queue up a lot of lookups; they resolve gradually rather than all at once, by design, to avoid hammering the endpoint.
- Selectors are based on X's current DOM structure (`article[data-testid="tweet"]`, etc.) and may need updating if X redesigns the timeline markup.

## Files

- `manifest.json` — extension config (Manifest V3)
- `content.js` — finds tweets, resolves follower counts, injects badges
- `styles.css` — badge styling

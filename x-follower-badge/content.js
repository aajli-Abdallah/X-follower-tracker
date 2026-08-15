// X Follower Badge — content script
// Adds a small "follower count" badge next to the timestamp on every tweet.
//
// How it works:
// 1. Watches the DOM for tweet <article> elements.
// 2. For each tweet, figures out the author's @handle from the timestamp's
//    permalink (the <a href="/handle/status/123"> that wraps <time>).
// 3. Looks up the follower count for that handle (cached), via X's internal
//    GraphQL "UserByScreenName" endpoint — the same call the site itself
//    makes when you hover a profile card. This requires you to be logged in.
// 4. Inserts a small pill badge right after the timestamp.
//
// NOTE: This relies on an undocumented endpoint (query id + bearer token)
// that X can change at any time. If badges stop appearing, see the README
// for how to find the current query id in devtools.

(() => {
  const QUERY_ID = "G3KGOASz96M-Qu0nwmGXNg"; // UserByScreenName — may go stale, see README
  const BEARER =
    "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
  const REQUEST_GAP_MS = 1200; // throttle between API calls

  const processedTweets = new WeakSet();
  const memoryCache = new Map(); // handle -> { count, ts }
  const queue = [];
  let draining = false;

  function log(...args) {
    console.debug("[XFollowerBadge]", ...args);
  }

  function formatCount(n) {
    if (n >= 1_000_000) {
      const v = n / 1_000_000;
      return (Number.isInteger(v) ? v : v.toFixed(1)) + "M";
    }
    if (n >= 1_000) {
      const v = n / 1_000;
      return (Number.isInteger(v) ? v : v.toFixed(1)) + "K";
    }
    return String(n);
  }

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|; )ct0=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  async function fetchFollowerCount(handle) {
    const csrf = getCsrfToken();
    if (!csrf) throw new Error("no ct0 csrf cookie found — are you logged in?");

    const variables = encodeURIComponent(
      JSON.stringify({ screen_name: handle, withSafetyModeUserFields: true })
    );
    const features = encodeURIComponent(
      JSON.stringify({
        hidden_profile_likes_enabled: true,
        hidden_profile_subscriptions_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        subscriptions_verification_info_is_identity_verified_enabled: true,
        subscriptions_verification_info_verified_since_enabled: true,
        highlights_tweets_tab_ui_enabled: true,
        responsive_web_twitter_article_notes_tab_enabled: true,
        subscriptions_feature_can_gift_premium: true,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true,
      })
    );

    const url = `https://${location.hostname}/i/api/graphql/${QUERY_ID}/UserByScreenName?variables=${variables}&features=${features}`;

    const res = await fetch(url, {
      credentials: "include",
      headers: {
        authorization: `Bearer ${BEARER}`,
        "x-csrf-token": csrf,
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "content-type": "application/json",
      },
    });

    if (!res.ok) throw new Error(`request failed: ${res.status}`);
    const data = await res.json();
    const count = data?.data?.user?.result?.legacy?.followers_count;
    if (typeof count !== "number") throw new Error("followers_count missing from response");
    return count;
  }

  function readCache(handle) {
    const mem = memoryCache.get(handle);
    if (mem && Date.now() - mem.ts < CACHE_TTL_MS) return mem.count;
    return undefined;
  }

  function writeCache(handle, count) {
    const entry = { count, ts: Date.now() };
    memoryCache.set(handle, entry);
    chrome.storage.local.set({ [`xfb:${handle}`]: entry }).catch(() => {});
  }

  async function hydrateFromStorage(handle) {
    try {
      const key = `xfb:${handle}`;
      const stored = await chrome.storage.local.get(key);
      const entry = stored[key];
      if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
        memoryCache.set(handle, entry);
        return entry.count;
      }
    } catch (_) {
      /* ignore */
    }
    return undefined;
  }

  function enqueue(task) {
    queue.push(task);
    drainQueue();
  }

  async function drainQueue() {
    if (draining) return;
    draining = true;
    while (queue.length) {
      const task = queue.shift();
      try {
        await task();
      } catch (err) {
        log("task failed", err);
      }
      await new Promise((r) => setTimeout(r, REQUEST_GAP_MS));
    }
    draining = false;
  }

  function findPermalinkAnchor(article) {
    const timeEl = article.querySelector("time");
    if (!timeEl) return null;
    return timeEl.closest('a[href*="/status/"]');
  }

  function getHandleForTweet(article) {
    const link = findPermalinkAnchor(article);
    if (!link) return null;
    const href = link.getAttribute("href") || "";
    const match = href.match(/^\/([^\/]+)\/status\//);
    return match ? match[1] : null;
  }

  function makeBadge(text, isError = false) {
    const span = document.createElement("span");
    span.className = "xfb-badge" + (isError ? " xfb-badge--error" : "");
    span.textContent = text;
    return span;
  }

  function insertBadge(article, badge) {
    const link = findPermalinkAnchor(article);
    if (!link || !link.parentElement) return;
    // avoid duplicate badges if this tweet gets reprocessed
    const existing = link.parentElement.querySelector(":scope > .xfb-badge");
    if (existing) existing.remove();
    link.insertAdjacentElement("afterend", badge);
  }

  async function processTweet(article) {
    if (processedTweets.has(article)) return;
    const handle = getHandleForTweet(article);
    if (!handle) return;
    processedTweets.add(article);

    const cached = readCache(handle);
    if (cached !== undefined) {
      insertBadge(article, makeBadge(`👥 ${formatCount(cached)}`));
      return;
    }

    const placeholder = makeBadge("···");
    insertBadge(article, placeholder);

    enqueue(async () => {
      let count = await hydrateFromStorage(handle);
      if (count === undefined) {
        count = await fetchFollowerCount(handle).catch((err) => {
          log(`failed for @${handle}:`, err.message);
          return undefined;
        });
        if (count !== undefined) writeCache(handle, count);
      }

      // article may have scrolled out and been recycled by React by now;
      // re-find the placeholder via the current DOM state defensively.
      if (count === undefined) {
        placeholder.textContent = "?";
        placeholder.classList.add("xfb-badge--error");
        placeholder.title = "Couldn't load follower count";
      } else {
        placeholder.textContent = `👥 ${formatCount(count)}`;
        placeholder.title = `${count.toLocaleString()} followers`;
      }
    });
  }

  function scan(root = document) {
    root.querySelectorAll('article[data-testid="tweet"]').forEach(processTweet);
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.('article[data-testid="tweet"]')) {
          processTweet(node);
        } else {
          scan(node);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scan();
})();

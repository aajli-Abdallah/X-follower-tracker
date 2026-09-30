// X Follower Tracker & Enhancer - Zero-Network Interceptor (v2.0.2)
// Runs in MAIN world (page context).
// Extracts author metadata from:
// 1. React Fiber instances on DOM nodes (Instant 0ms, covers SSR & initial tweets)
// 2. Intercepted fetch / XHR timeline responses
// 3. Twitter's live Webpack bundle query ID registry

(() => {
  if (window.__XFB_INTERCEPTOR_INITIALIZED__) return;
  window.__XFB_INTERCEPTOR_INITIALIZED__ = true;

  // Global buffer so content.js can retrieve profiles anytime without missing messages
  if (!window.__XFB_BUFFER__) {
    window.__XFB_BUFFER__ = new Map();
  }

  function emitProfiles(profiles) {
    if (!profiles || !profiles.length) return;
    for (const p of profiles) {
      if (p && p.handle) {
        window.__XFB_BUFFER__.set(p.handle.toLowerCase(), p);
      }
    }
    window.postMessage(
      {
        type: "__XFB_PROFILES_INTERCEPTED__",
        profiles,
      },
      "*"
    );
  }

  function emitQueryId(queryId) {
    if (!queryId) return;
    window.__XFB_LIVE_QUERY_ID__ = queryId;
    window.postMessage(
      {
        type: "__XFB_QUERY_ID_DETECTED__",
        queryId,
      },
      "*"
    );
  }

  // --- 1. React Fiber DOM Extraction (0ms, 100% reliable for SSR & initial feed) ---

  function extractUserFromFiber(element) {
    try {
      const fiberKey = Object.keys(element).find(
        (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
      );
      if (!fiberKey) return null;

      let fiber = element[fiberKey];
      let depth = 0;

      while (fiber && depth < 25) {
        const props = fiber.memoizedProps;
        if (props) {
          // Look for tweet object inside props
          const tweet =
            props.tweet ||
            props.item?.content?.tweetResult?.result ||
            props.itemContent?.tweet_results?.result ||
            props.result;

          if (tweet) {
            const userResult = tweet.core?.user_results?.result || tweet.user_results?.result;
            const legacy =
              userResult?.legacy ||
              userResult?.user?.legacy ||
              tweet.user?.legacy ||
              tweet.user ||
              props.user;

            if (legacy && typeof legacy.followers_count === "number" && legacy.screen_name) {
              return {
                handle: legacy.screen_name.toLowerCase(),
                screenName: legacy.screen_name,
                name: legacy.name || legacy.screen_name,
                followers: legacy.followers_count,
                following: legacy.friends_count ?? null,
                createdAt: legacy.created_at ?? null,
                avatar: legacy.profile_image_url_https || null,
                verified: Boolean(userResult?.is_blue_verified || legacy.verified),
              };
            }
          }

          // Direct user prop
          if (props.user && typeof props.user.followers_count === "number" && props.user.screen_name) {
            return {
              handle: props.user.screen_name.toLowerCase(),
              screenName: props.user.screen_name,
              name: props.user.name || props.user.screen_name,
              followers: props.user.followers_count,
              following: props.user.friends_count ?? null,
              createdAt: props.user.created_at ?? null,
              avatar: props.user.profile_image_url_https || null,
              verified: Boolean(props.user.is_blue_verified || props.user.verified),
            };
          }
        }
        fiber = fiber.return;
        depth++;
      }
    } catch (_) {}
    return null;
  }

  function scanDomTweets() {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    const discovered = [];
    articles.forEach((art) => {
      const profile = extractUserFromFiber(art);
      if (profile && !window.__XFB_BUFFER__.has(profile.handle)) {
        discovered.push(profile);
      }
    });
    if (discovered.length > 0) {
      emitProfiles(discovered);
    }
  }

  // --- 2. Live Webpack Query ID Hunter ---

  function findWebpackQueryId() {
    try {
      const chunks = window.webpackChunk_twitter_responsive_web;
      if (!chunks || !Array.isArray(chunks)) return null;
      for (const chunk of chunks) {
        const modules = chunk[1];
        if (!modules) continue;
        for (const modId of Object.keys(modules)) {
          const fnStr = String(modules[modId]);
          if (fnStr.includes("UserByScreenName") && fnStr.includes("queryId")) {
            const match = fnStr.match(/queryId:\s*["']([a-zA-Z0-9_-]+)["']/);
            if (match && match[1]) {
              return match[1];
            }
          }
        }
      }
    } catch (_) {}
    return null;
  }

  // --- 3. Iterative JSON Payload Parser (No stack recursion overflow) ---

  function extractUsersFromPayload(root) {
    const extracted = new Map();
    if (!root || typeof root !== "object") return extracted;

    const stack = [root];
    let count = 0;

    while (stack.length > 0 && count < 6000) {
      count++;
      const obj = stack.pop();
      if (!obj || typeof obj !== "object") continue;

      // Handles standard User and UserWithVisibilityResults
      const legacy = obj.legacy || (obj.user && obj.user.legacy);
      if (legacy && typeof legacy.followers_count === "number" && legacy.screen_name) {
        const handle = legacy.screen_name.toLowerCase();
        if (!extracted.has(handle)) {
          extracted.set(handle, {
            handle,
            screenName: legacy.screen_name,
            name: legacy.name || legacy.screen_name,
            followers: legacy.followers_count,
            following: legacy.friends_count ?? null,
            createdAt: legacy.created_at ?? null,
            avatar: legacy.profile_image_url_https || null,
            verified: Boolean(obj.is_blue_verified || legacy.verified || (obj.user && obj.user.is_blue_verified)),
            description: legacy.description || null,
          });
        }
      }

      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          if (obj[i] && typeof obj[i] === "object") stack.push(obj[i]);
        }
      } else {
        for (const key of Object.keys(obj)) {
          if (key === "entities" || key === "display_text_range") continue;
          const val = obj[key];
          if (val && typeof val === "object") stack.push(val);
        }
      }
    }

    return extracted;
  }

  function handleJsonResponse(url, data) {
    try {
      const queryMatch = url.match(/\/i\/api\/graphql\/([a-zA-Z0-9_-]+)\/UserByScreenName/);
      if (queryMatch && queryMatch[1]) {
        emitQueryId(queryMatch[1]);
      }

      const userMap = extractUsersFromPayload(data);
      if (userMap.size > 0) {
        emitProfiles(Array.from(userMap.values()));
      }
    } catch (err) {
      console.debug("[XFB-Interceptor] Parsing error:", err);
    }
  }

  // --- 4. Network Hooks ---

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      if (url.includes("/i/api/") && (url.includes("graphql") || url.includes("UserByScreenName"))) {
        response
          .clone()
          .json()
          .then((data) => handleJsonResponse(url, data))
          .catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__xfb_url = typeof url === "string" ? url : "";
    return originalXhrOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        const url = this.__xfb_url || "";
        if (url.includes("/i/api/") && (url.includes("graphql") || url.includes("UserByScreenName"))) {
          if (this.responseType === "" || this.responseType === "text") {
            const data = JSON.parse(this.responseText);
            handleJsonResponse(url, data);
          } else if (this.responseType === "json") {
            handleJsonResponse(url, this.response);
          }
        }
      } catch (_) {}
    });
    return originalXhrSend.apply(this, args);
  };

  // --- 5. Handshake & DOM Observer ---

  // Respond immediately when content.js asks for cached buffer
  window.addEventListener("message", (e) => {
    if (!e.data || typeof e.data !== "object") return;

    if (e.data.type === "__XFB_SYNC_REQUEST__") {
      // Run quick DOM scan
      scanDomTweets();

      // Check webpack for live query ID
      const qId = findWebpackQueryId();
      if (qId) emitQueryId(qId);

      // Send all buffered profiles
      const allBuffered = Array.from(window.__XFB_BUFFER__.values());
      window.postMessage(
        {
          type: "__XFB_SYNC_RESPONSE__",
          profiles: allBuffered,
          queryId: window.__XFB_LIVE_QUERY_ID__ || qId || null,
        },
        "*"
      );
    }
  });

  // Observe DOM in MAIN world to extract React Fiber profiles as soon as tweets appear
  const domObserver = new MutationObserver(() => {
    scanDomTweets();
  });

  if (document.body) {
    domObserver.observe(document.body, { childList: true, subtree: true });
    scanDomTweets();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      domObserver.observe(document.body, { childList: true, subtree: true });
      scanDomTweets();
    });
  }

  // Periodic webpack check for query ID
  setTimeout(() => {
    const qId = findWebpackQueryId();
    if (qId) emitQueryId(qId);
  }, 2000);
})();

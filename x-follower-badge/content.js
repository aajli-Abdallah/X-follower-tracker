// X Follower Tracker & Enhancer - Content Script v2.0.2
// Features: Zero-Network Interceptor Bridge, CRM Tags & Notes, Trust Signals, Hover Card, Timeline Dimmer

(() => {
  let liveQueryId = "G3KGOASz96M-Qu0nwmGXNg";
  const BEARER =
    "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
  const REQUEST_GAP_MS = 1000;

  const settings = {
    autoExpandShowMore: true,
    showFollowerBadge: true,
    showRatio: true,
    showNewAccountWarning: true,
    showCrmTags: true,
    dimLowFollowers: false,
    minFollowerThreshold: 50,
    dimOpacity: 25,
    undimOnHover: false,
  };

  const processedTweets = new WeakMap(); // article -> handle
  const expandedElements = new WeakSet();
  const memoryCache = new Map(); // handle -> profile object
  let crmData = {}; // handle -> { tags: [], note: "", updatedAt: 0 }
  const queue = [];
  let draining = false;

  let activePopover = null;

  function log(...args) {
    console.debug("[XTracker]", ...args);
  }

  // --- Ensure Interceptor Injection ---
  function ensureInterceptorInjected() {
    if (document.getElementById("xfb-interceptor-script")) return;
    try {
      const script = document.createElement("script");
      script.id = "xfb-interceptor-script";
      script.src = chrome.runtime.getURL("interceptor.js");
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch (_) {}
  }

  // --- Sync Handshake with Interceptor ---
  function requestInterceptorSync() {
    window.postMessage({ type: "__XFB_SYNC_REQUEST__" }, "*");
  }

  // --- CRM Storage Engine ---

  async function loadCrmData() {
    try {
      const res = await chrome.storage.local.get("xfb_crm");
      crmData = res.xfb_crm || {};
    } catch (err) {
      log("Error loading CRM data:", err);
    }
  }

  async function saveCrmData() {
    try {
      await chrome.storage.local.set({ xfb_crm: crmData });
    } catch (err) {
      log("Error saving CRM data:", err);
    }
  }

  function getCrmUser(handle) {
    if (!handle) return null;
    return crmData[handle.toLowerCase()] || null;
  }

  async function addTagToUser(handle, tag) {
    if (!handle || !tag) return;
    handle = handle.toLowerCase();
    tag = tag.trim();
    if (!tag) return;

    if (!crmData[handle]) {
      crmData[handle] = { tags: [], note: "", updatedAt: Date.now() };
    }
    if (!crmData[handle].tags.includes(tag)) {
      crmData[handle].tags.push(tag);
      crmData[handle].updatedAt = Date.now();
      await saveCrmData();
      refreshTweetsForHandle(handle);
    }
  }

  async function removeTagFromUser(handle, tag) {
    if (!handle || !tag) return;
    handle = handle.toLowerCase();
    if (crmData[handle] && crmData[handle].tags) {
      crmData[handle].tags = crmData[handle].tags.filter((t) => t !== tag);
      crmData[handle].updatedAt = Date.now();
      if (crmData[handle].tags.length === 0 && !crmData[handle].note) {
        delete crmData[handle];
      }
      await saveCrmData();
      refreshTweetsForHandle(handle);
    }
  }

  async function saveUserNote(handle, note) {
    if (!handle) return;
    handle = handle.toLowerCase();
    if (!crmData[handle]) {
      crmData[handle] = { tags: [], note: "", updatedAt: Date.now() };
    }
    crmData[handle].note = note.trim();
    crmData[handle].updatedAt = Date.now();
    if (crmData[handle].tags.length === 0 && !crmData[handle].note) {
      delete crmData[handle];
    }
    await saveCrmData();
    refreshTweetsForHandle(handle);
  }

  // --- Settings & UI Classes ---

  function applySettingsClasses() {
    document.documentElement.classList.toggle("xfb-hide-badges", !settings.showFollowerBadge);
    document.documentElement.classList.toggle("xfb-hide-ratio", !settings.showRatio);
    document.documentElement.classList.toggle("xfb-hide-new-account", !settings.showNewAccountWarning);
    document.documentElement.classList.toggle("xfb-hide-tags", !settings.showCrmTags);
    document.documentElement.style.setProperty("--xfb-dim-opacity", (settings.dimOpacity / 100).toString());
    document.documentElement.classList.toggle("xfb-undim-on-hover", settings.undimOnHover);
  }

  async function loadSettings() {
    try {
      const stored = await chrome.storage.local.get([
        "autoExpandShowMore",
        "showFollowerBadge",
        "showRatio",
        "showNewAccountWarning",
        "showCrmTags",
        "dimLowFollowers",
        "minFollowerThreshold",
        "dimOpacity",
        "undimOnHover",
        "customQueryId",
      ]);
      if (stored.autoExpandShowMore !== undefined) settings.autoExpandShowMore = Boolean(stored.autoExpandShowMore);
      if (stored.showFollowerBadge !== undefined) settings.showFollowerBadge = Boolean(stored.showFollowerBadge);
      if (stored.showRatio !== undefined) settings.showRatio = Boolean(stored.showRatio);
      if (stored.showNewAccountWarning !== undefined) settings.showNewAccountWarning = Boolean(stored.showNewAccountWarning);
      if (stored.showCrmTags !== undefined) settings.showCrmTags = Boolean(stored.showCrmTags);
      if (stored.dimLowFollowers !== undefined) settings.dimLowFollowers = Boolean(stored.dimLowFollowers);
      if (stored.minFollowerThreshold !== undefined) settings.minFollowerThreshold = Number(stored.minFollowerThreshold);
      if (stored.dimOpacity !== undefined) settings.dimOpacity = Number(stored.dimOpacity);
      if (stored.undimOnHover !== undefined) settings.undimOnHover = Boolean(stored.undimOnHover);
      if (stored.customQueryId) liveQueryId = stored.customQueryId;
    } catch (err) {
      log("Error loading settings:", err);
    }
    applySettingsClasses();
    if (settings.autoExpandShowMore) {
      expandAllVisiblePosts();
    }
    applyDimmerToAll();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes.autoExpandShowMore !== undefined) {
      settings.autoExpandShowMore = Boolean(changes.autoExpandShowMore.newValue);
      if (settings.autoExpandShowMore) expandAllVisiblePosts();
    }
    if (changes.showFollowerBadge !== undefined) {
      settings.showFollowerBadge = Boolean(changes.showFollowerBadge.newValue);
      applySettingsClasses();
    }
    if (changes.showRatio !== undefined) {
      settings.showRatio = Boolean(changes.showRatio.newValue);
      applySettingsClasses();
    }
    if (changes.showNewAccountWarning !== undefined) {
      settings.showNewAccountWarning = Boolean(changes.showNewAccountWarning.newValue);
      applySettingsClasses();
    }
    if (changes.showCrmTags !== undefined) {
      settings.showCrmTags = Boolean(changes.showCrmTags.newValue);
      applySettingsClasses();
    }
    if (changes.dimLowFollowers !== undefined || changes.minFollowerThreshold !== undefined) {
      if (changes.dimLowFollowers !== undefined) settings.dimLowFollowers = Boolean(changes.dimLowFollowers.newValue);
      if (changes.minFollowerThreshold !== undefined) settings.minFollowerThreshold = Number(changes.minFollowerThreshold.newValue);
      applyDimmerToAll();
    }
    if (changes.dimOpacity !== undefined) {
      settings.dimOpacity = Number(changes.dimOpacity.newValue);
      applySettingsClasses();
    }
    if (changes.undimOnHover !== undefined) {
      settings.undimOnHover = Boolean(changes.undimOnHover.newValue);
      applySettingsClasses();
    }
    if (changes.xfb_crm !== undefined) {
      crmData = changes.xfb_crm.newValue || {};
      scan();
    }
    if (changes.customQueryId !== undefined) {
      liveQueryId = changes.customQueryId.newValue;
    }
  });

  // --- Interceptor Message Bridge ---
  function ingestProfiles(profiles) {
    if (!Array.isArray(profiles)) return;
    for (const profile of profiles) {
      if (!profile || !profile.handle) continue;
      const handle = profile.handle.toLowerCase();
      const entry = {
        count: profile.followers,
        following: profile.following,
        createdAt: profile.createdAt,
        name: profile.name,
        avatar: profile.avatar,
        verified: profile.verified,
        description: profile.description,
        ts: Date.now(),
      };
      memoryCache.set(handle, entry);
      chrome.storage.local.set({ [`xfb:${handle}`]: entry }).catch(() => {});
      refreshTweetsForHandle(handle);
    }
  }

  window.addEventListener("message", (e) => {
    if (!e.data || typeof e.data !== "object") return;

    if (e.data.type === "__XFB_QUERY_ID_DETECTED__" && e.data.queryId) {
      if (e.data.queryId !== liveQueryId) {
        liveQueryId = e.data.queryId;
        chrome.storage.local.set({ customQueryId: liveQueryId }).catch(() => {});
        log("Auto-detected live Query ID:", liveQueryId);
      }
    }

    if (e.data.type === "__XFB_SYNC_RESPONSE__") {
      if (e.data.queryId && e.data.queryId !== liveQueryId) {
        liveQueryId = e.data.queryId;
        chrome.storage.local.set({ customQueryId: liveQueryId }).catch(() => {});
      }
      ingestProfiles(e.data.profiles);
    }

    if (e.data.type === "__XFB_PROFILES_INTERCEPTED__") {
      ingestProfiles(e.data.profiles);
    }
  });

  // --- "Show More" Auto-Expansion ---

  function tryExpandShowMore(container) {
    if (!settings.autoExpandShowMore || !container) return;

    const directBtn = container.querySelector?.('[data-testid="tweet-text-show-more-link"]');
    if (directBtn && !expandedElements.has(directBtn)) {
      expandedElements.add(directBtn);
      directBtn.click();
      return;
    }

    if (container.matches?.('[data-testid="tweet-text-show-more-link"]')) {
      if (!expandedElements.has(container)) {
        expandedElements.add(container);
        container.click();
        return;
      }
    }

    const tweetText = container.querySelector?.('[data-testid="tweetText"]');
    if (tweetText && tweetText.parentElement) {
      const candidates = tweetText.parentElement.querySelectorAll('button, [role="button"], a');
      for (const el of candidates) {
        if (expandedElements.has(el)) continue;
        const text = el.textContent?.trim().toLowerCase();
        if (
          text === "show more" ||
          text === "afficher plus" ||
          text === "mostrar más" ||
          text === "mehr anzeigen" ||
          text === "mostra altro"
        ) {
          expandedElements.add(el);
          el.click();
          break;
        }
      }
    }
  }

  function expandAllVisiblePosts() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(tryExpandShowMore);
  }

  // --- Formatting Helpers ---

  function formatCount(n) {
    if (typeof n !== "number" || isNaN(n)) return "?";
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

  function formatRatio(followers, following) {
    if (!following || following === 0) return null;
    const ratio = followers / following;
    if (ratio >= 100) return `${Math.round(ratio)}x`;
    if (ratio >= 10) return `${ratio.toFixed(1)}x`;
    if (ratio >= 1) return `${ratio.toFixed(1)}x`;
    return `${ratio.toFixed(2)}x`;
  }

  function isNewAccount(createdAt) {
    if (!createdAt) return false;
    const createdTime = new Date(createdAt).getTime();
    if (isNaN(createdTime)) return false;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    return Date.now() - createdTime < thirtyDaysMs;
  }

  function formatAccountAge(createdAt) {
    if (!createdAt) return null;
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return null;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const diffYears = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const ageStr = diffYears >= 1 ? `${Math.floor(diffYears)}y ago` : `${Math.max(1, Math.floor(diffYears * 12))}m ago`;
    return `Joined ${month} ${year} · ${ageStr}`;
  }

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|; )ct0=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  // --- Fallback API Fetcher ---

  async function fetchFollowerProfile(handle) {
    const csrf = getCsrfToken();
    if (!csrf) throw new Error("No ct0 cookie found (not logged in)");

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

    const url = `https://${location.hostname}/i/api/graphql/${liveQueryId}/UserByScreenName?variables=${variables}&features=${features}`;

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
    const userResult = data?.data?.user?.result;
    const legacy = userResult?.legacy || userResult?.user?.legacy;
    if (!legacy || typeof legacy.followers_count !== "number") {
      throw new Error("Invalid profile payload");
    }

    return {
      count: legacy.followers_count,
      following: legacy.friends_count,
      createdAt: legacy.created_at,
      name: legacy.name,
      avatar: legacy.profile_image_url_https,
      verified: Boolean(userResult?.is_blue_verified || legacy.verified),
      description: legacy.description,
      ts: Date.now(),
    };
  }

  function readCache(handle) {
    const mem = memoryCache.get(handle.toLowerCase());
    if (mem && Date.now() - mem.ts < CACHE_TTL_MS) return mem;
    return undefined;
  }

  function writeCache(handle, profile) {
    const entry = { ...profile, ts: Date.now() };
    memoryCache.set(handle.toLowerCase(), entry);
    chrome.storage.local.set({ [`xfb:${handle.toLowerCase()}`]: entry }).catch(() => {});
  }

  async function hydrateFromStorage(handle) {
    try {
      const key = `xfb:${handle.toLowerCase()}`;
      const stored = await chrome.storage.local.get(key);
      const entry = stored[key];
      if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
        memoryCache.set(handle.toLowerCase(), entry);
        return entry;
      }
    } catch (_) {}
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
        log("Queue task failed:", err);
      }
      await new Promise((r) => setTimeout(r, REQUEST_GAP_MS));
    }
    draining = false;
  }

  // --- Tweet Element Helpers ---

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
    return match ? match[1].toLowerCase() : null;
  }

  function getUserAvatarForTweet(article) {
    const img = article.querySelector('img[src*="profile_images"]');
    return img ? img.src : null;
  }

  // --- Badge Rendering Engine ---

  function getTagColorClass(tag) {
    const t = tag.toLowerCase();
    if (t.includes("founder") || t.includes("ceo")) return "xfb-tag--founder";
    if (t.includes("vc") || t.includes("investor")) return "xfb-tag--vc";
    if (t.includes("recruiter") || t.includes("hiring")) return "xfb-tag--recruiter";
    if (t.includes("dev") || t.includes("engineer") || t.includes("coder")) return "xfb-tag--dev";
    if (t.includes("vip") || t.includes("whale")) return "xfb-tag--vip";
    if (t.includes("spam") || t.includes("bot") || t.includes("mute")) return "xfb-tag--spam";
    return "";
  }

  function buildBadgeGroup(handle, profile, isError = false) {
    const group = document.createElement("span");
    group.className = "xfb-badge-group";
    group.dataset.handle = handle;

    // Follower badge
    const badge = document.createElement("span");
    badge.className = "xfb-badge" + (isError ? " xfb-badge--error" : "");
    if (isError) {
      badge.textContent = "?";
      badge.title = "Could not load follower count · Click to view profile options";
    } else if (profile && typeof profile.count === "number") {
      badge.innerHTML = `👥 ${formatCount(profile.count)}`;
      badge.title = `${profile.count.toLocaleString()} followers · Click for profile details & notes`;
    } else {
      badge.textContent = "···";
      badge.title = "Loading follower count...";
    }

    // Has private note indicator dot
    const crm = getCrmUser(handle);
    if (crm && crm.note) {
      const dot = document.createElement("span");
      dot.className = "xfb-notes-indicator";
      dot.title = "Private note saved";
      badge.appendChild(dot);
    }

    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      openHoverCard(badge, handle, profile);
    });

    group.appendChild(badge);

    if (profile && !isError) {
      // Ratio pill
      if (typeof profile.following === "number" && profile.following > 0) {
        const ratioStr = formatRatio(profile.count, profile.following);
        if (ratioStr) {
          const ratioPill = document.createElement("span");
          ratioPill.className = "xfb-ratio-pill";
          ratioPill.textContent = `🎯 ${ratioStr}`;
          ratioPill.title = `Ratio: ${profile.count.toLocaleString()} followers / ${profile.following.toLocaleString()} following`;
          group.appendChild(ratioPill);
        }
      }

      // New account warning
      if (profile.createdAt && isNewAccount(profile.createdAt)) {
        const newPill = document.createElement("span");
        newPill.className = "xfb-badge--new-account";
        newPill.textContent = "🐣 New";
        newPill.title = `Account created recently (${new Date(profile.createdAt).toLocaleDateString()})`;
        group.appendChild(newPill);
      }
    }

    // CRM Tags pills
    if (crm && crm.tags && crm.tags.length > 0) {
      for (const tag of crm.tags) {
        const tagPill = document.createElement("span");
        const colorClass = getTagColorClass(tag);
        tagPill.className = `xfb-tag-pill ${colorClass}`.trim();
        tagPill.textContent = tag;
        tagPill.title = `CRM Tag: ${tag} · Click to edit`;
        tagPill.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          openHoverCard(badge, handle, profile);
        });
        group.appendChild(tagPill);
      }
    }

    return group;
  }

  function insertBadge(article, handle, profile, isError = false) {
    const link = findPermalinkAnchor(article);
    if (!link || !link.parentElement) return;

    const existing = link.parentElement.querySelector(":scope > .xfb-badge-group");
    if (existing) existing.remove();

    const badgeGroup = buildBadgeGroup(handle, profile, isError);
    link.insertAdjacentElement("afterend", badgeGroup);

    // Apply Dimmer
    const shouldDim = Boolean(
      settings.dimLowFollowers &&
      profile &&
      typeof profile.count === "number" &&
      profile.count < settings.minFollowerThreshold
    );

    if (shouldDim) {
      article.classList.add("xfb-dimmed-tweet");
      article.setAttribute("data-xfb-dimmed", "true");
      badgeGroup.setAttribute("data-dimmed", "true");
    } else {
      article.classList.remove("xfb-dimmed-tweet");
      article.removeAttribute("data-xfb-dimmed");
      badgeGroup.removeAttribute("data-dimmed");
    }

    // Protect against React className resets on mouseenter
    if (!article.__xfbDimmerHooked) {
      article.__xfbDimmerHooked = true;
      article.addEventListener("mouseenter", () => {
        const bg = article.querySelector(":scope > .xfb-badge-group, .xfb-badge-group");
        if (settings.dimLowFollowers && bg && bg.getAttribute("data-dimmed") === "true") {
          article.classList.add("xfb-dimmed-tweet");
          article.setAttribute("data-xfb-dimmed", "true");
        }
      }, { passive: true });
    }
  }

  function applyDimmerToAll() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach((article) => {
      const handle = getHandleForTweet(article);
      if (!handle) return;
      const cached = readCache(handle);
      const bg = article.querySelector(".xfb-badge-group");
      const shouldDim = Boolean(
        settings.dimLowFollowers &&
        cached &&
        typeof cached.count === "number" &&
        cached.count < settings.minFollowerThreshold
      );

      if (shouldDim) {
        article.classList.add("xfb-dimmed-tweet");
        article.setAttribute("data-xfb-dimmed", "true");
        if (bg) bg.setAttribute("data-dimmed", "true");
      } else {
        article.classList.remove("xfb-dimmed-tweet");
        article.removeAttribute("data-xfb-dimmed");
        if (bg) bg.removeAttribute("data-dimmed");
      }
    });
  }

  function refreshTweetsForHandle(handle) {
    const normalized = handle.toLowerCase();
    const profile = readCache(normalized);
    document.querySelectorAll('article[data-testid="tweet"]').forEach((article) => {
      const h = getHandleForTweet(article);
      if (h === normalized) {
        insertBadge(article, normalized, profile);
      }
    });
  }

  async function processTweet(article) {
    tryExpandShowMore(article);

    const handle = getHandleForTweet(article);
    if (!handle) return;

    const prevHandle = processedTweets.get(article);
    if (prevHandle === handle) return;
    processedTweets.set(article, handle);

    const cached = readCache(handle);
    if (cached !== undefined) {
      insertBadge(article, handle, cached);
      return;
    }

    // Insert placeholder immediately
    insertBadge(article, handle, null);

    // Check storage first
    const fromStorage = await hydrateFromStorage(handle);
    if (fromStorage) {
      insertBadge(article, handle, fromStorage);
      return;
    }

    // Enqueue fallback fetch only if not in storage
    enqueue(async () => {
      let profile = readCache(handle);
      if (!profile) {
        profile = await fetchFollowerProfile(handle).catch((err) => {
          log(`Fallback failed for @${handle}:`, err.message);
          return null;
        });
        if (profile) writeCache(handle, profile);
      }

      insertBadge(article, handle, profile, profile === null);
    });
  }

  function scan(root = document) {
    root.querySelectorAll('article[data-testid="tweet"]').forEach(processTweet);
  }

  // --- Rich Hover Card / Popover Engine ---

  function closeHoverCard() {
    if (activePopover) {
      activePopover.remove();
      activePopover = null;
    }
  }

  function openHoverCard(anchorEl, handle, profile) {
    closeHoverCard();

    const crm = getCrmUser(handle) || { tags: [], note: "" };
    const cached = profile || readCache(handle) || {};
    const name = cached.name || handle;
    const avatar = cached.avatar || getUserAvatarForTweet(anchorEl.closest("article")) || "";
    const followers = typeof cached.count === "number" ? formatCount(cached.count) : "—";
    const following = typeof cached.following === "number" ? formatCount(cached.following) : "—";
    const ratio = typeof cached.count === "number" && typeof cached.following === "number" && cached.following > 0
      ? formatRatio(cached.count, cached.following)
      : "—";
    const joinedText = cached.createdAt ? formatAccountAge(cached.createdAt) : null;

    const popover = document.createElement("div");
    popover.className = "xfb-popover";

    popover.innerHTML = `
      <div class="xfb-popover-header">
        <div class="xfb-popover-user">
          ${avatar ? `<img src="${avatar}" class="xfb-popover-avatar" alt="${name}">` : '<div class="xfb-popover-avatar"></div>'}
          <div class="xfb-popover-names">
            <div class="xfb-popover-fullname">${escapeHtml(name)}</div>
            <div class="xfb-popover-handle">@${escapeHtml(handle)}</div>
          </div>
        </div>
        <button class="xfb-popover-close" title="Close">✕</button>
      </div>

      <div class="xfb-metrics-row">
        <div class="xfb-metric-item">
          <span class="xfb-metric-value">${followers}</span>
          <span class="xfb-metric-label">Followers</span>
        </div>
        <div class="xfb-metric-item">
          <span class="xfb-metric-value">${following}</span>
          <span class="xfb-metric-label">Following</span>
        </div>
        <div class="xfb-metric-item">
          <span class="xfb-metric-value">${ratio}</span>
          <span class="xfb-metric-label">Ratio</span>
        </div>
      </div>

      ${joinedText ? `<div class="xfb-joined-info">📅 ${joinedText}</div>` : ""}

      <div class="xfb-section-title">Tags</div>
      <div class="xfb-active-tags" id="xfbActiveTags"></div>

      <div class="xfb-preset-chips">
        <button class="xfb-preset-btn" data-tag="Founder">+ Founder</button>
        <button class="xfb-preset-btn" data-tag="VC">+ VC</button>
        <button class="xfb-preset-btn" data-tag="Dev">+ Dev</button>
        <button class="xfb-preset-btn" data-tag="Recruiter">+ Recruiter</button>
        <button class="xfb-preset-btn" data-tag="VIP">+ VIP</button>
        <button class="xfb-preset-btn" data-tag="Spam">+ Spam</button>
      </div>

      <div class="xfb-custom-tag-form">
        <input type="text" class="xfb-custom-tag-input" placeholder="Custom tag..." maxlength="20">
        <button class="xfb-custom-tag-btn" type="button">Add</button>
      </div>

      <div class="xfb-section-title">Private Note</div>
      <textarea class="xfb-notes-textarea" placeholder="Add private note for @${escapeHtml(handle)}...">${escapeHtml(crm.note || "")}</textarea>
      <div class="xfb-notes-status" id="xfbNotesStatus"></div>
    `;

    document.body.appendChild(popover);
    activePopover = popover;

    // Render active tags
    const activeTagsContainer = popover.querySelector("#xfbActiveTags");
    function renderActiveTags() {
      const currentCrm = getCrmUser(handle);
      activeTagsContainer.innerHTML = "";
      if (currentCrm && currentCrm.tags && currentCrm.tags.length > 0) {
        for (const tag of currentCrm.tags) {
          const chip = document.createElement("span");
          chip.className = "xfb-active-tag-chip";
          chip.textContent = tag;
          const removeBtn = document.createElement("button");
          removeBtn.className = "xfb-tag-remove-btn";
          removeBtn.textContent = "×";
          removeBtn.title = "Remove tag";
          removeBtn.addEventListener("click", async () => {
            await removeTagFromUser(handle, tag);
            renderActiveTags();
          });
          chip.appendChild(removeBtn);
          activeTagsContainer.appendChild(chip);
        }
      } else {
        activeTagsContainer.innerHTML = '<span style="color:#71767b;font-size:11px;">No tags yet</span>';
      }
    }
    renderActiveTags();

    // Preset button click handlers
    popover.querySelectorAll(".xfb-preset-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const tag = btn.dataset.tag;
        await addTagToUser(handle, tag);
        renderActiveTags();
      });
    });

    // Custom tag input
    const tagInput = popover.querySelector(".xfb-custom-tag-input");
    const tagBtn = popover.querySelector(".xfb-custom-tag-btn");
    const handleAddCustomTag = async () => {
      const val = tagInput.value.trim();
      if (val) {
        await addTagToUser(handle, val);
        tagInput.value = "";
        renderActiveTags();
      }
    };
    tagBtn.addEventListener("click", handleAddCustomTag);
    tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAddCustomTag();
    });

    // Notes auto-save with debounce
    const noteTextarea = popover.querySelector(".xfb-notes-textarea");
    const noteStatus = popover.querySelector("#xfbNotesStatus");
    let noteTimer = null;
    noteTextarea.addEventListener("input", () => {
      noteStatus.textContent = "Typing...";
      clearTimeout(noteTimer);
      noteTimer = setTimeout(async () => {
        await saveUserNote(handle, noteTextarea.value);
        noteStatus.textContent = "Saved ✓";
        setTimeout(() => {
          if (noteStatus.textContent === "Saved ✓") noteStatus.textContent = "";
        }, 1500);
      }, 500);
    });

    // Close button
    popover.querySelector(".xfb-popover-close").addEventListener("click", closeHoverCard);

    // Positioning
    const rect = anchorEl.getBoundingClientRect();
    const popoverWidth = 320;
    const popoverHeight = 360;

    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 8;

    if (left + popoverWidth > window.innerWidth - 16) {
      left = window.innerWidth - popoverWidth - 16;
    }
    if (left < 16) left = 16;

    if (rect.bottom + popoverHeight > window.innerHeight) {
      top = rect.top + window.scrollY - popoverHeight - 8;
    }

    popover.style.left = `${Math.max(0, left)}px`;
    popover.style.top = `${Math.max(0, top)}px`;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  // Close popover when clicking outside
  document.addEventListener("click", (e) => {
    if (activePopover && !activePopover.contains(e.target) && !e.target.closest(".xfb-badge-group")) {
      closeHoverCard();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && activePopover) {
      closeHoverCard();
    }
  });

  // --- Mutation Observer ---

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.('article[data-testid="tweet"]')) {
          processTweet(node);
        } else if (node.matches?.('[data-testid="tweet-text-show-more-link"]')) {
          tryExpandShowMore(node);
        } else {
          scan(node);
          tryExpandShowMore(node);
        }
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // --- Bootstrap ---
  ensureInterceptorInjected();
  loadSettings();
  loadCrmData();
  requestInterceptorSync();
  scan();

  // Retry sync after initial render
  setTimeout(requestInterceptorSync, 1200);
  setTimeout(requestInterceptorSync, 3000);
})();

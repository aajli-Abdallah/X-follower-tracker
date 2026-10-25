// X Follower Tracker & Enhancer - Content Script v2.0.4
// Features: Zero-Network Interceptor Bridge, CRM Tags & Notes, Trust Signals, Hover Card, Timeline Dimmer, Video Speed Controller

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
    // Video Speed Controller
    videoSpeedEnabled: true,
    videoPreferredSpeed: 1,
    videoPresets: [0.5, 0.75, 1, 1.25, 1.5, 2],
    videoAutoHide: true,
    videoPosition: 'top-right',
    videoUiMode: 'compact',
    videoShowSeekButtons: true,
    videoShowPipButton: true,
    videoShowScreenshotButton: true,
    videoAudioBoost: 100,
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
        "videoSpeedEnabled",
        "videoPreferredSpeed",
        "videoPresets",
        "videoAutoHide",
        "videoPosition",
        "videoUiMode",
        "videoShowSeekButtons",
        "videoShowPipButton",
        "videoShowScreenshotButton",
        "videoAudioBoost",
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
      // Video speed settings
      if (stored.videoSpeedEnabled !== undefined) settings.videoSpeedEnabled = Boolean(stored.videoSpeedEnabled);
      if (stored.videoPreferredSpeed !== undefined) settings.videoPreferredSpeed = Number(stored.videoPreferredSpeed);
      if (stored.videoPresets !== undefined && Array.isArray(stored.videoPresets)) settings.videoPresets = stored.videoPresets;
      if (stored.videoAutoHide !== undefined) settings.videoAutoHide = Boolean(stored.videoAutoHide);
      if (stored.videoPosition !== undefined) settings.videoPosition = stored.videoPosition;
      if (stored.videoUiMode !== undefined) settings.videoUiMode = stored.videoUiMode;
      if (stored.videoShowSeekButtons !== undefined) settings.videoShowSeekButtons = Boolean(stored.videoShowSeekButtons);
      if (stored.videoShowPipButton !== undefined) settings.videoShowPipButton = Boolean(stored.videoShowPipButton);
      if (stored.videoShowScreenshotButton !== undefined) settings.videoShowScreenshotButton = Boolean(stored.videoShowScreenshotButton);
      if (stored.videoAudioBoost !== undefined) settings.videoAudioBoost = Number(stored.videoAudioBoost);
    } catch (err) {
      log("Error loading settings:", err);
    }
    applySettingsClasses();
    if (settings.autoExpandShowMore) {
      expandAllVisiblePosts();
    }
    applyDimmerToAll();
    // Kick off video scanner after settings are ready
    if (typeof xvsScanForVideos === 'function') xvsScanForVideos();
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
    // Video speed settings live updates
    const videoKeys = ['videoSpeedEnabled','videoPreferredSpeed','videoPresets','videoAutoHide','videoPosition','videoUiMode','videoShowSeekButtons','videoShowPipButton','videoShowScreenshotButton','videoAudioBoost'];
    if (videoKeys.some(k => changes[k] !== undefined)) {
      if (changes.videoSpeedEnabled !== undefined) settings.videoSpeedEnabled = Boolean(changes.videoSpeedEnabled.newValue);
      if (changes.videoPreferredSpeed !== undefined) settings.videoPreferredSpeed = Number(changes.videoPreferredSpeed.newValue);
      if (changes.videoPresets !== undefined) settings.videoPresets = changes.videoPresets.newValue;
      if (changes.videoAutoHide !== undefined) settings.videoAutoHide = Boolean(changes.videoAutoHide.newValue);
      if (changes.videoPosition !== undefined) settings.videoPosition = changes.videoPosition.newValue;
      if (changes.videoUiMode !== undefined) settings.videoUiMode = changes.videoUiMode.newValue;
      if (changes.videoShowSeekButtons !== undefined) settings.videoShowSeekButtons = Boolean(changes.videoShowSeekButtons.newValue);
      if (changes.videoShowPipButton !== undefined) settings.videoShowPipButton = Boolean(changes.videoShowPipButton.newValue);
      if (changes.videoShowScreenshotButton !== undefined) settings.videoShowScreenshotButton = Boolean(changes.videoShowScreenshotButton.newValue);
      if (changes.videoAudioBoost !== undefined) settings.videoAudioBoost = Number(changes.videoAudioBoost.newValue);
      if (typeof xvsUpdateAllFromSettings === 'function') xvsUpdateAllFromSettings();
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
    let shouldRepositionVideos = false;
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
        // Also pick up any newly added video elements
        if (typeof xvsScanForVideos === 'function') {
          if (node.tagName === 'VIDEO') {
            xvsTrackVideo(node);
            shouldRepositionVideos = true;
          } else if (node.querySelector?.('video')) {
            xvsScanForVideos(node);
            shouldRepositionVideos = true;
          }
        }
        if (node.id === 'layers' || node.closest?.('#layers') || node.getAttribute?.('role') === 'dialog') {
          shouldRepositionVideos = true;
        }
      }

      for (const node of m.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (typeof xvsCleanUp === 'function') {
          if (node.tagName === 'VIDEO') {
            xvsCleanUp(node);
            shouldRepositionVideos = true;
          } else if (node.querySelector?.('video')) {
            node.querySelectorAll('video').forEach((v) => xvsCleanUp(v));
            shouldRepositionVideos = true;
          }
        }
        if (node.id === 'layers' || node.closest?.('#layers') || node.getAttribute?.('role') === 'dialog') {
          shouldRepositionVideos = true;
        }
      }
    }

    if (shouldRepositionVideos && typeof xvsScheduleReposition === 'function') {
      xvsScheduleReposition();
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // ============================================================
  // --- X VIDEO SPEED CONTROLLER (v2.0.3) ---
  // ============================================================

  const xvsTracked = new Map();    // videoEl -> entry
  const xvsAudioNodes = new WeakMap(); // videoEl -> { ctx, gainNode }

  function xvsFormatLabel(speed) {
    const s = Number(speed);
    return s === 1 ? '1x' : `${parseFloat(s.toFixed(2))}x`;
  }

  function xvsApplySpeed(video, entry, speed) {
    const clamped = Math.max(0.25, Math.min(4.0, parseFloat(Number(speed).toFixed(2))));
    entry.applyingSpeed = true;
    try { video.playbackRate = clamped; } catch (e) {}
    setTimeout(() => { entry.applyingSpeed = false; }, 50);
    entry.currentSpeed = clamped;
    if (entry.pillText) entry.pillText.textContent = xvsFormatLabel(clamped);
    entry.presetButtons.forEach((btn, s) => {
      btn.classList.toggle('xvs-active', Math.abs(s - clamped) < 0.01);
    });
  }

  function xvsApplyAudioBoost(video, boostPercent) {
    const boost = Math.max(100, Math.min(300, boostPercent || 100));
    const gainValue = boost / 100;
    let data = xvsAudioNodes.get(video);
    if (!data) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const source = ctx.createMediaElementSource(video);
        const gainNode = ctx.createGain();
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        data = { ctx, gainNode };
        xvsAudioNodes.set(video, data);
        const resume = () => { if (ctx.state === 'suspended') ctx.resume(); };
        video.addEventListener('play', resume);
        window.addEventListener('click', resume, { once: true });
      } catch (e) { return; }
    }
    if (data && data.gainNode) {
      try {
        data.gainNode.gain.value = gainValue;
        if (data.ctx.state === 'suspended') data.ctx.resume();
      } catch (e) {}
    }
  }

  async function xvsTogglePiP(video) {
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (e) {}
  }

  function xvsCaptureScreenshot(video, panel) {
    try {
      const w = video.videoWidth || video.clientWidth || 1280;
      const h = video.videoHeight || video.clientHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(video, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (!blob) { xvsShowToast(panel, '⚠️ Capture error'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `x-frame-${Date.now()}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        xvsShowToast(panel, '📸 Frame saved!');
      }, 'image/png');
    } catch (e) { xvsShowToast(panel, '⚠️ Protected stream'); }
  }

  function xvsSeek(video, seconds) {
    try {
      video.currentTime = Math.max(0, Math.min(video.duration || Infinity, (video.currentTime || 0) + seconds));
    } catch (e) {}
  }

  function xvsShowToast(panel, msg) {
    const t = document.createElement('div');
    t.className = 'xvs-toast';
    t.textContent = msg;
    panel.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  function xvsRenderPresets(video, entry) {
    entry.presetsContainer.innerHTML = '';
    entry.presetButtons.clear();
    const presets = settings.videoPresets || [0.5, 0.75, 1, 1.25, 1.5, 2];
    presets.forEach(speed => {
      const btn = document.createElement('button');
      btn.className = 'xvs-btn';
      btn.type = 'button';
      btn.textContent = xvsFormatLabel(speed);
      if (Math.abs(speed - entry.currentSpeed) < 0.01) btn.classList.add('xvs-active');
      btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        entry.userChosenSpeed = speed;
        xvsApplySpeed(video, entry, speed);
        chrome.storage.local.set({ videoPreferredSpeed: speed });
      });
      entry.presetsContainer.appendChild(btn);
      entry.presetButtons.set(speed, btn);
    });
  }

  function xvsTriggerAutoHide(entry) {
    if (entry.overlay.style.display === 'none') return;
    if (!settings.videoAutoHide) {
      entry.overlay.classList.remove('xvs-autohide');
      entry.overlay.classList.add('xvs-visible');
      return;
    }
    entry.overlay.classList.remove('xvs-autohide');
    entry.overlay.classList.add('xvs-visible');
    clearTimeout(entry.hideTimeout);
    entry.hideTimeout = setTimeout(() => {
      if (!entry.isHovered) {
        entry.overlay.classList.remove('xvs-visible');
        entry.overlay.classList.add('xvs-autohide');
      }
    }, 2200);
  }

  function xvsCreateOverlay(video) {
    const targetSpeed = settings.videoPreferredSpeed || 1;
    const overlay = document.createElement('div');
    overlay.className = `xvs-overlay ${settings.videoAutoHide ? 'xvs-autohide' : 'xvs-visible'}`;

    const panel = document.createElement('div');
    panel.className = `xvs-panel xvs-pos-${settings.videoPosition || 'top-right'} ${settings.videoUiMode === 'compact' ? 'xvs-compact' : ''}`;
    overlay.appendChild(panel);

    // Compact pill badge
    const pillBadge = document.createElement('div');
    pillBadge.className = 'xvs-pill-badge';
    pillBadge.title = 'Click to toggle video controls';
    pillBadge.innerHTML = `<svg viewBox="0 0 24 24"><path d="M13 2L3 14h8l-2 8 10-12h-8l2-8z"/></svg><span class="xvs-pill-text">${xvsFormatLabel(targetSpeed)}</span>`;
    panel.appendChild(pillBadge);
    const pillText = pillBadge.querySelector('.xvs-pill-text');
    pillBadge.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); panel.classList.toggle('xvs-expanded'); });

    // Controls tray
    const controlsTray = document.createElement('div');
    controlsTray.className = 'xvs-controls-tray';
    panel.appendChild(controlsTray);

    // − step button
    const minusBtn = document.createElement('button');
    minusBtn.className = 'xvs-btn xvs-step-btn';
    minusBtn.type = 'button';
    minusBtn.title = 'Decrease speed (−0.1x)';
    minusBtn.textContent = '−';
    minusBtn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const next = Math.max(0.25, parseFloat((entry.currentSpeed - 0.1).toFixed(2)));
      entry.userChosenSpeed = next;
      xvsApplySpeed(video, entry, next);
      chrome.storage.local.set({ videoPreferredSpeed: next });
    });
    controlsTray.appendChild(minusBtn);

    // Presets container
    const presetsContainer = document.createElement('div');
    presetsContainer.style.cssText = 'display:flex;gap:3px;';
    controlsTray.appendChild(presetsContainer);

    // + step button
    const plusBtn = document.createElement('button');
    plusBtn.className = 'xvs-btn xvs-step-btn';
    plusBtn.type = 'button';
    plusBtn.title = 'Increase speed (+0.1x)';
    plusBtn.textContent = '+';
    plusBtn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const next = Math.min(4.0, parseFloat((entry.currentSpeed + 0.1).toFixed(2)));
      entry.userChosenSpeed = next;
      xvsApplySpeed(video, entry, next);
      chrome.storage.local.set({ videoPreferredSpeed: next });
    });
    controlsTray.appendChild(plusBtn);

    // Seek tray
    const seekTray = document.createElement('div');
    seekTray.style.cssText = `display:${settings.videoShowSeekButtons ? 'flex' : 'none'};align-items:center;gap:3px;`;
    const divSeek = document.createElement('div');
    divSeek.className = 'xvs-divider';
    seekTray.appendChild(divSeek);
    const rewindBtn = document.createElement('button');
    rewindBtn.className = 'xvs-util-btn';
    rewindBtn.title = 'Rewind 5 seconds';
    rewindBtn.textContent = '−5s';
    rewindBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); xvsSeek(video, -5); });
    seekTray.appendChild(rewindBtn);
    const fwdBtn = document.createElement('button');
    fwdBtn.className = 'xvs-util-btn';
    fwdBtn.title = 'Skip forward 5 seconds';
    fwdBtn.textContent = '+5s';
    fwdBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); xvsSeek(video, 5); });
    seekTray.appendChild(fwdBtn);
    controlsTray.appendChild(seekTray);

    // Pro tools tray
    const toolsTray = document.createElement('div');
    toolsTray.style.cssText = 'display:flex;align-items:center;gap:3px;';
    const divTools = document.createElement('div');
    divTools.className = 'xvs-divider';
    toolsTray.appendChild(divTools);

    // PiP
    const pipBtn = document.createElement('button');
    pipBtn.className = 'xvs-util-btn';
    pipBtn.title = 'Picture-in-Picture';
    pipBtn.style.display = settings.videoShowPipButton ? 'inline-flex' : 'none';
    pipBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/></svg>`;
    pipBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); xvsTogglePiP(video); });
    toolsTray.appendChild(pipBtn);

    // Screenshot
    const shotBtn = document.createElement('button');
    shotBtn.className = 'xvs-util-btn';
    shotBtn.title = 'Save frame screenshot';
    shotBtn.style.display = settings.videoShowScreenshotButton ? 'inline-flex' : 'none';
    shotBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 15c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm7-10h-3.17L14 3H10L8.17 5H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 14H5V7h3.88l1.83-2h4.58l1.83 2H19v12z"/></svg>`;
    shotBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); xvsCaptureScreenshot(video, panel); });
    toolsTray.appendChild(shotBtn);

    // Audio Boost
    const audioBoost = settings.videoAudioBoost || 100;
    const audioBtn = document.createElement('button');
    audioBtn.className = `xvs-util-btn ${audioBoost > 100 ? 'xvs-audio-active' : ''}`;
    audioBtn.title = 'Audio Boost (cycle: 100% → 150% → 200% → 300%)';
    audioBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg><span class="xvs-audio-label">${audioBoost > 100 ? audioBoost + '%' : ''}</span>`;
    audioBtn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const levels = [100, 150, 200, 300];
      const next = levels[(levels.indexOf(settings.videoAudioBoost || 100) + 1) % levels.length];
      settings.videoAudioBoost = next;
      chrome.storage.local.set({ videoAudioBoost: next });
      xvsApplyAudioBoost(video, next);
      xvsShowToast(panel, `🔊 Audio Boost: ${next}%`);
      audioBtn.classList.toggle('xvs-audio-active', next > 100);
      const lbl = audioBtn.querySelector('.xvs-audio-label');
      if (lbl) lbl.textContent = next > 100 ? `${next}%` : '';
    });
    toolsTray.appendChild(audioBtn);
    controlsTray.appendChild(toolsTray);

    document.body.appendChild(overlay);

    const entry = {
      overlay, panel, pillBadge, pillText,
      controlsTray, presetsContainer, seekTray,
      pipBtn, shotBtn, audioBtn,
      presetButtons: new Map(),
      currentSpeed: targetSpeed,
      userChosenSpeed: undefined,
      inView: false, isHovered: false,
      hideTimeout: null, applyingSpeed: false,
    };

    xvsRenderPresets(video, entry);

    overlay.addEventListener('mouseenter', () => { entry.isHovered = true; xvsTriggerAutoHide(entry); });
    overlay.addEventListener('mouseleave', () => { entry.isHovered = false; xvsTriggerAutoHide(entry); });
    video.addEventListener('mousemove', () => xvsTriggerAutoHide(entry), { passive: true });
    video.addEventListener('mouseenter', () => xvsTriggerAutoHide(entry), { passive: true });

    const playerContainer = video.closest('[data-testid="videoPlayer"], [data-testid="videoComponent"]') || video.parentElement;
    if (playerContainer && playerContainer !== video) {
      playerContainer.addEventListener('mousemove', () => xvsTriggerAutoHide(entry), { passive: true });
      playerContainer.addEventListener('mouseenter', () => xvsTriggerAutoHide(entry), { passive: true });
    }

    return entry;
  }

  // Detect active modal / lightbox / full-format dialog on Twitter/X
  function xvsGetActiveModal() {
    const layers = document.getElementById('layers');
    if (layers) {
      const modal = layers.querySelector('[role="dialog"], [aria-modal="true"], [data-testid="swipe-to-dismiss"], [data-testid="sheetDialog"]');
      if (modal && modal.offsetWidth > 0 && modal.offsetHeight > 0) {
        return modal;
      }
    }
    const genericModal = document.querySelector('div[aria-modal="true"][role="dialog"]');
    if (genericModal && genericModal.offsetWidth > 0 && genericModal.offsetHeight > 0) {
      return genericModal;
    }
    return null;
  }

  // Check if a video is occluded by another element (e.g. modal, drawer, sticky header)
  function xvsIsElementOccluded(video, rect) {
    try {
      const visibleTop = Math.max(0, rect.top);
      const visibleBottom = Math.min(window.innerHeight, rect.bottom);
      const visibleLeft = Math.max(0, rect.left);
      const visibleRight = Math.min(window.innerWidth, rect.right);

      if (visibleBottom <= visibleTop || visibleRight <= visibleLeft) return true;

      const testX = (visibleLeft + visibleRight) / 2;
      const testY = (visibleTop + visibleBottom) / 2;

      const topEl = document.elementFromPoint(testX, testY);
      if (!topEl) return false;

      // If top element is our own overlay or panel, it's not occluded
      if (topEl.closest('.xvs-overlay')) return false;

      // If top element is the video or inside the video
      if (topEl === video || video.contains(topEl)) return false;

      // If top element belongs to the same video player or tweet container
      const player = video.closest('[data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="tweetPhoto"], article');
      if (player && (player === topEl || player.contains(topEl))) return false;

      // Otherwise, the element is occluded by a layer/modal on top of it
      return true;
    } catch (e) {
      return false;
    }
  }

  function xvsPositionOverlay(video, entry) {
    if (!video.isConnected) { xvsCleanUp(video); return; }
    if (!settings.videoSpeedEnabled) { entry.overlay.style.display = 'none'; return; }

    // 1. Native HTML5 Fullscreen Handling
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) {
      const isThisVideoInFs = (fsEl === video || fsEl.contains(video));
      if (!isThisVideoInFs) {
        entry.overlay.style.display = 'none';
        return;
      }
      if (entry.overlay.parentElement !== fsEl) {
        fsEl.appendChild(entry.overlay);
      }
      entry.overlay.classList.add('xvs-fullscreen');
      entry.overlay.style.cssText = 'display:block;position:absolute;top:0;left:0;width:100%;height:100%;z-index:2147483647;';
      return;
    } else {
      entry.overlay.classList.remove('xvs-fullscreen');
      if (entry.overlay.parentElement !== document.body) {
        document.body.appendChild(entry.overlay);
      }
    }

    // 2. Modal / Lightbox / Full-format view handling
    const activeModal = xvsGetActiveModal();
    if (activeModal) {
      const isInsideModal = activeModal.contains(video);
      if (!isInsideModal) {
        // A modal / full-format viewer is open, and this video is in the background: hide overlay!
        entry.overlay.style.display = 'none';
        return;
      }
    }

    // 3. Basic DOM Visibility & Viewport Intersection
    if (!entry.inView) {
      entry.overlay.style.display = 'none';
      return;
    }

    if (video.offsetParent === null && !video.closest('#layers')) {
      entry.overlay.style.display = 'none';
      return;
    }

    const rect = video.getBoundingClientRect();
    const visible = rect.width >= 120 && rect.height >= 80 &&
      rect.bottom > 0 && rect.right > 0 &&
      rect.top < window.innerHeight && rect.left < window.innerWidth;
    if (!visible) {
      entry.overlay.style.display = 'none';
      return;
    }

    // 4. Occlusion test
    if (xvsIsElementOccluded(video, rect)) {
      entry.overlay.style.display = 'none';
      return;
    }

    // 5. Normal positioning on document.body using viewport coordinates
    entry.overlay.style.cssText = `display:block;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;`;
  }

  let xvsRepositionScheduled = false;
  function xvsScheduleReposition() {
    if (xvsRepositionScheduled) return;
    xvsRepositionScheduled = true;
    requestAnimationFrame(() => {
      xvsRepositionScheduled = false;
      xvsTracked.forEach((entry, video) => { xvsPositionOverlay(video, entry); });
    });
  }

  const xvsIntersectionObs = new IntersectionObserver(entries => {
    entries.forEach(change => {
      const entry = xvsTracked.get(change.target);
      if (entry) { entry.inView = change.isIntersecting; xvsPositionOverlay(change.target, entry); }
    });
  }, { threshold: [0, 0.1] });

  const xvsResizeObs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(entries => {
    entries.forEach(change => { if (xvsTracked.get(change.target)?.inView) xvsScheduleReposition(); });
  }) : null;

  function xvsCleanUp(video) {
    const entry = xvsTracked.get(video);
    if (!entry) return;
    try { xvsIntersectionObs.unobserve(video); xvsResizeObs?.unobserve(video); clearTimeout(entry.hideTimeout); entry.overlay.remove(); } catch (e) {}
    xvsTracked.delete(video);
  }

  function xvsTrackVideo(video) {
    if (xvsTracked.has(video) || !video.isConnected) return;
    // Skip tiny thumbnails/avatars (must be at least 120x80 rendered)
    const rect = video.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && (rect.width < 120 || rect.height < 80)) return;

    const entry = xvsCreateOverlay(video);
    xvsTracked.set(video, entry);
    xvsIntersectionObs.observe(video);
    xvsResizeObs?.observe(video);

    video.addEventListener('play', () => {
      if (settings.videoSpeedEnabled && !entry.applyingSpeed && Math.abs(video.playbackRate - entry.currentSpeed) > 0.01) {
        video.playbackRate = entry.currentSpeed;
      }
      if ((settings.videoAudioBoost || 100) > 100) xvsApplyAudioBoost(video, settings.videoAudioBoost);
      xvsScheduleReposition();
    });
    video.addEventListener('pause', () => {
      xvsScheduleReposition();
    });
    video.addEventListener('ratechange', () => {
      if (settings.videoSpeedEnabled && !entry.applyingSpeed && Math.abs(video.playbackRate - entry.currentSpeed) > 0.01) {
        video.playbackRate = entry.currentSpeed;
      }
    });
    video.addEventListener('loadedmetadata', () => {
      if (settings.videoSpeedEnabled) xvsApplySpeed(video, entry, entry.userChosenSpeed ?? settings.videoPreferredSpeed ?? 1);
      xvsScheduleReposition();
    });

    if (settings.videoSpeedEnabled) {
      xvsApplySpeed(video, entry, settings.videoPreferredSpeed || 1);
      if ((settings.videoAudioBoost || 100) > 100) xvsApplyAudioBoost(video, settings.videoAudioBoost);
    }
    xvsPositionOverlay(video, entry);
  }

  function xvsScanForVideos(root = document) {
    if (!root.querySelectorAll) return;
    root.querySelectorAll('video').forEach(v => xvsTrackVideo(v));
  }

  function xvsUpdateAllFromSettings() {
    xvsTracked.forEach((entry, video) => {
      entry.panel.className = `xvs-panel xvs-pos-${settings.videoPosition || 'top-right'} ${settings.videoUiMode === 'compact' ? 'xvs-compact' : ''}`;
      if (settings.videoAutoHide) {
        entry.overlay.classList.add('xvs-autohide');
        entry.overlay.classList.remove('xvs-visible');
      } else {
        entry.overlay.classList.remove('xvs-autohide');
        entry.overlay.classList.add('xvs-visible');
      }
      if (entry.seekTray) entry.seekTray.style.display = settings.videoShowSeekButtons ? 'flex' : 'none';
      if (entry.pipBtn) entry.pipBtn.style.display = settings.videoShowPipButton ? 'inline-flex' : 'none';
      if (entry.shotBtn) entry.shotBtn.style.display = settings.videoShowScreenshotButton ? 'inline-flex' : 'none';
      if (entry.audioBtn) {
        const boost = settings.videoAudioBoost || 100;
        entry.audioBtn.classList.toggle('xvs-audio-active', boost > 100);
        const lbl = entry.audioBtn.querySelector('.xvs-audio-label');
        if (lbl) lbl.textContent = boost > 100 ? `${boost}%` : '';
      }
      xvsRenderPresets(video, entry);
      if (settings.videoSpeedEnabled) {
        xvsApplySpeed(video, entry, entry.userChosenSpeed ?? settings.videoPreferredSpeed ?? 1);
      }
      xvsPositionOverlay(video, entry);
    });
  }

  // X can scroll inside nested timeline containers. Capture catches those scroll
  // events as well as normal page scrolling so the overlay tracks every video.
  document.addEventListener('scroll', xvsScheduleReposition, { capture: true, passive: true });
  window.addEventListener('resize', xvsScheduleReposition, { passive: true });
  document.addEventListener('fullscreenchange', xvsScheduleReposition);
  document.addEventListener('webkitfullscreenchange', xvsScheduleReposition);
  window.addEventListener('popstate', xvsScheduleReposition);

  // Hook pushState and replaceState to catch SPA page transitions and modal opens/closes
  const _origPushState = history.pushState;
  if (_origPushState) {
    history.pushState = function(...args) {
      const res = _origPushState.apply(this, args);
      setTimeout(xvsScheduleReposition, 50);
      return res;
    };
  }
  const _origReplaceState = history.replaceState;
  if (_origReplaceState) {
    history.replaceState = function(...args) {
      const res = _origReplaceState.apply(this, args);
      setTimeout(xvsScheduleReposition, 50);
      return res;
    };
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setTimeout(xvsScheduleReposition, 100);
    }
  });

  setInterval(xvsScanForVideos, 2500);

  // ============================================================
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

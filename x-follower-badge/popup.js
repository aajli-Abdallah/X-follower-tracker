// X Follower Tracker & Enhancer - Popup Controller v2.0.3

const DEFAULTS = {
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

// DOM Elements - Settings
const autoExpandToggle = document.getElementById("autoExpandShowMore");
const followerBadgeToggle = document.getElementById("showFollowerBadge");
const ratioToggle = document.getElementById("showRatio");
const newAccountToggle = document.getElementById("showNewAccountWarning");
const crmTagsToggle = document.getElementById("showCrmTags");
const dimLowToggle = document.getElementById("dimLowFollowers");
const thresholdInput = document.getElementById("minFollowerThreshold");
const dimOpacityInput = document.getElementById("dimOpacity");
const dimOpacityVal = document.getElementById("dimOpacityVal");
const undimOnHoverToggle = document.getElementById("undimOnHover");
const dimmerSubcontrols = document.getElementById("dimmerSubcontrols");

// DOM Elements - Tabs
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");
const crmCountBadge = document.getElementById("crmCountBadge");

// DOM Elements - CRM
const crmSearchInput = document.getElementById("crmSearchInput");
const crmUserList = document.getElementById("crmUserList");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");

// DOM Elements - Engine
const queryIdDisplay = document.getElementById("queryIdDisplay");
const cachedCountEl = document.getElementById("cachedCount");
const clearCacheBtn = document.getElementById("clearCacheBtn");
const clearCrmBtn = document.getElementById("clearCrmBtn");

// DOM Elements - Video Speed
const videoSpeedEnabledToggle = document.getElementById("videoSpeedEnabled");
const videoPresetsInput = document.getElementById("videoPresets");
const videoUiModeToggle = document.getElementById("videoUiMode");
const videoAutoHideToggle = document.getElementById("videoAutoHide");
const videoPositionSelect = document.getElementById("videoPosition");
const videoShowSeekToggle = document.getElementById("videoShowSeekButtons");
const videoShowPipToggle = document.getElementById("videoShowPipButton");
const videoShowShotToggle = document.getElementById("videoShowScreenshotButton");
const videoAudioBoostInput = document.getElementById("videoAudioBoost");
const videoAudioBoostVal = document.getElementById("videoAudioBoostVal");

let activeCrmData = {};

// --- Tab Switching ---
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    tabPanes.forEach((p) => p.classList.remove("active"));

    btn.classList.add("active");
    const targetPane = document.getElementById(`pane-${btn.dataset.tab}`);
    if (targetPane) targetPane.classList.add("active");

    if (btn.dataset.tab === "crm") {
      renderCrmList();
    }
  });
});

function updateDimmerSubcontrolsVisibility(enabled) {
  if (dimmerSubcontrols) {
    dimmerSubcontrols.style.display = enabled ? "flex" : "none";
  }
}

// --- Settings Management ---
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
      "videoPresets",
      "videoAutoHide",
      "videoPosition",
      "videoUiMode",
      "videoShowSeekButtons",
      "videoShowPipButton",
      "videoShowScreenshotButton",
      "videoAudioBoost",
    ]);

    autoExpandToggle.checked = stored.autoExpandShowMore !== undefined ? stored.autoExpandShowMore : DEFAULTS.autoExpandShowMore;
    followerBadgeToggle.checked = stored.showFollowerBadge !== undefined ? stored.showFollowerBadge : DEFAULTS.showFollowerBadge;
    ratioToggle.checked = stored.showRatio !== undefined ? stored.showRatio : DEFAULTS.showRatio;
    newAccountToggle.checked = stored.showNewAccountWarning !== undefined ? stored.showNewAccountWarning : DEFAULTS.showNewAccountWarning;
    crmTagsToggle.checked = stored.showCrmTags !== undefined ? stored.showCrmTags : DEFAULTS.showCrmTags;
    
    const isDimEnabled = stored.dimLowFollowers !== undefined ? stored.dimLowFollowers : DEFAULTS.dimLowFollowers;
    dimLowToggle.checked = isDimEnabled;
    updateDimmerSubcontrolsVisibility(isDimEnabled);

    thresholdInput.value = stored.minFollowerThreshold !== undefined ? stored.minFollowerThreshold : DEFAULTS.minFollowerThreshold;

    const opacity = stored.dimOpacity !== undefined ? stored.dimOpacity : DEFAULTS.dimOpacity;
    dimOpacityInput.value = opacity;
    dimOpacityVal.textContent = `${opacity}%`;

    undimOnHoverToggle.checked = stored.undimOnHover !== undefined ? stored.undimOnHover : DEFAULTS.undimOnHover;

    if (stored.customQueryId) {
      queryIdDisplay.textContent = stored.customQueryId;
    } else {
      queryIdDisplay.textContent = "G3KGOASz96M... (Default)";
    }

    // Video Speed Settings
    if (videoSpeedEnabledToggle) videoSpeedEnabledToggle.checked = stored.videoSpeedEnabled !== undefined ? stored.videoSpeedEnabled : DEFAULTS.videoSpeedEnabled;
    if (videoPresetsInput) {
      const presets = stored.videoPresets || DEFAULTS.videoPresets;
      videoPresetsInput.value = Array.isArray(presets) ? presets.join(', ') : presets;
    }
    if (videoUiModeToggle) videoUiModeToggle.checked = (stored.videoUiMode !== undefined ? stored.videoUiMode : DEFAULTS.videoUiMode) === 'compact';
    if (videoAutoHideToggle) videoAutoHideToggle.checked = stored.videoAutoHide !== undefined ? stored.videoAutoHide : DEFAULTS.videoAutoHide;
    if (videoPositionSelect) videoPositionSelect.value = stored.videoPosition || DEFAULTS.videoPosition;
    if (videoShowSeekToggle) videoShowSeekToggle.checked = stored.videoShowSeekButtons !== undefined ? stored.videoShowSeekButtons : DEFAULTS.videoShowSeekButtons;
    if (videoShowPipToggle) videoShowPipToggle.checked = stored.videoShowPipButton !== undefined ? stored.videoShowPipButton : DEFAULTS.videoShowPipButton;
    if (videoShowShotToggle) videoShowShotToggle.checked = stored.videoShowScreenshotButton !== undefined ? stored.videoShowScreenshotButton : DEFAULTS.videoShowScreenshotButton;
    const boost = stored.videoAudioBoost !== undefined ? stored.videoAudioBoost : DEFAULTS.videoAudioBoost;
    if (videoAudioBoostInput) videoAudioBoostInput.value = boost;
    if (videoAudioBoostVal) videoAudioBoostVal.textContent = `${boost}%`;

  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

// Bind setting event listeners
autoExpandToggle.addEventListener("change", () => chrome.storage.local.set({ autoExpandShowMore: autoExpandToggle.checked }));
followerBadgeToggle.addEventListener("change", () => chrome.storage.local.set({ showFollowerBadge: followerBadgeToggle.checked }));
ratioToggle.addEventListener("change", () => chrome.storage.local.set({ showRatio: ratioToggle.checked }));
newAccountToggle.addEventListener("change", () => chrome.storage.local.set({ showNewAccountWarning: newAccountToggle.checked }));
crmTagsToggle.addEventListener("change", () => chrome.storage.local.set({ showCrmTags: crmTagsToggle.checked }));

dimLowToggle.addEventListener("change", () => {
  chrome.storage.local.set({ dimLowFollowers: dimLowToggle.checked });
  updateDimmerSubcontrolsVisibility(dimLowToggle.checked);
});

thresholdInput.addEventListener("change", () => {
  const val = Math.max(1, parseInt(thresholdInput.value, 10) || 50);
  thresholdInput.value = val;
  chrome.storage.local.set({ minFollowerThreshold: val });
});

dimOpacityInput.addEventListener("input", () => {
  const val = parseInt(dimOpacityInput.value, 10);
  dimOpacityVal.textContent = `${val}%`;
  chrome.storage.local.set({ dimOpacity: val });
});

undimOnHoverToggle.addEventListener("change", () => {
  chrome.storage.local.set({ undimOnHover: undimOnHoverToggle.checked });
});

// --- Video Speed Event Listeners ---
if (videoSpeedEnabledToggle) {
  videoSpeedEnabledToggle.addEventListener("change", () => chrome.storage.local.set({ videoSpeedEnabled: videoSpeedEnabledToggle.checked }));
}
if (videoPresetsInput) {
  videoPresetsInput.addEventListener("change", () => {
    const presets = videoPresetsInput.value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0);
    if (presets.length > 0) {
      chrome.storage.local.set({ videoPresets: presets });
    }
  });
}
if (videoUiModeToggle) {
  videoUiModeToggle.addEventListener("change", () => chrome.storage.local.set({ videoUiMode: videoUiModeToggle.checked ? 'compact' : 'full' }));
}
if (videoAutoHideToggle) {
  videoAutoHideToggle.addEventListener("change", () => chrome.storage.local.set({ videoAutoHide: videoAutoHideToggle.checked }));
}
if (videoPositionSelect) {
  videoPositionSelect.addEventListener("change", () => chrome.storage.local.set({ videoPosition: videoPositionSelect.value }));
}
if (videoShowSeekToggle) {
  videoShowSeekToggle.addEventListener("change", () => chrome.storage.local.set({ videoShowSeekButtons: videoShowSeekToggle.checked }));
}
if (videoShowPipToggle) {
  videoShowPipToggle.addEventListener("change", () => chrome.storage.local.set({ videoShowPipButton: videoShowPipToggle.checked }));
}
if (videoShowShotToggle) {
  videoShowShotToggle.addEventListener("change", () => chrome.storage.local.set({ videoShowScreenshotButton: videoShowShotToggle.checked }));
}
if (videoAudioBoostInput) {
  videoAudioBoostInput.addEventListener("input", () => {
    const val = parseInt(videoAudioBoostInput.value, 10);
    if (videoAudioBoostVal) videoAudioBoostVal.textContent = `${val}%`;
    chrome.storage.local.set({ videoAudioBoost: val });
  });
}

// --- CRM Directory & Notes ---
async function loadCrmData() {
  try {
    const res = await chrome.storage.local.get("xfb_crm");
    activeCrmData = res.xfb_crm || {};
    const count = Object.keys(activeCrmData).length;
    crmCountBadge.textContent = String(count);
  } catch (err) {
    console.error("Failed to load CRM data:", err);
  }
}

function renderCrmList() {
  const query = (crmSearchInput.value || "").trim().toLowerCase();
  crmUserList.innerHTML = "";

  const handles = Object.keys(activeCrmData);
  const filtered = handles.filter((handle) => {
    if (!query) return true;
    if (handle.includes(query)) return true;
    const item = activeCrmData[handle];
    if (item.note && item.note.toLowerCase().includes(query)) return true;
    if (item.tags && item.tags.some((t) => t.toLowerCase().includes(query))) return true;
    return false;
  });

  if (filtered.length === 0) {
    crmUserList.innerHTML = `
      <div class="crm-empty-state">
        <div class="crm-empty-icon">🏷️</div>
        <div>${query ? "No matching tagged users found" : "No tagged accounts yet.<br>Click any follower badge on your X timeline to add tags and notes!"}</div>
      </div>
    `;
    return;
  }

  // Sort by most recently updated
  filtered.sort((a, b) => (activeCrmData[b].updatedAt || 0) - (activeCrmData[a].updatedAt || 0));

  filtered.forEach((handle) => {
    const item = activeCrmData[handle];
    const card = document.createElement("div");
    card.className = "crm-card";

    const tagsHtml = (item.tags || [])
      .map((t) => `<span class="crm-tag-badge">${escapeHtml(t)}</span>`)
      .join("");

    const noteHtml = item.note ? `<div class="crm-card-note">${escapeHtml(item.note)}</div>` : "";

    card.innerHTML = `
      <div class="crm-card-header">
        <span class="crm-card-handle">@${escapeHtml(handle)}</span>
        <button class="crm-card-delete-btn" title="Delete record" data-handle="${escapeHtml(handle)}">✕</button>
      </div>
      ${tagsHtml ? `<div class="crm-card-tags">${tagsHtml}</div>` : ""}
      ${noteHtml}
    `;

    // Delete handler
    card.querySelector(".crm-card-delete-btn").addEventListener("click", async () => {
      delete activeCrmData[handle];
      await chrome.storage.local.set({ xfb_crm: activeCrmData });
      crmCountBadge.textContent = String(Object.keys(activeCrmData).length);
      renderCrmList();
    });

    crmUserList.appendChild(card);
  });
}

crmSearchInput.addEventListener("input", renderCrmList);

// Export to CSV
exportCsvBtn.addEventListener("click", () => {
  const handles = Object.keys(activeCrmData);
  if (handles.length === 0) {
    alert("No CRM data to export!");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,Handle,Tags,Note,UpdatedAt\n";
  handles.forEach((h) => {
    const item = activeCrmData[h];
    const tagsStr = (item.tags || []).join(";");
    const cleanNote = (item.note || "").replace(/"/g, '""');
    const dateStr = item.updatedAt ? new Date(item.updatedAt).toISOString() : "";
    csvContent += `"${h}","${tagsStr}","${cleanNote}","${dateStr}"\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `x_crm_contacts_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
});

// Export to JSON
exportJsonBtn.addEventListener("click", () => {
  const handles = Object.keys(activeCrmData);
  if (handles.length === 0) {
    alert("No CRM data to export!");
    return;
  }

  const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeCrmData, null, 2));
  const link = document.createElement("a");
  link.setAttribute("href", jsonStr);
  link.setAttribute("download", `x_crm_contacts_${Date.now()}.json`);
  document.body.appendChild(link);
  link.click();
  link.remove();
});

// --- Engine & Maintenance ---
async function updateCacheStats() {
  try {
    const all = await chrome.storage.local.get(null);
    let count = 0;
    for (const key of Object.keys(all)) {
      if (key.startsWith("xfb:")) count++;
    }
    cachedCountEl.textContent = String(count);

    if (all.customQueryId) {
      queryIdDisplay.textContent = all.customQueryId;
    }
  } catch (err) {
    console.error("Failed to count cache entries:", err);
  }
}

clearCacheBtn.addEventListener("click", async () => {
  try {
    const all = await chrome.storage.local.get(null);
    const keysToRemove = Object.keys(all).filter((k) => k.startsWith("xfb:"));
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
    clearCacheBtn.textContent = "Cleared!";
    updateCacheStats();
    setTimeout(() => {
      clearCacheBtn.textContent = "Clear Cache";
    }, 1200);
  } catch (err) {
    console.error("Failed to clear cache:", err);
  }
});

clearCrmBtn.addEventListener("click", async () => {
  if (!confirm("Are you sure you want to delete ALL saved tags and notes? This cannot be undone.")) return;
  try {
    await chrome.storage.local.remove("xfb_crm");
    activeCrmData = {};
    crmCountBadge.textContent = "0";
    renderCrmList();
    clearCrmBtn.textContent = "Deleted!";
    setTimeout(() => {
      clearCrmBtn.textContent = "Clear All CRM Tags & Notes";
    }, 1500);
  } catch (err) {
    console.error("Failed to delete CRM:", err);
  }
});

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// Storage Listener for live sync
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.xfb_crm !== undefined) {
    activeCrmData = changes.xfb_crm.newValue || {};
    crmCountBadge.textContent = String(Object.keys(activeCrmData).length);
    if (document.getElementById("pane-crm").classList.contains("active")) {
      renderCrmList();
    }
  }
  if (changes.customQueryId !== undefined) {
    queryIdDisplay.textContent = changes.customQueryId.newValue;
  }
});

// Initialization
document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await loadCrmData();
  await updateCacheStats();
});

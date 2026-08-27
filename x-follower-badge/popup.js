// X Follower Tracker & Enhancer - Popup Controller

const DEFAULTS = {
  autoExpandShowMore: true,
  showFollowerBadge: true
};

const showMoreToggle = document.getElementById('autoExpandShowMore');
const followerBadgeToggle = document.getElementById('showFollowerBadge');
const cachedCountEl = document.getElementById('cachedCount');
const clearCacheBtn = document.getElementById('clearCacheBtn');

// Load stored settings
async function loadSettings() {
  try {
    const settings = await chrome.storage.local.get(['autoExpandShowMore', 'showFollowerBadge']);
    showMoreToggle.checked = settings.autoExpandShowMore !== undefined ? settings.autoExpandShowMore : DEFAULTS.autoExpandShowMore;
    followerBadgeToggle.checked = settings.showFollowerBadge !== undefined ? settings.showFollowerBadge : DEFAULTS.showFollowerBadge;
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

// Update cache item count
async function updateCacheStats() {
  try {
    const all = await chrome.storage.local.get(null);
    let count = 0;
    for (const key of Object.keys(all)) {
      if (key.startsWith('xfb:')) count++;
    }
    cachedCountEl.textContent = String(count);
  } catch (err) {
    console.error('Failed to count cache entries:', err);
  }
}

// Event Listeners
showMoreToggle.addEventListener('change', async () => {
  await chrome.storage.local.set({ autoExpandShowMore: showMoreToggle.checked });
});

followerBadgeToggle.addEventListener('change', async () => {
  await chrome.storage.local.set({ showFollowerBadge: followerBadgeToggle.checked });
});

clearCacheBtn.addEventListener('click', async () => {
  try {
    const all = await chrome.storage.local.get(null);
    const keysToRemove = Object.keys(all).filter((k) => k.startsWith('xfb:'));
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
    clearCacheBtn.textContent = 'Cleared!';
    updateCacheStats();
    setTimeout(() => {
      clearCacheBtn.textContent = 'Clear Cache';
    }, 1200);
  } catch (err) {
    console.error('Failed to clear cache:', err);
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  updateCacheStats();
});

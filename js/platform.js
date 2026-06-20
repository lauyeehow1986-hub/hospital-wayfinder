// Thin device/platform shim. Keeps localStorage + (future) geolocation/QR in one
// place so a Capacitor swap later is a one-file change.

// Pure: compute the new recents list (newest first, deduped, capped).
export function addRecent(list, id, max = 5) {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

const RECENT_KEY = 'hw:recent';
const PREFS_KEY = 'hw:prefs';

function loadJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — ignore */
  }
}

export function getRecent() {
  return loadJSON(RECENT_KEY, []);
}

export function pushRecent(id) {
  const next = addRecent(getRecent(), id);
  saveJSON(RECENT_KEY, next);
  return next;
}

export function getPrefs() {
  return loadJSON(PREFS_KEY, { contrast: 'normal', text: 'normal' });
}

export function savePrefs(prefs) {
  saveJSON(PREFS_KEY, prefs);
}

# Client PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the offline-first patient-facing PWA — search two landmarks, see a comfort-aware route with a turn-by-turn breakdown, and browse nearby places of interest — on top of the tested Plan 1 routing core.

**Architecture:** Vanilla-JS ES modules, no framework/build. Pure, unit-tested presenters in `render.js`/`platform.js` produce display data; a thin `app.js` paints the DOM. A service worker precaches the app shell + `data/*.json` for full offline use. Calm clinical light theme with a built-in accessibility toggle.

**Tech Stack:** Vanilla JS (ES modules), Node 18+ built-in test runner, HTML/CSS, Service Worker + Web App Manifest. No dependencies, no icon-font/CDN (offline-safe).

**Spec:** `docs/superpowers/specs/2026-06-20-client-pwa-design.md`

---

## File structure (created by this plan)

| File | Responsibility |
|---|---|
| `js/render.js` | PURE presenters: `PATH_TYPE_META`, `CATEGORY_META`, `modeToOpts`, `routeToRows`, `comfortSegments`, `poiRow`. |
| `js/platform.js` | `addRecent` (pure) + `localStorage` wrappers for recents & prefs. |
| `js/app.js` | Thin DOM layer: load data, build graph, wire search/route/nearby/tabs/a11y. |
| `js/pwa.js` | Service-worker registration. |
| `sw.js` | Offline-first cache (shell + data). |
| `index.html` | Semantic app shell. |
| `css/styles.css` | Calm-clinical theme + `data-contrast`/`data-text` variants. |
| `manifest.json`, `icon-192.svg`, `icon-512.svg` | PWA install metadata + icons. |
| `test/render.test.js`, `test/platform.test.js` | Unit tests for the pure seam. |

Plan 1 modules (`js/wayfinding.js`, `js/mapData.js`, `js/places.js`) are imported as-is.

---

## Task 1: render.js — meta maps + `modeToOpts`

**Files:**
- Create: `js/render.js`
- Test: `test/render.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/render.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATH_TYPE_META, CATEGORY_META, modeToOpts } from '../js/render.js';

test('PATH_TYPE_META covers all four path types with colour + label', () => {
  for (const t of ['indoor', 'outdoor', 'underground', 'sheltered']) {
    assert.ok(PATH_TYPE_META[t], `missing ${t}`);
    assert.match(PATH_TYPE_META[t].color, /^#[0-9a-f]{6}$/i);
    assert.ok(PATH_TYPE_META[t].label.length > 0);
  }
});

test('CATEGORY_META covers the POI categories', () => {
  for (const c of ['food', 'toilet', 'charging', 'rest_area', 'convenience', 'atm', 'pharmacy', 'water']) {
    assert.ok(CATEGORY_META[c], `missing ${c}`);
    assert.ok(CATEGORY_META[c].label.length > 0);
  }
});

test('modeToOpts maps the three UI modes to routing options', () => {
  assert.deepEqual(modeToOpts('fastest'), { mode: 'fastest', accessibleOnly: false });
  assert.deepEqual(modeToOpts('sheltered'), { mode: 'sheltered', accessibleOnly: false });
  assert.deepEqual(modeToOpts('step-free'), { mode: 'sheltered', accessibleOnly: true });
  assert.deepEqual(modeToOpts('anything-else'), { mode: 'sheltered', accessibleOnly: false });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/render.test.js`
Expected: FAIL — module `../js/render.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `js/render.js`:

```js
// Pure presentation helpers — no DOM. Shared by app.js (browser) and tests (Node).

export const PATH_TYPE_META = {
  indoor: { color: '#2563eb', icon: 'building', label: 'Indoor' },
  sheltered: { color: '#16a34a', icon: 'umbrella', label: 'Sheltered' },
  underground: { color: '#7c3aed', icon: 'stairs-down', label: 'Underground' },
  outdoor: { color: '#d97706', icon: 'sun', label: 'Outdoor' },
};

export const CATEGORY_META = {
  food: { icon: 'food', label: 'Food' },
  toilet: { icon: 'toilet', label: 'Toilet' },
  charging: { icon: 'plug', label: 'Charging' },
  rest_area: { icon: 'seat', label: 'Rest area' },
  convenience: { icon: 'store', label: 'Convenience' },
  atm: { icon: 'cash', label: 'ATM' },
  pharmacy: { icon: 'pill', label: 'Pharmacy' },
  water: { icon: 'droplet', label: 'Water' },
  info: { icon: 'info', label: 'Info' },
};

// Map a UI mode name to wayfinding.findRoute options.
export function modeToOpts(modeName) {
  if (modeName === 'fastest') return { mode: 'fastest', accessibleOnly: false };
  if (modeName === 'step-free') return { mode: 'sheltered', accessibleOnly: true };
  return { mode: 'sheltered', accessibleOnly: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/render.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add js/render.js test/render.test.js
git commit -m "feat(client): render meta maps and modeToOpts"
```

---

## Task 2: render.js — `routeToRows`

**Files:**
- Modify: `js/render.js`
- Test: `test/render.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `test/render.test.js`:

```js
import { buildGraph, findRoute } from '../js/wayfinding.js';
import { routeToRows } from '../js/render.js';

const g = buildGraph(
  [{ id: 'a', label: 'A lobby' }, { id: 'b', label: 'B junction' }, { id: 'c', label: 'C clinic' }],
  [
    { id: 'e1', from: 'a', to: 'b', path_type: 'indoor', walk_time_minutes: 2, accessible: true, notes: 'Air-con' },
    { id: 'e2', from: 'b', to: 'c', path_type: 'underground', walk_time_minutes: 3, accessible: true, notes: '' },
  ],
);

test('routeToRows builds start, step, end rows with edge detail', () => {
  const rows = routeToRows(g, findRoute(g, 'a', 'c', { mode: 'fastest' }));
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ['start', 'step', 'end'],
  );
  assert.equal(rows[0].label, 'A lobby');
  assert.equal(rows[1].label, 'B junction');
  assert.equal(rows[1].pathType, 'indoor');
  assert.equal(rows[1].minutes, 2);
  assert.equal(rows[1].notes, 'Air-con');
  assert.equal(rows[2].label, 'C clinic');
  assert.equal(rows[2].pathType, 'underground');
});

test('routeToRows returns [] for a null result', () => {
  assert.deepEqual(routeToRows(g, null), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/render.test.js`
Expected: FAIL — `routeToRows` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `js/render.js`:

```js
// Turn a findRoute() result into ordered display rows.
// row: { kind: 'start'|'step'|'end', label, pathType?, minutes?, notes?, accessible? }
export function routeToRows(graph, result) {
  if (!result) return [];
  const labelOf = (id) => (graph.nodes.get(id) ? graph.nodes.get(id).label : id);
  const rows = [{ kind: 'start', label: labelOf(result.path[0]) }];
  result.edges.forEach((edge, i) => {
    const toId = result.path[i + 1];
    const last = i === result.edges.length - 1;
    rows.push({
      kind: last ? 'end' : 'step',
      label: labelOf(toId),
      pathType: edge.path_type,
      minutes: edge.walk_time_minutes,
      notes: edge.notes || '',
      accessible: edge.accessible !== false,
    });
  });
  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/render.js test/render.test.js
git commit -m "feat(client): routeToRows display builder"
```

---

## Task 3: render.js — `comfortSegments`

**Files:**
- Modify: `js/render.js`
- Test: `test/render.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `test/render.test.js`:

```js
import { comfortSegments } from '../js/render.js';

test('comfortSegments maps byTypePct to coloured segments, largest first', () => {
  const segs = comfortSegments({ byTypePct: { indoor: 60, underground: 30, sheltered: 10 } });
  assert.deepEqual(segs.map((s) => s.pathType), ['indoor', 'underground', 'sheltered']);
  assert.equal(segs[0].pct, 60);
  assert.equal(segs[0].color, PATH_TYPE_META.indoor.color);
});

test('comfortSegments returns [] when there is no summary', () => {
  assert.deepEqual(comfortSegments(null), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/render.test.js`
Expected: FAIL — `comfortSegments` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `js/render.js`:

```js
// Turn a summarizeRoute() summary into sized, coloured bar segments.
export function comfortSegments(summary) {
  if (!summary || !summary.byTypePct) return [];
  return Object.entries(summary.byTypePct)
    .map(([pathType, pct]) => ({
      pathType,
      pct,
      color: PATH_TYPE_META[pathType] ? PATH_TYPE_META[pathType].color : '#5b727c',
    }))
    .sort((a, b) => b.pct - a.pct);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/render.js test/render.test.js
git commit -m "feat(client): comfortSegments bar builder"
```

---

## Task 4: render.js — `poiRow`

**Files:**
- Modify: `js/render.js`
- Test: `test/render.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `test/render.test.js`:

```js
import { poiRow } from '../js/render.js';

test('poiRow formats a food POI with price tier badge', () => {
  const row = poiRow({ name: 'Kopitiam', category: 'food', attributes: { price_tier: 1 } }, 4);
  assert.equal(row.name, 'Kopitiam');
  assert.equal(row.minutes, 4);
  assert.ok(row.badges.includes('$'));
});

test('poiRow adds accessible and 24h badges', () => {
  const row = poiRow({ name: 'Toilet', category: 'toilet', attributes: { accessible: true, open_24h: true } }, 2);
  assert.ok(row.badges.includes('accessible'));
  assert.ok(row.badges.includes('24h'));
});

test('poiRow falls back gracefully for unknown category', () => {
  const row = poiRow({ name: 'Mystery', category: 'zzz', attributes: {} }, 1);
  assert.equal(row.name, 'Mystery');
  assert.deepEqual(row.badges, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/render.test.js`
Expected: FAIL — `poiRow` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `js/render.js`:

```js
// Format a POI + walk time into a display row.
export function poiRow(poi, minutes) {
  const meta = CATEGORY_META[poi.category] || { icon: 'pin', label: poi.category };
  const attrs = poi.attributes || {};
  const badges = [];
  if (poi.category === 'food' && attrs.price_tier) badges.push('$'.repeat(attrs.price_tier));
  if (attrs.accessible === true) badges.push('accessible');
  if (attrs.open_24h === true) badges.push('24h');
  return { icon: meta.icon, category: meta.label, name: poi.name, minutes, badges };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/render.js test/render.test.js
git commit -m "feat(client): poiRow display formatter"
```

---

## Task 5: platform.js — recents + storage shim

**Files:**
- Create: `js/platform.js`
- Test: `test/platform.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/platform.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addRecent } from '../js/platform.js';

test('addRecent prepends new id', () => {
  assert.deepEqual(addRecent(['b', 'c'], 'a'), ['a', 'b', 'c']);
});

test('addRecent dedupes and moves existing id to front', () => {
  assert.deepEqual(addRecent(['a', 'b', 'c'], 'c'), ['c', 'a', 'b']);
});

test('addRecent caps the list length', () => {
  assert.deepEqual(addRecent(['a', 'b', 'c', 'd', 'e'], 'f', 5), ['f', 'a', 'b', 'c', 'd']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/platform.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `js/platform.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/platform.test.js`
Expected: PASS (the localStorage wrappers are not exercised in Node — only `addRecent` is imported, and the module body never touches `localStorage` at import time).

- [ ] **Step 5: Commit**

```bash
git add js/platform.js test/platform.test.js
git commit -m "feat(client): platform shim (recents + prefs)"
```

---

## Task 6: manifest + icons

**Files:**
- Create: `manifest.json`, `icon-192.svg`, `icon-512.svg`

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "name": "Hospital Wayfinder",
  "short_name": "Wayfinder",
  "description": "Offline indoor, underground and sheltered wayfinding for the Outram hospital cluster, plus nearby amenities.",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#f5f7f8",
  "theme_color": "#0f9488",
  "lang": "en-SG",
  "categories": ["medical", "navigation", "utilities"],
  "icons": [
    { "src": "icon-192.svg", "sizes": "192x192", "type": "image/svg+xml", "purpose": "any" },
    { "src": "icon-512.svg", "sizes": "512x512", "type": "image/svg+xml", "purpose": "any" },
    { "src": "icon-512.svg", "sizes": "512x512", "type": "image/svg+xml", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 2: Create `icon-512.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#0f9488"/>
  <path d="M256 104a112 112 0 0 0-112 112c0 84 112 192 112 192s112-108 112-192A112 112 0 0 0 256 104zm0 152a40 40 0 1 1 0-80 40 40 0 0 1 0 80z" fill="#ffffff"/>
</svg>
```

- [ ] **Step 3: Create `icon-192.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="192" height="192">
  <rect width="512" height="512" rx="96" fill="#0f9488"/>
  <path d="M256 104a112 112 0 0 0-112 112c0 84 112 192 112 192s112-108 112-192A112 112 0 0 0 256 104zm0 152a40 40 0 1 1 0-80 40 40 0 0 1 0 80z" fill="#ffffff"/>
</svg>
```

- [ ] **Step 4: Validate JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`
Expected: `manifest ok`

- [ ] **Step 5: Commit**

```bash
git add manifest.json icon-192.svg icon-512.svg
git commit -m "feat(client): web app manifest and icons"
```

---

## Task 7: css/styles.css

**Files:**
- Create: `css/styles.css`

- [ ] **Step 1: Create `css/styles.css`**

```css
:root {
  --bg: #f5f7f8; --surface: #fff; --text: #1a2b32; --muted: #5b727c;
  --primary: #0f9488; --primary-tint: #e6f4f2; --primary-deep: #0f3d39;
  --border: #dce5e7; --radius: 12px; --fs: 16px; --bw: 1px;
}
html[data-text="large"] { --fs: 19px; }
html[data-contrast="high"] {
  --bg: #fff; --surface: #fff; --text: #0a0a0a; --muted: #222;
  --primary: #00695c; --primary-tint: #fff; --primary-deep: #003d33;
  --border: #0a0a0a; --bw: 2px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font: 400 var(--fs)/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-text-size-adjust: 100%; }
:focus { outline: none; }
:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; border-radius: 6px; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
header.app { position: sticky; top: 0; z-index: 10; background: var(--bg); border-bottom: var(--bw) solid var(--border); padding: 12px 16px; display: flex; align-items: center; gap: 10px; }
header.app .mark { width: 34px; height: 34px; border-radius: 9px; background: var(--primary); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 500; font-size: 13px; }
header.app h1 { font-size: 18px; font-weight: 500; }
header.app .a11y { margin-left: auto; min-width: 44px; min-height: 44px; border: var(--bw) solid var(--border); background: var(--surface); color: var(--text); border-radius: var(--radius); font-size: 16px; }
main { max-width: 600px; margin: 0 auto; padding: 16px; padding-bottom: 88px; }
nav.tabs { position: fixed; bottom: 0; left: 0; right: 0; display: flex; background: var(--surface); border-top: var(--bw) solid var(--border); }
nav.tabs button { flex: 1; min-height: 56px; border: 0; background: transparent; color: var(--muted); font-size: 13px; }
nav.tabs button[aria-selected="true"] { color: var(--primary); font-weight: 500; }
.field { position: relative; margin-bottom: 8px; }
.field input { width: 100%; min-height: 48px; padding: 10px 12px; font-size: var(--fs); background: var(--surface); color: var(--text); border: var(--bw) solid var(--border); border-radius: var(--radius); }
.suggest { position: absolute; z-index: 20; left: 0; right: 0; list-style: none; background: var(--surface); border: var(--bw) solid var(--border); border-radius: var(--radius); margin-top: 2px; max-height: 240px; overflow: auto; }
.suggest li { padding: 12px; cursor: pointer; border-bottom: var(--bw) solid var(--border); }
.suggest li:last-child { border-bottom: 0; }
.suggest li:hover { background: var(--primary-tint); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 12px; }
.chip { min-height: 40px; padding: 6px 12px; border-radius: 999px; border: var(--bw) solid var(--border); background: var(--surface); color: var(--text); font-size: 14px; }
.chip[aria-pressed="true"] { background: var(--primary); color: #fff; border-color: var(--primary); }
.chip:disabled { color: var(--muted); opacity: .7; }
.modes { display: flex; gap: 6px; margin: 4px 0 14px; }
.modes .chip { flex: 1; text-align: center; }
.swap { min-height: 40px; border: var(--bw) solid var(--border); background: var(--surface); color: var(--text); border-radius: var(--radius); padding: 6px 12px; margin-bottom: 8px; }
.banner { background: var(--primary-tint); color: var(--primary-deep); padding: 12px; border-radius: var(--radius); font-weight: 500; margin-bottom: 8px; }
.comfort { display: flex; height: 10px; border-radius: 999px; overflow: hidden; margin-bottom: 14px; background: var(--border); }
.comfort span { display: block; }
.steps { list-style: none; }
.step { display: flex; gap: 12px; padding: 10px 0; border-bottom: var(--bw) solid var(--border); }
.step .dot { width: 14px; height: 14px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; background: var(--muted); }
.step .dot-start { background: var(--primary); }
.step .sub { color: var(--muted); font-size: 14px; }
.msg { color: var(--muted); padding: 16px 0; }
.ref { margin-bottom: 10px; }
.poi { display: flex; align-items: center; gap: 10px; padding: 12px 0; border-bottom: var(--bw) solid var(--border); }
.poi-main { flex: 1; }
.tag { display: inline-block; background: var(--primary-tint); color: var(--primary-deep); font-size: 12px; padding: 2px 8px; border-radius: 6px; }
.badge { display: inline-block; background: var(--bg); border: var(--bw) solid var(--border); color: var(--muted); font-size: 12px; padding: 2px 8px; border-radius: 6px; margin-left: 6px; }
.route-here { min-height: 44px; border: var(--bw) solid var(--primary); background: var(--surface); color: var(--primary-deep); border-radius: var(--radius); padding: 8px 12px; }
.a11y-panel { background: var(--surface); border: var(--bw) solid var(--border); border-radius: var(--radius); padding: 12px; margin-bottom: 12px; }
.a11y-panel label { display: flex; align-items: center; gap: 10px; min-height: 44px; }
.about h2 { font-size: 18px; font-weight: 500; margin-bottom: 10px; }
.about p { margin-bottom: 10px; color: var(--muted); }
```

- [ ] **Step 2: Commit**

```bash
git add css/styles.css
git commit -m "feat(client): calm clinical theme with a11y variants"
```

---

## Task 8: index.html

**Files:**
- Create: `index.html`

- [ ] **Step 1: Create `index.html`**

```html
<!doctype html>
<html lang="en-SG" data-contrast="" data-text="">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0f9488">
  <title>Hospital Wayfinder</title>
  <link rel="manifest" href="manifest.json">
  <link rel="icon" href="icon-192.svg">
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <header class="app">
    <span class="mark" aria-hidden="true">HW</span>
    <h1>Hospital Wayfinder</h1>
    <button class="a11y" id="a11y-toggle" aria-label="Accessibility options">Aa</button>
  </header>
  <main>
    <div class="a11y-panel" id="a11y-panel" hidden>
      <label><input type="checkbox" id="pref-text"> Larger text</label>
      <label><input type="checkbox" id="pref-contrast"> High contrast</label>
    </div>

    <section id="tab-route" class="tab-panel" aria-label="Plan a route">
      <h2 class="sr-only">Plan a route</h2>
      <div class="field">
        <input id="from-input" type="text" placeholder="From…" autocomplete="off" aria-label="From">
        <ul class="suggest" id="from-suggest" role="listbox" hidden></ul>
      </div>
      <div class="chips" id="from-chips"></div>
      <button class="swap" id="swap" aria-label="Swap start and destination">⇅ Swap</button>
      <div class="field">
        <input id="to-input" type="text" placeholder="To…" autocomplete="off" aria-label="To">
        <ul class="suggest" id="to-suggest" role="listbox" hidden></ul>
      </div>
      <div class="modes" id="mode-pills">
        <button class="chip" data-mode="fastest" aria-pressed="false">Fastest</button>
        <button class="chip" data-mode="sheltered" aria-pressed="true">Sheltered</button>
        <button class="chip" data-mode="step-free" aria-pressed="false">Step-free</button>
      </div>
      <div id="route-result"></div>
    </section>

    <section id="tab-nearby" class="tab-panel" aria-label="Nearby places" hidden>
      <h2 class="sr-only">Nearby places</h2>
      <div class="field">
        <input id="nearby-input" type="text" placeholder="Near which location?" autocomplete="off" aria-label="Reference location">
        <ul class="suggest" id="nearby-suggest" role="listbox" hidden></ul>
      </div>
      <div class="chips" id="nearby-cats"></div>
      <div id="nearby-result"></div>
    </section>

    <section id="tab-about" class="tab-panel about" aria-label="About" hidden>
      <h2>About</h2>
      <p>Offline wayfinding for the Outram hospital cluster — indoor, underground and sheltered routes between landmarks, plus nearby amenities.</p>
      <p>Routes last verified June 2026. Corridors change; if a route looks wrong, pick a nearby landmark.</p>
      <p>Version 0.2</p>
    </section>
  </main>
  <nav class="tabs" aria-label="Sections">
    <button data-tab="route" aria-selected="true">Route</button>
    <button data-tab="nearby" aria-selected="false">Nearby</button>
    <button data-tab="about" aria-selected="false">About</button>
  </nav>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat(client): app shell markup"
```

---

## Task 9: service worker + registration

**Files:**
- Create: `sw.js`, `js/pwa.js`

- [ ] **Step 1: Create `sw.js`**

```js
const CACHE = 'hw-v0.2';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/styles.css',
  './js/app.js', './js/wayfinding.js', './js/mapData.js', './js/places.js',
  './js/render.js', './js/platform.js', './js/pwa.js',
  './data/nodes.json', './data/edges.json', './data/pois.json',
  './icon-192.svg', './icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match('./index.html'))),
  );
});
```

- [ ] **Step 2: Create `js/pwa.js`**

```js
// Register the service worker for offline use.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add sw.js js/pwa.js
git commit -m "feat(client): offline-first service worker"
```

---

## Task 10: js/app.js — DOM wiring

**Files:**
- Create: `js/app.js`

- [ ] **Step 1: Create `js/app.js`**

```js
import { buildGraph, findRoute, summarizeRoute } from './wayfinding.js';
import { indexById, searchNodes } from './mapData.js';
import { poisNearNode } from './places.js';
import { PATH_TYPE_META, CATEGORY_META, modeToOpts, routeToRows, comfortSegments, poiRow } from './render.js';
import { getPrefs, savePrefs, getRecent, pushRecent } from './platform.js';
import './pwa.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { fromId: null, toId: null, mode: 'sheltered', nearbyRef: null, nearbyCat: 'all' };
let graph = null;
let nodes = [];
let pois = [];
let nodeIndex = new Map();

async function init() {
  applyPrefs(getPrefs());
  try {
    const [n, e, p] = await Promise.all([
      fetch('data/nodes.json').then((r) => r.json()),
      fetch('data/edges.json').then((r) => r.json()),
      fetch('data/pois.json').then((r) => r.json()),
    ]);
    nodes = n;
    pois = p;
    graph = buildGraph(n, e);
    nodeIndex = indexById(n);
  } catch {
    $('#route-result').innerHTML = '<p class="msg">Connect once to download maps for offline use.</p>';
    return;
  }
  wireTabs();
  wireSearch('#from-input', '#from-suggest', (id) => { state.fromId = id; renderRoute(); });
  wireSearch('#to-input', '#to-suggest', (id) => { state.toId = id; pushRecent(id); renderRoute(); });
  wireSearch('#nearby-input', '#nearby-suggest', (id) => { state.nearbyRef = id; renderNearby(); });
  wireModePills();
  wireSwap();
  wireNearbyCats();
  wireA11y();
  renderFromChips();
}

function applyPrefs(p) {
  document.documentElement.dataset.contrast = p.contrast === 'high' ? 'high' : '';
  document.documentElement.dataset.text = p.text === 'large' ? 'large' : '';
}

function wireTabs() {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      document.querySelectorAll('.tab-panel').forEach((s) => { s.hidden = s.id !== `tab-${tab}`; });
      if (tab === 'nearby') renderNearby();
    });
  });
}

function wireSearch(inputSel, suggestSel, onPick) {
  const input = $(inputSel);
  const box = $(suggestSel);
  input.addEventListener('input', () => {
    const matches = searchNodes(nodes, input.value).slice(0, 6);
    if (!matches.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = matches.map((n) => `<li role="option" data-id="${esc(n.id)}">${esc(n.label)}</li>`).join('');
    box.hidden = false;
  });
  box.addEventListener('click', (ev) => {
    const li = ev.target.closest('li[data-id]');
    if (!li) return;
    const node = nodeIndex.get(li.dataset.id);
    input.value = node.label;
    box.hidden = true;
    onPick(node.id);
  });
}

function wireModePills() {
  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      renderRoute();
    });
  });
}

function wireSwap() {
  $('#swap').addEventListener('click', () => {
    [state.fromId, state.toId] = [state.toId, state.fromId];
    $('#from-input').value = state.fromId ? nodeIndex.get(state.fromId).label : '';
    $('#to-input').value = state.toId ? nodeIndex.get(state.toId).label : '';
    renderRoute();
  });
}

function renderFromChips() {
  const presets = [
    { id: 'outram-mrt-exit', label: 'Outram MRT' },
    { id: 'nhcs-l1-entrance', label: 'Main entrance' },
  ].filter((c) => nodeIndex.has(c.id));
  const recents = getRecent().map((id) => nodeIndex.get(id)).filter(Boolean).slice(0, 3);
  const box = $('#from-chips');
  box.innerHTML = presets.map((c) => `<button class="chip" data-id="${esc(c.id)}">${esc(c.label)}</button>`).join('')
    + recents.map((n) => `<button class="chip" data-id="${esc(n.id)}">${esc(n.label)}</button>`).join('')
    + '<button class="chip" disabled>Scan QR (soon)</button>';
  box.querySelectorAll('button[data-id]').forEach((b) => b.addEventListener('click', () => {
    state.fromId = b.dataset.id;
    $('#from-input').value = nodeIndex.get(b.dataset.id).label;
    renderRoute();
  }));
}

function renderRoute() {
  const out = $('#route-result');
  if (!state.fromId || !state.toId) { out.innerHTML = ''; return; }
  if (state.fromId === state.toId) { out.innerHTML = '<p class="msg">You are already there.</p>'; return; }
  const result = findRoute(graph, state.fromId, state.toId, modeToOpts(state.mode));
  if (!result) { out.innerHTML = '<p class="msg">No route found — the map may be incomplete here. Try a nearby landmark.</p>'; return; }
  const summary = summarizeRoute(result);
  const segs = comfortSegments(summary);
  const rows = routeToRows(graph, result);
  out.innerHTML = `
    <div class="banner">${esc(summary.text)}</div>
    <div class="comfort" aria-hidden="true">${segs.map((s) => `<span style="width:${s.pct}%;background:${s.color}"></span>`).join('')}</div>
    <ol class="steps">${rows.map(stepRowHTML).join('')}</ol>`;
}

function stepRowHTML(row) {
  if (row.kind === 'start') {
    return `<li class="step"><span class="dot dot-start"></span><div><strong>${esc(row.label)}</strong><br><span class="sub">Start</span></div></li>`;
  }
  const meta = PATH_TYPE_META[row.pathType] || { color: 'var(--muted)', label: row.pathType };
  const arrive = row.kind === 'end' ? ' (arrive)' : '';
  const note = row.notes ? ` · ${esc(row.notes)}` : '';
  return `<li class="step"><span class="dot" style="background:${meta.color}"></span><div><strong>${esc(row.label)}${arrive}</strong><br><span class="sub">${esc(meta.label)} · ${row.minutes} min${note}</span></div></li>`;
}

function wireNearbyCats() {
  const cats = ['all', ...Object.keys(CATEGORY_META)];
  const box = $('#nearby-cats');
  box.innerHTML = cats.map((c) => {
    const label = c === 'all' ? 'All' : CATEGORY_META[c].label;
    return `<button class="chip" data-cat="${esc(c)}" aria-pressed="${c === 'all'}">${esc(label)}</button>`;
  }).join('');
  box.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    state.nearbyCat = b.dataset.cat;
    box.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderNearby();
  }));
}

function renderNearby() {
  const out = $('#nearby-result');
  const refId = state.nearbyRef || state.toId;
  if (!refId || !nodeIndex.has(refId)) { out.innerHTML = '<p class="msg">Search a location to find what is nearby.</p>'; return; }
  let list = poisNearNode(graph, pois, refId, { mode: 'sheltered' });
  if (state.nearbyCat !== 'all') list = list.filter((r) => r.poi.category === state.nearbyCat);
  if (!list.length) { out.innerHTML = '<p class="msg">Nothing found nearby in this category.</p>'; return; }
  out.innerHTML = `<p class="ref">Near: <strong>${esc(nodeIndex.get(refId).label)}</strong></p>`
    + list.map((r) => {
      const row = poiRow(r.poi, r.minutes);
      const badges = row.badges.map((b) => `<span class="badge">${esc(b)}</span>`).join('');
      return `<div class="poi"><div class="poi-main"><span class="tag">${esc(row.category)}</span> <strong>${esc(row.name)}</strong>${badges}<br><span class="sub">${row.minutes} min walk</span></div><button class="route-here" data-id="${esc(r.poi.node)}">Route here</button></div>`;
    }).join('');
  out.querySelectorAll('.route-here').forEach((b) => b.addEventListener('click', () => {
    state.toId = b.dataset.id;
    pushRecent(b.dataset.id);
    $('#to-input').value = nodeIndex.get(b.dataset.id).label;
    document.querySelector('[data-tab="route"]').click();
    renderRoute();
  }));
}

function wireA11y() {
  const panel = $('#a11y-panel');
  $('#a11y-toggle').addEventListener('click', () => { panel.hidden = !panel.hidden; });
  const prefs = getPrefs();
  $('#pref-text').checked = prefs.text === 'large';
  $('#pref-contrast').checked = prefs.contrast === 'high';
  const update = () => {
    const p = { text: $('#pref-text').checked ? 'large' : 'normal', contrast: $('#pref-contrast').checked ? 'high' : 'normal' };
    savePrefs(p);
    applyPrefs(p);
  };
  $('#pref-text').addEventListener('change', update);
  $('#pref-contrast').addEventListener('change', update);
}

init();
```

- [ ] **Step 2: Commit**

```bash
git add js/app.js
git commit -m "feat(client): app.js DOM wiring (route, nearby, tabs, a11y)"
```

---

## Task 11: Verify live + offline, changelog

**Files:**
- Create: `docs/changelog/v0.2.md`

- [ ] **Step 1: Run the full unit-test suite**

Run: `npm test`
Expected: all tests pass (Plan 1's 23 + render 10 + platform 3 = 36), exit 0.

- [ ] **Step 2: Serve and verify in Chrome**

Run: `python -m http.server 8080`
Open `http://localhost:8080`. Verify:
- Type "NHCS" in From → suggestions appear → pick one; pick a To (e.g. "Block 3 basement").
- A summary banner, comfort bar, and step list render.
- Switch mode pills (Fastest / Sheltered / Step-free) → route updates.
- Quick chips (Outram MRT, Main entrance) set From; Swap exchanges ends.
- Nearby tab: pick a location, tap category chips, tap "Route here" → jumps to Route with that destination.
- Accessibility: tap "Aa" → toggle Larger text + High contrast → layout responds and persists on reload.

- [ ] **Step 3: Verify offline**

In Chrome DevTools → Application → Service Workers, confirm `sw.js` is activated.
Then DevTools → Network → check **Offline**, reload the page.
Expected: app still loads and routes work (shell + data served from cache).

- [ ] **Step 4: Write the changelog**

Create `docs/changelog/v0.2.md`:

```markdown
# v0.2 — Client PWA

- Patient-facing PWA over the Plan 1 routing core: From/To search with
  autocomplete, route modes (Fastest / Sheltered / Step-free), summary banner,
  comfort proportion bar, and a turn-by-turn step list.
- Nearby tab: browse POIs by category from a chosen location, sorted by walk
  time, with "Route here".
- Calm clinical light theme with a built-in accessibility toggle (larger text +
  high contrast), persisted across sessions.
- Offline-first: service worker precaches the app shell and data; works with no
  network. Installable (web app manifest + icons).
- Pure presenters (render.js, platform.js) unit-tested; 36 tests total.
```

- [ ] **Step 5: Commit**

```bash
git add docs/changelog/v0.2.md
git commit -m "docs: v0.2 changelog (client PWA)"
```

---

## Done criteria

- `npm test` green (36 tests).
- App loads at `http://localhost:8080`, routes in all three modes, browses Nearby,
  toggles accessibility, and **still works with the network set to Offline**.
- `sw.js` registers and serves the shell + `data/*.json` from cache.
- Plan 1 modules unchanged; all new branching logic lives in tested `render.js` /
  `platform.js`.

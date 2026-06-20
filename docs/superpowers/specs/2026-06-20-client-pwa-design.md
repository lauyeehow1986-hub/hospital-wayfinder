# Hospital Wayfinder — Client PWA Design (Plan 2)

**Date:** 2026-06-20
**Status:** Approved (layout + visual style), pending spec review
**Builds on:** `docs/superpowers/specs/2026-06-20-hospital-wayfinder-design.md` (v1 design)
and Plan 1 (routing core & data layer — `wayfinding`, `mapData`, `places`, validator).

## 1. Goal

The patient-facing, **offline-first** PWA that turns the tested routing core into a
usable app: search two landmarks → see a comfort-aware route with a turn-by-turn
breakdown; browse nearby places of interest. Reuses the Plan 1 modules untouched.

## 2. Visual identity (its own, not the bus tracker's)

A **calm, clinical, light** aesthetic for stressed / elderly / unwell users — clear,
reassuring, high-contrast, big tap targets. Flat (no gradients/shadows).

- **Base palette:** page `#f5f7f8`, surface `#ffffff`, text `#1a2b32`, muted
  `#5b727c`, primary teal `#0f9488` (tint `#e6f4f2`, deep `#0f3d39` for text on tint).
- **Path-type semantic colors** (the functional core — used for step markers and the
  comfort bar, with a one-line legend): indoor `#2563eb`, sheltered `#16a34a`,
  underground `#7c3aed`, outdoor `#d97706`.
- **Typography:** offline-safe system font stack (`system-ui, -apple-system, "Segoe
  UI", Roboto, sans-serif`). Body ≥16px, generous line-height, two weights (400/500).
- **Accessibility (WCAG 2.1 AA):** semantic HTML landmarks, `:focus-visible` rings,
  `prefers-reduced-motion`, `.sr-only`, tap targets ≥44px, labelled controls.
  **Built-in toggle** — "Larger text / High contrast" — sets `data-contrast="high"`
  and/or `data-text="large"` on `<html>` (near-black on white, thicker borders,
  bumped font sizes), persisted in `localStorage`.

## 3. Screens (single page, tab navigation)

### Route (default)
- **From** + **To** fields with type-ahead (uses `mapData.searchNodes`); a swap-ends
  button.
- When **From** is empty: quick chips — `Outram MRT` · `Main entrance` · `Scan QR`
  (the QR chip is a disabled "coming soon" placeholder; see §7 deferred).
- **Mode pills:** `Fastest` · `Sheltered` (default) · `Step-free`. Mapping:
  `Fastest → {mode:'fastest'}`, `Sheltered → {mode:'sheltered'}`,
  `Step-free → {mode:'sheltered', accessibleOnly:true}`.
- **Result:** summary banner (text from `summarizeRoute`) + **comfort proportion bar**
  (segments sized by % time per `path_type`) + **turn-by-turn step list** (start row →
  one row per edge: path-type colour marker, "to <node label>", minutes, notes such as
  "24h, wheelchair accessible" → destination row).
- Remembers the last ~5 destinations in `localStorage`.

### Nearby (places of interest)
- Reference-point selector (defaults to the current destination after a route is made;
  otherwise search a node).
- Category chips: `All` · `Food` · `Toilet` · `Charging` · `Rest` · `Convenience` ·
  `ATM` · `Pharmacy` · `Water`.
- List via `places.poisNearNode(graph, pois, refNode)` sorted by walk time; each row:
  category icon, name, minutes, key-attribute badges (price `$ / $$ / $$$` for food,
  `accessible`, `24h`), and a **"Route here"** button (sets To, switches to Route,
  recomputes).

### About
- App version, short description, data-freshness note ("Routes last verified Jun
  2026"), and the accessibility toggle. (Feedback link deferred to its own plan.)

## 4. Architecture / files (new in this plan)

| File | Responsibility |
|---|---|
| `index.html` | Semantic shell: header, tab nav, three `<section>`s, search inputs, a11y toggle. |
| `css/styles.css` | Calm-clinical theme via CSS variables + `data-contrast`/`data-text` variants. |
| `js/app.js` | **Thin DOM layer:** fetch `data/*.json`, `buildGraph` once, wire events, tabs, orchestrate render. Not unit-tested (verified live). |
| `js/render.js` | **PURE, unit-tested presenters** (no DOM) — see §5. |
| `js/platform.js` | Thin device shim: `localStorage` wrapper (recent destinations, prefs). Future: geolocation, QR. |
| `js/pwa.js` | Registers `sw.js`. |
| `sw.js` | Offline-first: precache shell + `data/*.json` on install; cache-first; versioned cache; purge old on activate. |
| `manifest.json` | name/short_name, `display:standalone`, portrait, `theme_color #0f9488`, `background_color #f5f7f8`, SVG icons. |
| `icon-192.svg`, `icon-512.svg` | Simple teal route/pin mark. |

Plan 1 modules (`wayfinding.js`, `mapData.js`, `places.js`) are imported as-is.

## 5. `render.js` — pure presenters (the testable seam)

- `PATH_TYPE_META` — `{ indoor, outdoor, underground, sheltered } → { color, icon, label }`.
- `CATEGORY_META` — POI category → `{ icon, label }`.
- `modeToOpts(modeName)` → `{ mode, accessibleOnly }`.
- `routeToRows(graph, result)` → ordered display rows:
  `{ kind: 'start'|'step'|'end', label, pathType?, minutes?, notes?, accessible? }`.
- `comfortSegments(summary)` → `[{ pathType, pct, color }]` (from `summary.byTypePct`).
- `poiRow(poi, minutes)` → `{ icon, name, minutes, badges: [...] }` (price tier →
  `$`/`$$`/`$$$`; `accessible`; `24h`).

`app.js` calls these and paints DOM; all branching logic lives here so it's tested.

## 6. Data flow & error handling

- **Load:** `app.js` fetches the three JSON files (served locally; cached by `sw.js` for
  offline) → `buildGraph(nodes, edges)` once → `indexById(nodes)` for lookups.
- **Route:** `findRoute(graph, from, to, modeToOpts(mode))` → `summarizeRoute` → render.
- **Nearby:** `places.poisNearNode` / `nearestPoi`.
- **Edge cases:** no path → friendly message ("No route found — the map may be
  incomplete here; try a nearby landmark"); `from === to` → "You're already there";
  empty search → show recents/suggestions; first-load-while-offline (no cache yet) →
  "Connect once to download maps for offline use".

## 7. Testing

- **`render.js`** unit-tested with `node --test`: `routeToRows` shape/ordering,
  `comfortSegments` percentages + colours, `modeToOpts` mapping, `poiRow` badges,
  `PATH_TYPE_META` covers all four types.
- **`app.js` / `sw.js`** verified live in Chrome: load, search/autocomplete, route in
  each mode, Nearby + "Route here", offline (DevTools → Offline), accessibility toggle,
  installability (Lighthouse PWA check).

## 8. Deferred (later plans)

Feedback module (its own plan), real QR "you are here" scanning (placeholder chip
only), Google Places live food data (optional proxy). Live indoor positioning and map
tiles remain non-goals.

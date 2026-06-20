# Hospital Wayfinder — Design

**Date:** 2026-06-20
**Status:** Approved (architecture + scope), pending spec review
**Repo:** https://github.com/lauyeehow1986-hub/hospital-wayfinder

## 1. Context & goal

A patient-facing wayfinding tool for the **Outram hospital cluster** (SGH / NHCS /
NCC and linked buildings). Inspired by gov.sg's *Undercover* (shaded/sheltered
outdoor routes) but focused on the part Undercover misses: **indoor and
underground hospital navigation**, including basement linkways between buildings.
Secondary feature: help users find **places of interest** — affordable food,
toilets, resting areas, charging points, convenience stores, etc.

Single developer, develops on Windows, runs primarily on **Android via Termux +
Chrome PWA** (same workflow as the author's `sg-bus-tracker`). v1 scope = one
cluster (Outram), single campus, no auth.

## 2. Goals / non-goals

**Goals (v1)**
- Route between two named landmarks, preferring **sheltered / indoor / underground**
  paths over exposed outdoor ones (the distinctive value vs Google Maps).
- Report total walk time + a **route-type summary** ("70% indoor air-con,
  1 underground link, wheelchair accessible").
- Work **fully offline** — the core experience must function with zero network
  (hospital basements/interiors have poor signal).
- Find **points of interest** by category near a node/building (food, toilets,
  charging, rest areas, convenience, etc.), with "nearest along route".
- Make the hand-mapped route graph a **version-controlled asset** with an
  ingestion tool usable on the phone while walking, and a validator guarding it.

**Non-goals (v1)**
- Live "blue-dot" indoor positioning (GPS fails underground; needs beacons/WiFi
  fingerprinting — a separate hard problem). v1 routes *between landmarks the user
  picks*, not from live position.
- Multi-cluster / islandwide, auth/accounts, a deployed backend, native app store
  builds (kept *possible* — see §10 — but out of v1 scope).

## 3. Architecture

**Offline-first static PWA, no backend.** Vanilla JS (no framework, no bundler,
no build step), consistent with `sg-bus-tracker` and refined for this problem.

- Route graph + POIs are **bundled JSON**, cached by a service worker.
- Routing (**Dijkstra**, see §6) runs **in the browser** — at v1 scale (tens of
  nodes, growing to a few hundred) this is instant; a server would compute nothing
  faster and would break offline-first.
- Module boundaries from the brief are honored as **folders/modules in one app**,
  splittable into services later only if scope grows (islandwide).
- Optional `proxy.py` (the bus-tracker pattern) is reserved **only** for the
  Google Places stretch goal and is **off by default**, so offline-first holds.

Rationale for no backend: offline is the #1 requirement; scale is tiny; the brief
says "avoid premature infra." This is also the most portable choice for later iOS
support (§10).

## 4. Module boundaries (logical)

| Module | Realization | Depends on |
|---|---|---|
| **wayfinding** | `js/wayfinding.js` — **pure**, no DOM: build graph, Dijkstra with comfort/accessibility cost, route-type summary. Unit-tested. | (none — pure data in, path out) |
| **map-data** | `data/nodes.json`, `data/edges.json` + `js/mapData.js` (load/index/query) + `tools/validate-graph.mjs` (integrity guard). | — |
| **places** (generalizes the brief's *food-places*) | `data/pois.json` + `js/places.js`: query POIs by category near a node/building; "nearest along route". Food is one category. | map-data, wayfinding (for "nearest along route") |
| **ingestion** | `ingestion/` local mapping page (used while walking) → writes `ingestion/staging/*.json`; `tools/merge-staging.mjs` merges after human review. | map-data schema |
| **feedback** | `js/feedback.js` — builds a prefilled **GitHub issue / mailto** URL ("this route is wrong/closed"). No backend in v1. | — |
| **client** | `index.html`, `css/styles.css`, `js/app.js` + UI helpers, `manifest.json`, `sw.js`, icons. | all of the above |

### 4.1 Ingestion & location capture (Termux backend)

The patient app stays fully static, but a browser page can't write files — so
ingestion uses a **tiny, local, pure-Python HTTP server** (`ingestion/server.py`,
stdlib `http.server` only, no deps, no cloud) that runs *only while mapping*:

- `GET /` → serve `ingestion/index.html` (the mapping form).
- `POST /waypoint` → append the record to `ingestion/staging/session-YYYYMMDD.json`.
- `GET /nodes` → return current `data/nodes.json` so **connects-to** is a dropdown
  of real nodes, not free text.
- `GET /gps` *(optional)* → shell out to `termux-location` and return its JSON
  (fallback to browser geolocation; also yields `accuracy`/`provider`).

**Getting a fix.** Default to the browser `navigator.geolocation` in Chrome on the
phone (no extra app); `termux-location -p gps|network|passive` (Termux:API) is the
fallback. Termux:API needs `pkg install termux-api` **and** the Termux:API app from
**F-Droid** (same source as Termux) with Location permission.

**Indoors/underground reality.** GPS will not fix underground (timeout / huge
`accuracy`). Outdoors: store `lat/lng` + `accuracy`. Indoors/underground: leave
`lat/lng` null and rely on graph topology (`connects-to` + `walk_time`); optionally
anchor to the last good outdoor fix. Routing uses edge weights, not coordinates, so
this is fine — coordinates are only for the outdoor map view.

**Cheap signals captured on-site** (stored on the waypoint; can't be re-collected
later): **stopwatch walk-time** ("start" at A → "arrive" at B auto-fills
`walk_time_minutes`); **barometer** delta (`termux-sensor`) to auto-hint level/
`underground` changes; **WiFi fingerprint** (`termux-wifi-scaninfo`, BSSID+RSSI per
waypoint) reserved for a *future* indoor-positioning feature, ignored in v1.

**Session setup:** `pkg install python termux-api`, install Termux:API (F-Droid),
grant Location, `termux-setup-storage`, `termux-wake-lock`, exempt Termux from
battery optimization.

## 5. Data schema

Plain JSON (no DB needed at this scale). `last_verified` is mandatory everywhere —
hospital corridors change (renovations, temporary closures).

### nodes.json — landmarks, junctions, lifts, entrances
```json
{
  "id": "nhcs-l1-lobby",
  "label": "NHCS Level 1 main lobby",
  "aliases": ["heart centre lobby", "nhcs lobby"],
  "building": "NHCS",
  "level": 1,
  "lat": 1.2789,
  "lng": 103.8410,
  "type": "lobby"
}
```
`type`: `lobby | junction | lift | escalator | stairs | entrance | landmark`.
`lat`/`lng` may be `null` for purely indoor/underground nodes (no GPS fix).
`aliases` feed search.

### edges.json — walkable connectors
```json
{
  "id": "e-001",
  "from": "nhcs-l1-lobby",
  "to": "sgh-block7-basement",
  "path_type": "underground",
  "walk_time_minutes": 6,
  "accessible": true,
  "oneway": false,
  "notes": "Via basement linkway, 24h, wheelchair accessible",
  "last_verified": "2026-06-20"
}
```
- `path_type`: `indoor | outdoor | underground | sheltered` — drives the comfort
  cost (§6) and the route-type summary.
- `accessible`: wheelchair/step-free. An explicit boolean beats parsing `notes`.
- **Edges are bidirectional by default** (corridors walk both ways); the graph
  builder adds both directions unless `oneway: true` (e.g., a one-way escalator).

### pois.json — points of interest / amenities
```json
{
  "id": "poi-7eleven-sgh-b1",
  "name": "7-Eleven (SGH Block 3, Basement 1)",
  "category": "convenience",
  "node": "sgh-block3-b1-junction",
  "building": "SGH",
  "level": -1,
  "lat": null,
  "lng": null,
  "attributes": {
    "price_tier": null,
    "accessible": null,
    "open_24h": true,
    "hours": "24h"
  },
  "tags": ["snacks", "drinks", "atm-inside"],
  "source": "manual",
  "last_verified": "2026-06-20"
}
```
- `category`: `food | convenience | toilet | rest_area | charging | atm |
  pharmacy | water | info` (extensible).
- `node`: the nearest graph node — this is how a POI is *located for routing*
  ("route me to the nearest accessible toilet", "charging points near my
  destination").
- `attributes` is category-shaped: `price_tier` (1–3) for `food`; `accessible`
  + `baby_change` for `toilet`; `seating`/`sheltered`/`air_con` for `rest_area`;
  `outlet_type` for `charging`. Unused keys are `null`/omitted.
- `source`: `manual | google_places` (the stretch goal can append `google_places`
  entries without disturbing curated ones).

### Staging (ingestion output)
Same shape as a node + its connecting edge(s), tagged `"status": "staged"`,
written to `ingestion/staging/`. Never auto-merged — reviewed, validated, then
merged by `tools/merge-staging.mjs`.

## 6. Routing

**Algorithm: Dijkstra** (equivalently A\* with a zero heuristic). A geometric A\*
heuristic is *not* reliable here because many indoor/underground nodes have
`null` coordinates, so an admissible heuristic isn't available graph-wide. At this
scale Dijkstra is instant and correct; we can add a coordinate-based heuristic
later if the graph grows large.

**Cost function (the distinctive bit):**
```
edge_cost = walk_time_minutes × comfort_weight[path_type] × pref_modifiers
```
- `comfort_weight` makes exposed `outdoor` more "expensive" than `sheltered` /
  `indoor` / `underground`, so the router prefers comfortable routes even if a
  little longer — the *Undercover* idea, indoors.
- User route preference toggles the weighting:
  - **Fastest** — weights ≈ 1 (pure walk time).
  - **Most sheltered** (default for this app) — penalize `outdoor` heavily.
  - **Step-free / accessible** — exclude edges where `accessible === false`
    (filter, not just weight).
- Weights live in one config object so they're easy to tune.

**Output:** ordered node path, total walk time, and a **route-type summary**
computed from the chosen edges: % of time per `path_type`, count of underground
links, and an overall accessibility flag. Example:
*"12 min · 70% indoor air-con · 1 underground link · wheelchair accessible."*

## 7. Directory structure
```
hospital-wayfinder/
├── index.html               # client shell
├── manifest.json  sw.js  icon-192.svg  icon-512.svg
├── css/styles.css
├── js/
│   ├── app.js               # UI wiring / bootstrap
│   ├── wayfinding.js        # PURE: graph + Dijkstra + summary (no DOM)
│   ├── mapData.js           # load/index/query nodes & edges
│   ├── places.js            # POI queries by category / nearest / along-route
│   ├── feedback.js          # prefilled GitHub-issue / mailto URL builder
│   ├── search.js            # node + POI search / autocomplete
│   ├── platform.js          # thin device abstraction (geo, storage, notify)
│   ├── state.js  dom.js  toast.js   # small UI helpers (bus-tracker style)
│   └── pwa.js               # service-worker registration
├── data/  nodes.json  edges.json  pois.json
├── ingestion/
│   ├── server.py                    # tiny stdlib HTTP server (the Termux backend)
│   ├── index.html  ingest.js        # local mapping form (used while walking)
│   └── staging/.gitkeep             # staged output (gitignored)
├── tools/
│   ├── validate-graph.mjs           # integrity guard (Node)
│   └── merge-staging.mjs            # staged → data after review
├── test/  wayfinding.test.mjs       # Node built-in test runner
├── scripts/  start.sh stop.sh status.sh check.sh   # Termux
├── docs/  SETUP.md  changelog/  superpowers/specs/
├── proxy.py                 # OPTIONAL, off by default (Google Places stretch)
├── .gitignore  LICENSE  README.md
```

## 8. Testing

- **wayfinding** is pure (data in → path out) and is the highest-risk logic, so it
  gets real unit tests via Node's **built-in test runner** (`node --test`, zero
  deps, runs on Termux): shortest-path correctness, comfort-weighting changes the
  chosen route, accessible filter excludes non-accessible edges, bidirectional
  edges, disconnected/no-path case, route-type summary math.
- **validate-graph** is itself testable and is run in `scripts/check.sh`: no edge
  references a missing node, no duplicate ids, every record has `last_verified`,
  POIs reference real nodes, warn on suspicious values.
- TDD for the routing core: write the failing test first, then implement.

## 9. Deployment

- **Primary:** static files served locally on Termux (`scripts/start.sh`) and used
  as a Chrome PWA — identical to `sg-bus-tracker`.
- **Shareable:** push to **GitHub Pages** (static, free) so others can install it.
- Service worker pre-caches the app shell + `data/*.json` for offline use; cache
  version bumped per release (changelog-driven, like the bus tracker).

## 10. iOS expandability (kept open at no cost)

- **Now:** the same PWA installs via Safari "Add to Home Screen" and runs offline —
  no extra code.
- **Later (App Store):** wrap the *same* HTML/CSS/JS in **Capacitor** — no rewrite.
  Native build needs macOS/Xcode + Apple Developer account (cloud-Mac CI from
  Windows), so it's deferred, not designed-out.
- **Guardrails baked in now:** all device APIs (geolocation, storage, notify) sit
  behind `js/platform.js`; routing + data layers are pure/portable; no web-only
  hacks. iOS PWA limits (no Vibration API, push only ≥16.4) don't affect core
  wayfinding.

## 11. Risks

- **Indoor positioning** is unsolved in v1 by design (route between picked
  landmarks). Live position would need beacons/WiFi fingerprinting later.
- **Data drift** — corridors close/renovate. Mitigations: mandatory
  `last_verified`, the feedback link, and the validator guarding merges.
- **Hand-mapped graph is the only source of truth** — hence commit early/often;
  git history is the safety net (brief §GitHub).

## 12. Build order / phasing

First implementation plan targets a tight vertical slice (steps 1–4); the rest
follow once the spine works.

1. Scaffold repo (structure, README, LICENSE, manifest/sw, Termux scripts).
2. Define + seed schema (10–15 nodes covering NHCS + one underground linkway;
   a handful of POIs across categories).
3. **wayfinding** module + tests (Dijkstra, comfort weights, summary) — correct
   before any UI.
4. **ingestion** tool (phone-usable) + `validate-graph` + `merge-staging`.
5. **places** module (curated POIs; Google Places via optional proxy = stretch).
6. Minimal **client** PWA (search → route → summary; browse POIs).
7. **feedback** link once there are real users.

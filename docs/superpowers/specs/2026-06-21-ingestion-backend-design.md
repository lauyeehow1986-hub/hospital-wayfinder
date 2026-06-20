# Hospital Wayfinder — Ingestion Backend + Coordinate Foundation (Plan 3)

**Date:** 2026-06-21
**Status:** Approved (design), pending spec review
**Builds on:** Plans 1, 2, 4. Realizes the brief's **ingestion** module (v1 design
§4.1) and upgrades the coordinate model for detailed, long-term mapping.

## 1. Goal

A phone-usable mapping tool (run on Termux) to grow the route graph **in detail over
time**: record a waypoint (a node + its connecting edges) while walking, tap its spot
on a shared floor grid, capture walk-time with a stopwatch, optionally grab GPS
outdoors → append to a staging file → review and merge into the live graph at the
desk. Plus the **coordinate-system upgrade** that keeps a dense, multi-floor map
coherent (floors align).

**Strategy (recorded):** map the navigable **graph** — nodes = destinations +
decision points + level-changes; edges = connectors with walk-time + path-type — not
floor *geometry*. Room-shape geometry is a possible future layer, not this plan.
Mapping is incremental; the app is useful with partial data.

## 2. Coordinate foundation (prerequisite — do first)

Switch from per-level schematic (0–100, each level independently fit) to **one shared
coordinate grid for the whole cluster**, used by every level, so the same `(x, y)` is
the same screen position on every floor → **floors align** (mall-style).

- `x`/`y` are free numbers in a shared space, placed **roughly to scale by eye**
  (walk-time / step count as proportion hints). Vertical connectors share `x`/`y`
  across the levels they join (a lift's L1 and B1 nodes get the same `x`/`y`).
- The floor map computes **one** `fitTransform` from *all* coord-bearing nodes (all
  levels) and applies it to every level — replacing the per-level fit in `app.js`.
- `mapView.unproject(point, t)` — inverse of `project` (screen tap → grid coords),
  used by the mapping form. Unit-tested (round-trips with `project`).
- Re-space the 13 seed nodes onto the shared grid (consistent across levels; lift
  pairs aligned).
- `data/meta.json` (new) holds an optional `scale` (grid-units per metre), `null` for
  now — banked so a building can be tightened to true scale later without a redo.
  Unused by v1 rendering.

## 3. Ingestion server (`ingestion/server.py`)

Thin **pure-Python stdlib `http.server`**, rooted at the repo (serves the form +
`js/` + `data/` + `css/`). Beyond static files:

- `POST /waypoint` → append the posted JSON to
  `ingestion/staging/session-YYYYMMDD.json` (create if absent); return
  `{ "ok": true, "count": N }`.
- `GET /gps` *(optional)* → run `termux-location -p gps`, return its JSON; on failure
  return `{ "error": ... }` (the form falls back to browser geolocation).

No validation here (that's the merge tool) — the server stays tiny. Run:
`python ingestion/server.py [port]` (default **8788**, so it never clashes with the
app's 8080).

## 4. Mapping form (`ingestion/index.html` + `ingestion/ingest.js`)

Phone-first. **Reuses** `js/mapData.js` (`searchNodes`) and `js/mapView.js`
(`nodesOnLevel`, `buildingZones`, `fitTransform`/`project`/`unproject`). A submission
= **one new node + one or more edges** to existing nodes.

- **Node:** label, building (datalist of existing + free text), level (number), type
  (select), aliases (optional).
- **Position:** a **tap-to-place** mini floor map showing the chosen level's existing
  nodes (shared grid) for reference; a tap drops the new node (`unproject` → `x`/`y`).
  **Optional** — you can save without placing. A "Grab GPS" button fills `lat`/`lng`
  for outdoor nodes (browser geolocation, or server `/gps`).
- **Edges (repeatable rows):** connects-to (a `searchNodes` picker over existing
  nodes), path-type (select), walk-time via **stopwatch** (Start at the connecting
  node → Arrive → minutes, rounded, ≥ 1), accessible (checkbox), notes.
- **Save** → `POST /waypoint` → confirmation, clears for the next waypoint, shows a
  running count for the session.

## 5. Merge tool (`tools/merge-staging.js`, Node)

Reads `ingestion/staging/*.json`, converts staged records to nodes/edges, runs the
existing `validateGraph` on the merged result.

- **Pure helpers (unit-tested):**
  - `slugifyId(label, existingIds)` → kebab-case id from the label, de-duplicated
    (`-2`, `-3`, …).
  - `stagedToGraph(staged, nodes, edges)` → `{ addedNodes, addedEdges }`: assigns node
    ids; edge ids continue from the current max (`e-0NN`); each edge's `from` = the new
    node id, `to` = the chosen existing id; carries `last_verified`.
- **CLI:** default **dry-run** prints a summary (added nodes/edges + any validation
  errors/warnings). `--apply` writes merged `data/nodes.json` + `data/edges.json`
  (pretty JSON) and moves processed files to `ingestion/staging/merged/`. **Refuses
  `--apply` when validation reports errors.**

## 6. Data flow

`python ingestion/server.py` on Termux → open the form in Chrome → map while walking
(tap-to-place + stopwatch) → records append to staging (gitignored) → at the desk:
`node tools/merge-staging.js` (review) → `--apply` → `npm run validate` → commit.
Incremental and repeatable, session after session.

## 7. Testing

- **Node `--test`:** `mapView.unproject` (round-trips `project`), `slugifyId`,
  `stagedToGraph`, and that a merged sample passes `validateGraph`.
- **Manual / live:** run `server.py`, submit a waypoint (via the form and a `curl`
  POST), confirm the staging file grows; the form's tap-to-place + stopwatch verified
  in the preview browser; floors-align verified on the updated floor map.

## 8. Files

| File | Change |
|---|---|
| `js/mapView.js` | add `unproject` |
| `js/app.js` | floor map uses one shared transform (all nodes) so floors align |
| `data/nodes.json` | re-space coords onto the shared grid (lift pairs aligned) |
| `data/meta.json` | new — optional `scale` (null for now) |
| `ingestion/server.py` | new — thin Python server |
| `ingestion/index.html`, `ingestion/ingest.js` | new — mapping form |
| `tools/merge-staging.js` | new — staging → data, dry-run/`--apply` |
| `test/mapView.test.js` | `unproject` test |
| `test/merge-staging.test.js` | new |
| `sw.js` | cache bump; add `data/meta.json` |
| `docs/ingestion.md` | usage |
| `docs/changelog/v0.5.md` | changelog |

## 9. Deferred

Room-shape geometry layer (trace from reference plans at the desk), true-scale
georeferencing, barometer / WiFi-fingerprint capture, Google Places, feedback module.

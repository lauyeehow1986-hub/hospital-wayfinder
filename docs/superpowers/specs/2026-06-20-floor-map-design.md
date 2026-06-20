# Hospital Wayfinder — Mall-style Floor Map Design (Plan 4)

**Date:** 2026-06-20
**Status:** Approved (design), pending spec review
**Builds on:** Plan 1 (routing core), Plan 2 (client PWA). Related: Plan 3 (ingestion)
will later capture node coordinates.

## 1. Goal

Add a **mall/airport-style schematic floor map** to the route result: the journey
drawn over auto-generated building zones and corridors, color-coded by path type,
with a **level switcher** (B1 / L1 …) and lift/stair handoff markers. Fully offline,
no map tiles, no GPS — the look comes from a lightweight **coordinate layer** on the
existing hand-mapped graph, not from sourced floor plans.

Non-goals (unchanged): live indoor "blue-dot" positioning (needs beacons), traced
real floor-plan artwork (deferred; schematic zones instead), pan/zoom (v1 fits the
level to the view).

## 2. Coordinate layer (data)

Each node gains two fields:

```json
{ "id": "sgh-block7-b1", "...": "...", "level": -1, "x": 60, "y": 52 }
```

- `x`, `y`: **schematic** layout units (arbitrary scale, ~0–100), not survey/GPS
  coordinates. A single 2D space shared across levels; `level` separates floors, so a
  lift lobby on L1 sits directly above its B1 counterpart when their x/y match.
- Authored by hand for the 12 seed nodes (SGH centre-left, NHCS right, NCC near NHCS,
  MRT/bus at the edges; B1 nodes aligned under their L1 lifts).
- `validate-graph` gains a **warning** (not error) when a node lacks `x`/`y`, so older
  data still validates while flagging map-incomplete nodes.
- The map renders only nodes that have `x`/`y`; missing ones are skipped gracefully.
- Plan 3's ingestion tool will later capture `x`/`y` by tapping a floor sketch.

## 3. Pure module `js/mapView.js` (the testable seam)

No DOM. Turns graph + route into drawable geometry.

- `levelsPresent(nodes)` → unique `level`s, **descending** (upper floors first).
- `levelLabel(level)` → `"L1"`, `"B1"`, `"G"` (0).
- `nodesOnLevel(nodes, level)` → nodes with that `level` and defined `x`/`y`.
- `edgesOnLevel(edges, level, nodeById)` → edges whose **both** endpoints are on
  `level` (intra-level corridors).
- `buildingZones(nodesOnLevel)` → one bounding box per `building`:
  `[{ building, minX, minY, maxX, maxY }]`.
- `fitTransform(points, width, height, pad)` → `{ scale, offsetX, offsetY }` mapping
  data coords into the SVG viewBox (aspect-preserved, centered; safe fallback when a
  level has a single point / zero range).
- `project(point, transform)` → `{ x, y }` screen coords.
- `routeByLevel(graph, result)` → `{ byLevel, changes }`:
  - `byLevel[level] = { segments: [{ fromId, toId, x1, y1, x2, y2, pathType }], nodes: [{ id, x, y, role: 'start'|'end'|'via' }] }` — route geometry on that level (raw data coords; the renderer projects them).
  - `changes = [{ atNodeId, nextNodeId, fromLevel, toLevel, direction: 'up'|'down' }]`
    — where a route edge crosses floors (e.g. a lift), used for handoff markers.

## 4. Rendering (`app.js`, SVG)

On the Route result, below the banner + comfort bar, a **Map / Steps toggle**
(default **Map**). Both reuse the already-computed route — no re-routing.

**Map view** (`<svg role="img" aria-label="<route summary>">`), for the active level:
- faint **building zone** rects + labels (from `buildingZones`),
- **corridor lines** (`edgesOnLevel`, thin grey),
- **route segments** drawn thick, colored per `pathType` (indoor/sheltered/
  underground/outdoor — same palette as the comfort bar),
- a teal **"You are here"** start pin and a **destination** flag where they fall on
  the active level,
- **handoff markers** from `changes` touching the active level (e.g. "↓ lift to B1").

**Level switcher:** a row of buttons for `levelsPresent` (route levels emphasized),
defaulting to the **start node's level**; tapping redraws. Legs on other floors are
represented by the handoff markers + a hint ("destination continues on B1").

Scaling is **fit-to-view** via `fitTransform` (no pan/zoom in v1). The full geometry
is in flow (no `position: fixed`).

**Accessibility:** the **Steps** list remains the primary, screen-reader-friendly
view; the SVG is supplementary with a text `aria-label` summary. Toggle buttons use
`aria-pressed`; level buttons are labelled.

## 5. Data flow & error handling

- Map is built from the in-memory `graph` + the current `findRoute` result; nothing
  is fetched.
- Route entirely on one level → no `changes`; switcher still lists other levels.
- Start and destination on different levels → default to start's level + a hint to
  tap the destination's level.
- A node on the route without `x`/`y` → its segment is omitted from the map (the
  step list still shows it); this is the validator's warning case.

## 6. Testing

- **`mapView.js`** unit-tested with `node --test`: `levelsPresent` ordering,
  `levelLabel`, `nodesOnLevel`/`edgesOnLevel` filtering, `buildingZones` boxes,
  `fitTransform` scaling math (min→pad, aspect preserved, single-point fallback),
  `routeByLevel` segments + cross-level `changes` with up/down direction.
- **`app.js` SVG** verified live in the preview browser: map renders, route line
  colored, level switcher flips floors, handoff markers appear, Map/Steps toggle
  works, no console errors.

## 7. Files

| File | Change |
|---|---|
| `data/nodes.json` | add `x`/`y` to all 12 seed nodes |
| `js/mapView.js` | new pure geometry module |
| `tools/validate-graph.js` | warn on missing `x`/`y` |
| `js/app.js` | Map/Steps toggle, SVG floor-map render, level switcher |
| `css/styles.css` | map, toggle, level-switcher, handoff-marker styles |
| `test/mapView.test.js` | unit tests |
| `docs/changelog/v0.3.md` | changelog |

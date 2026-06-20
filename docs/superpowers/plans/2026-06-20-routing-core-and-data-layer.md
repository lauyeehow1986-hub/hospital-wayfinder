# Routing Core & Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the offline routing engine, data layer, POI queries, and graph validator for the hospital wayfinder — fully unit-tested, with no UI yet.

**Architecture:** Pure vanilla-JS ES modules (no framework, no build step) shared between the browser (later) and Node (tests now). Routing is Dijkstra over a comfort-weighted graph built from version-controlled JSON. POIs are node-anchored so they reuse the router. A standalone validator guards the hand-mapped graph.

**Tech Stack:** Vanilla JS (ES modules), Node 18+ built-in test runner (`node --test`, zero deps), JSON data files.

**Spec:** `docs/superpowers/specs/2026-06-20-hospital-wayfinder-design.md`

---

## File structure (created by this plan)

| File | Responsibility |
|---|---|
| `package.json` | `"type":"module"`, `test`/`validate` scripts. No deps. |
| `js/wayfinding.js` | PURE: `buildGraph`, `findRoute` (Dijkstra + comfort weights + accessible filter), `summarizeRoute`. |
| `js/mapData.js` | PURE: `indexById`, `searchNodes` (label/alias search). |
| `js/places.js` | PURE: `poisByCategory`, `nearestPoi`, `poisNearNode` (reuse router). |
| `tools/validate-graph.js` | `validateGraph()` + CLI guard over `data/*.json`. |
| `data/nodes.json` `data/edges.json` `data/pois.json` | Seed graph + POIs (Outram/NHCS slice). |
| `test/wayfinding.test.js` `test/mapData.test.js` `test/places.test.js` `test/validate-graph.test.js` | Unit tests. |
| `README.md` `LICENSE` `.gitkeep`s | Scaffold. |

---

## Task 1: Scaffold repo

**Files:**
- Create: `package.json`, `README.md`, `LICENSE`, `ingestion/staging/.gitkeep`, `docs/changelog/.gitkeep`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "hospital-wayfinder",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Offline-first wayfinding + places-of-interest PWA for the Outram hospital cluster.",
  "scripts": {
    "test": "node --test",
    "validate": "node tools/validate-graph.js"
  }
}
```

- [ ] **Step 2: Create `README.md`**

```markdown
# Hospital Wayfinder

Offline-first wayfinding for the Outram hospital cluster (SGH / NHCS / NCC and
linked buildings) — indoor, underground, and sheltered routes that Google Maps
and gov.sg Undercover don't capture — plus nearby places of interest (food,
toilets, charging, rest areas, convenience stores).

![Status: v0.1 — routing core](https://img.shields.io/badge/status-v0.1_routing_core-orange)
![Platform: Android (Termux + Chrome PWA)](https://img.shields.io/badge/platform-Android_(Termux_%2B_Chrome_PWA)-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-lightgrey)

## Status

Vertical slice in progress. The routing engine, data layer, POI queries, and
graph validator are built and unit-tested. Client PWA and the Termux ingestion
backend follow in later plans.

## Develop

    npm test                 # run the unit tests (Node 18+, no deps)
    npm run validate         # check data/ graph integrity

## Design

See `docs/superpowers/specs/2026-06-20-hospital-wayfinder-design.md`.
```

- [ ] **Step 3: Create `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 lauyeehow1986-hub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Create directory placeholders**

Create empty files `ingestion/staging/.gitkeep` and `docs/changelog/.gitkeep` (content: a single newline).

- [ ] **Step 5: Commit**

```bash
git add package.json README.md LICENSE ingestion/staging/.gitkeep docs/changelog/.gitkeep
git commit -m "chore: scaffold repo (package.json, README, LICENSE)"
```

---

## Task 2: Seed the route graph + POIs

**Files:**
- Create: `data/nodes.json`, `data/edges.json`, `data/pois.json`

- [ ] **Step 1: Create `data/nodes.json`**

```json
[
  { "id": "outram-mrt-exit", "label": "Outram Park MRT Exit 4", "aliases": ["mrt", "outram mrt"], "building": "MRT", "level": 1, "lat": 1.2803, "lng": 103.8397, "type": "entrance" },
  { "id": "sgh-block5-l1", "label": "SGH Block 5 Level 1", "aliases": ["block 5"], "building": "SGH", "level": 1, "lat": 1.2796, "lng": 103.8352, "type": "junction" },
  { "id": "sgh-block7-l1-lobby", "label": "SGH Block 7 Level 1 lobby", "aliases": ["block 7 lobby"], "building": "SGH", "level": 1, "lat": 1.2790, "lng": 103.8358, "type": "lobby" },
  { "id": "sgh-block7-lift", "label": "SGH Block 7 lifts", "aliases": ["block 7 lift"], "building": "SGH", "level": 1, "lat": null, "lng": null, "type": "lift" },
  { "id": "sgh-block7-b1", "label": "SGH Block 7 Basement 1", "aliases": ["block 7 basement"], "building": "SGH", "level": -1, "lat": null, "lng": null, "type": "junction" },
  { "id": "sgh-block3-b1", "label": "SGH Block 3 Basement 1", "aliases": ["block 3 basement", "kopitiam basement"], "building": "SGH", "level": -1, "lat": null, "lng": null, "type": "junction" },
  { "id": "linkway-nhcs-sgh-b1", "label": "NHCS–SGH basement linkway", "aliases": ["underground linkway", "basement linkway"], "building": "LINK", "level": -1, "lat": null, "lng": null, "type": "junction" },
  { "id": "nhcs-b1-lift", "label": "NHCS Basement 1 lifts", "aliases": ["nhcs basement lift"], "building": "NHCS", "level": -1, "lat": null, "lng": null, "type": "lift" },
  { "id": "nhcs-l1-lobby", "label": "NHCS Level 1 main lobby", "aliases": ["heart centre lobby", "nhcs lobby"], "building": "NHCS", "level": 1, "lat": 1.2789, "lng": 103.8410, "type": "lobby" },
  { "id": "nhcs-l1-entrance", "label": "NHCS main entrance (drop-off)", "aliases": ["nhcs entrance", "heart centre entrance"], "building": "NHCS", "level": 1, "lat": 1.2791, "lng": 103.8412, "type": "entrance" },
  { "id": "ncc-l1-lobby", "label": "NCC Level 1 lobby", "aliases": ["cancer centre lobby", "ncc lobby"], "building": "NCC", "level": 1, "lat": 1.2784, "lng": 103.8405, "type": "lobby" },
  { "id": "bus-stop-outram", "label": "Bus stop opp SGH (Outram Rd)", "aliases": ["bus stop"], "building": "EXT", "level": 1, "lat": 1.2808, "lng": 103.8366, "type": "entrance" }
]
```

- [ ] **Step 2: Create `data/edges.json`**

```json
[
  { "id": "e-001", "from": "outram-mrt-exit", "to": "sgh-block5-l1", "path_type": "sheltered", "walk_time_minutes": 5, "accessible": true, "oneway": false, "notes": "Sheltered walkway from MRT", "last_verified": "2026-06-20" },
  { "id": "e-002", "from": "sgh-block5-l1", "to": "sgh-block7-l1-lobby", "path_type": "indoor", "walk_time_minutes": 3, "accessible": true, "oneway": false, "notes": "Air-con corridor", "last_verified": "2026-06-20" },
  { "id": "e-003", "from": "sgh-block7-l1-lobby", "to": "sgh-block7-lift", "path_type": "indoor", "walk_time_minutes": 1, "accessible": true, "oneway": false, "notes": "", "last_verified": "2026-06-20" },
  { "id": "e-004", "from": "sgh-block7-lift", "to": "sgh-block7-b1", "path_type": "indoor", "walk_time_minutes": 1, "accessible": true, "oneway": false, "notes": "Lift to basement", "last_verified": "2026-06-20" },
  { "id": "e-005", "from": "sgh-block7-b1", "to": "sgh-block3-b1", "path_type": "underground", "walk_time_minutes": 4, "accessible": true, "oneway": false, "notes": "Basement passage past kopitiam", "last_verified": "2026-06-20" },
  { "id": "e-006", "from": "sgh-block7-b1", "to": "linkway-nhcs-sgh-b1", "path_type": "underground", "walk_time_minutes": 6, "accessible": true, "oneway": false, "notes": "Basement linkway, 24h, wheelchair accessible", "last_verified": "2026-06-20" },
  { "id": "e-007", "from": "linkway-nhcs-sgh-b1", "to": "nhcs-b1-lift", "path_type": "underground", "walk_time_minutes": 2, "accessible": true, "oneway": false, "notes": "", "last_verified": "2026-06-20" },
  { "id": "e-008", "from": "nhcs-b1-lift", "to": "nhcs-l1-lobby", "path_type": "indoor", "walk_time_minutes": 1, "accessible": true, "oneway": false, "notes": "Lift to level 1", "last_verified": "2026-06-20" },
  { "id": "e-009", "from": "nhcs-l1-lobby", "to": "nhcs-l1-entrance", "path_type": "indoor", "walk_time_minutes": 1, "accessible": true, "oneway": false, "notes": "", "last_verified": "2026-06-20" },
  { "id": "e-010", "from": "nhcs-l1-entrance", "to": "ncc-l1-lobby", "path_type": "sheltered", "walk_time_minutes": 3, "accessible": true, "oneway": false, "notes": "Covered link to cancer centre", "last_verified": "2026-06-20" },
  { "id": "e-011", "from": "nhcs-l1-entrance", "to": "bus-stop-outram", "path_type": "outdoor", "walk_time_minutes": 4, "accessible": true, "oneway": false, "notes": "Exposed pavement, no shelter", "last_verified": "2026-06-20" },
  { "id": "e-012", "from": "sgh-block5-l1", "to": "bus-stop-outram", "path_type": "outdoor", "walk_time_minutes": 3, "accessible": true, "oneway": false, "notes": "Exposed crossing", "last_verified": "2026-06-20" }
]
```

- [ ] **Step 3: Create `data/pois.json`**

```json
[
  { "id": "poi-kopitiam-sgh-b3", "name": "Kopitiam food court (SGH Block 3, B1)", "category": "food", "node": "sgh-block3-b1", "building": "SGH", "level": -1, "lat": null, "lng": null, "attributes": { "price_tier": 1, "open_24h": false, "hours": "0700-2100" }, "tags": ["local", "halal-options"], "source": "manual", "last_verified": "2026-06-20" },
  { "id": "poi-cafe-nhcs-l1", "name": "Cafe (NHCS Level 1 lobby)", "category": "food", "node": "nhcs-l1-lobby", "building": "NHCS", "level": 1, "lat": null, "lng": null, "attributes": { "price_tier": 2, "open_24h": false, "hours": "0730-1900" }, "tags": ["coffee", "sandwiches"], "source": "manual", "last_verified": "2026-06-20" },
  { "id": "poi-7eleven-sgh-b7", "name": "7-Eleven (SGH Block 7, B1)", "category": "convenience", "node": "sgh-block7-b1", "building": "SGH", "level": -1, "lat": null, "lng": null, "attributes": { "open_24h": true, "hours": "24h" }, "tags": ["snacks", "drinks"], "source": "manual", "last_verified": "2026-06-20" },
  { "id": "poi-toilet-sgh-b7-l1", "name": "Accessible toilet (SGH Block 7, L1)", "category": "toilet", "node": "sgh-block7-l1-lobby", "building": "SGH", "level": 1, "lat": null, "lng": null, "attributes": { "accessible": true, "baby_change": true }, "tags": [], "source": "manual", "last_verified": "2026-06-20" },
  { "id": "poi-charging-nhcs-l1", "name": "Charging point (NHCS Level 1 lobby)", "category": "charging", "node": "nhcs-l1-lobby", "building": "NHCS", "level": 1, "lat": null, "lng": null, "attributes": { "outlet_type": "usb-and-socket" }, "tags": [], "source": "manual", "last_verified": "2026-06-20" },
  { "id": "poi-rest-sgh-block5", "name": "Seating area (SGH Block 5, L1)", "category": "rest_area", "node": "sgh-block5-l1", "building": "SGH", "level": 1, "lat": null, "lng": null, "attributes": { "seating": true, "air_con": true, "sheltered": true }, "tags": [], "source": "manual", "last_verified": "2026-06-20" },
  { "id": "poi-pharmacy-sgh-block5", "name": "Outpatient pharmacy (SGH Block 5, L1)", "category": "pharmacy", "node": "sgh-block5-l1", "building": "SGH", "level": 1, "lat": null, "lng": null, "attributes": { "open_24h": false, "hours": "0830-1730" }, "tags": [], "source": "manual", "last_verified": "2026-06-20" }
]
```

- [ ] **Step 4: Commit**

```bash
git add data/nodes.json data/edges.json data/pois.json
git commit -m "feat: seed Outram/NHCS route graph and POIs"
```

---

## Task 3: wayfinding — `buildGraph`

**Files:**
- Create: `js/wayfinding.js`
- Test: `test/wayfinding.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/wayfinding.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../js/wayfinding.js';

const nodes = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
];
const edges = [
  { id: 'e1', from: 'a', to: 'b', path_type: 'indoor', walk_time_minutes: 2, accessible: true },
  { id: 'e2', from: 'b', to: 'c', path_type: 'outdoor', walk_time_minutes: 3, accessible: true, oneway: true },
];

test('buildGraph indexes nodes and adds bidirectional edges by default', () => {
  const g = buildGraph(nodes, edges);
  assert.equal(g.nodes.get('a').label, 'A');
  assert.equal(g.adj.get('a').length, 1);          // a->b
  assert.equal(g.adj.get('b').length, 2);          // b->a (reverse of e1) and b->c
});

test('buildGraph respects oneway edges', () => {
  const g = buildGraph(nodes, edges);
  assert.equal(g.adj.get('c').length, 0);          // e2 is oneway b->c, no reverse
});

test('buildGraph throws on edge referencing unknown node', () => {
  assert.throws(() => buildGraph(nodes, [{ id: 'x', from: 'a', to: 'zzz', path_type: 'indoor', walk_time_minutes: 1 }]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/wayfinding.test.js`
Expected: FAIL — cannot find module `../js/wayfinding.js` / `buildGraph` not exported.

- [ ] **Step 3: Write minimal implementation**

Create `js/wayfinding.js`:

```js
// Comfort multipliers per routing mode, keyed by edge.path_type.
// "fastest" = pure walk time; "sheltered" penalises exposed outdoor walking.
export const COMFORT_WEIGHTS = {
  fastest: { indoor: 1, sheltered: 1, underground: 1, outdoor: 1 },
  sheltered: { indoor: 1, sheltered: 1.1, underground: 1.2, outdoor: 3 },
};

// Build an adjacency map from node + edge records.
// Edges are bidirectional unless edge.oneway === true.
export function buildGraph(nodes, edges) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    if (!adj.has(edge.from) || !adj.has(edge.to)) {
      throw new Error(`Edge ${edge.id} references unknown node (${edge.from} -> ${edge.to})`);
    }
    adj.get(edge.from).push({ to: edge.to, edge });
    if (!edge.oneway) {
      adj.get(edge.to).push({ to: edge.from, edge });
    }
  }
  return { nodes: nodeMap, adj };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/wayfinding.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add js/wayfinding.js test/wayfinding.test.js
git commit -m "feat(wayfinding): buildGraph with bidirectional + oneway edges"
```

---

## Task 4: wayfinding — `findRoute` (Dijkstra)

**Files:**
- Modify: `js/wayfinding.js`
- Test: `test/wayfinding.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `test/wayfinding.test.js`:

```js
import { findRoute } from '../js/wayfinding.js';

const grid = buildGraph(
  [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }],
  [
    { id: 'e1', from: 'a', to: 'b', path_type: 'indoor', walk_time_minutes: 2, accessible: true },
    { id: 'e2', from: 'b', to: 'd', path_type: 'indoor', walk_time_minutes: 2, accessible: true },
    { id: 'e3', from: 'a', to: 'c', path_type: 'indoor', walk_time_minutes: 1, accessible: true },
    { id: 'e4', from: 'c', to: 'd', path_type: 'indoor', walk_time_minutes: 1, accessible: true },
  ],
);

test('findRoute returns the shortest path by walk time (fastest mode)', () => {
  const r = findRoute(grid, 'a', 'd', { mode: 'fastest' });
  assert.deepEqual(r.path, ['a', 'c', 'd']);
  assert.equal(r.totalMinutes, 2);
  assert.equal(r.edges.length, 2);
});

test('findRoute returns null when no path exists', () => {
  const g = buildGraph([{ id: 'a', label: 'A' }, { id: 'z', label: 'Z' }], []);
  assert.equal(findRoute(g, 'a', 'z'), null);
});

test('findRoute returns trivial route when from === to', () => {
  const r = findRoute(grid, 'a', 'a', { mode: 'fastest' });
  assert.deepEqual(r.path, ['a']);
  assert.equal(r.totalMinutes, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/wayfinding.test.js`
Expected: FAIL — `findRoute` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `js/wayfinding.js`:

```js
// Dijkstra shortest path by comfort-weighted cost.
// opts: { mode = 'sheltered', accessibleOnly = false }
// Returns { path: [nodeId...], edges: [edge...], totalMinutes } or null.
export function findRoute(graph, fromId, toId, opts = {}) {
  const mode = opts.mode || 'sheltered';
  const accessibleOnly = opts.accessibleOnly || false;
  const weights = COMFORT_WEIGHTS[mode] || COMFORT_WEIGHTS.sheltered;
  if (!graph.nodes.has(fromId) || !graph.nodes.has(toId)) return null;
  if (fromId === toId) return { path: [fromId], edges: [], totalMinutes: 0 };

  const dist = new Map([[fromId, 0]]);
  const prev = new Map();
  const visited = new Set();
  const frontier = new Set([fromId]);

  while (frontier.size) {
    let u = null;
    let best = Infinity;
    for (const id of frontier) {
      const d = dist.get(id);
      if (d < best) { best = d; u = id; }
    }
    frontier.delete(u);
    if (u === toId) break;
    if (visited.has(u)) continue;
    visited.add(u);

    for (const { to, edge } of graph.adj.get(u)) {
      if (visited.has(to)) continue;
      if (accessibleOnly && edge.accessible === false) continue;
      const w = weights[edge.path_type] ?? 1;
      const cost = dist.get(u) + edge.walk_time_minutes * w;
      if (cost < (dist.get(to) ?? Infinity)) {
        dist.set(to, cost);
        prev.set(to, { from: u, edge });
        frontier.add(to);
      }
    }
  }

  if (!prev.has(toId)) return null;

  const path = [toId];
  const edgesUsed = [];
  let totalMinutes = 0;
  let cur = toId;
  while (cur !== fromId) {
    const step = prev.get(cur);
    edgesUsed.unshift(step.edge);
    totalMinutes += step.edge.walk_time_minutes;
    path.unshift(step.from);
    cur = step.from;
  }
  return { path, edges: edgesUsed, totalMinutes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/wayfinding.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add js/wayfinding.js test/wayfinding.test.js
git commit -m "feat(wayfinding): findRoute via Dijkstra"
```

---

## Task 5: wayfinding — comfort weighting + accessible filter

**Files:**
- Modify: `js/wayfinding.js` (no code change expected — already supports it; this task proves behavior)
- Test: `test/wayfinding.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `test/wayfinding.test.js`:

```js
// a->b->d is all indoor (4 min). a->x->d crosses outdoor (3 min raw).
const comfort = buildGraph(
  [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'd', label: 'D' }, { id: 'x', label: 'X' }],
  [
    { id: 'c1', from: 'a', to: 'b', path_type: 'indoor', walk_time_minutes: 2, accessible: true },
    { id: 'c2', from: 'b', to: 'd', path_type: 'indoor', walk_time_minutes: 2, accessible: true },
    { id: 'c3', from: 'a', to: 'x', path_type: 'outdoor', walk_time_minutes: 1, accessible: false },
    { id: 'c4', from: 'x', to: 'd', path_type: 'outdoor', walk_time_minutes: 2, accessible: true },
  ],
);

test('fastest mode takes the shorter outdoor route', () => {
  const r = findRoute(comfort, 'a', 'd', { mode: 'fastest' });
  assert.deepEqual(r.path, ['a', 'x', 'd']);   // 3 min raw beats 4 min
});

test('sheltered mode avoids exposed outdoor even though it is longer', () => {
  const r = findRoute(comfort, 'a', 'd', { mode: 'sheltered' });
  assert.deepEqual(r.path, ['a', 'b', 'd']);   // outdoor penalised x3
});

test('accessibleOnly excludes non-accessible edges', () => {
  // force the only short path through a non-accessible edge, then require accessible
  const r = findRoute(comfort, 'a', 'd', { mode: 'fastest', accessibleOnly: true });
  assert.deepEqual(r.path, ['a', 'b', 'd']);   // c3 (a->x) is accessible:false, excluded
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `node --test test/wayfinding.test.js`
Expected: PASS (the implementation from Task 4 already handles weights + filter). If any assertion fails, fix `findRoute` so weights multiply `walk_time_minutes` and `accessibleOnly` skips `edge.accessible === false`.

- [ ] **Step 3: (only if a test failed) adjust implementation**

No change expected. If needed, reconcile with the code shown in Task 4 Step 3.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/wayfinding.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/wayfinding.test.js js/wayfinding.js
git commit -m "test(wayfinding): comfort weighting and accessible filter"
```

---

## Task 6: wayfinding — `summarizeRoute`

**Files:**
- Modify: `js/wayfinding.js`
- Test: `test/wayfinding.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `test/wayfinding.test.js`:

```js
import { summarizeRoute } from '../js/wayfinding.js';

test('summarizeRoute reports totals, dominant type, underground links, accessibility', () => {
  const result = {
    totalMinutes: 10,
    edges: [
      { path_type: 'indoor', walk_time_minutes: 7, accessible: true },
      { path_type: 'underground', walk_time_minutes: 3, accessible: true },
    ],
  };
  const s = summarizeRoute(result);
  assert.equal(s.totalMinutes, 10);
  assert.equal(s.byTypePct.indoor, 70);
  assert.equal(s.byTypePct.underground, 30);
  assert.equal(s.undergroundLinks, 1);
  assert.equal(s.accessible, true);
  assert.match(s.text, /10 min/);
  assert.match(s.text, /70% indoor/);
});

test('summarizeRoute flags a non-accessible route', () => {
  const s = summarizeRoute({ totalMinutes: 4, edges: [{ path_type: 'outdoor', walk_time_minutes: 4, accessible: false }] });
  assert.equal(s.accessible, false);
  assert.match(s.text, /not step-free/);
});

test('summarizeRoute(null) returns null', () => {
  assert.equal(summarizeRoute(null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/wayfinding.test.js`
Expected: FAIL — `summarizeRoute` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `js/wayfinding.js`:

```js
// Summarise a route result into human-readable stats.
export function summarizeRoute(result) {
  if (!result) return null;
  const { edges, totalMinutes } = result;
  const byTypeMinutes = {};
  let undergroundLinks = 0;
  let accessible = true;
  for (const e of edges) {
    byTypeMinutes[e.path_type] = (byTypeMinutes[e.path_type] || 0) + e.walk_time_minutes;
    if (e.path_type === 'underground') undergroundLinks += 1;
    if (e.accessible === false) accessible = false;
  }
  const byTypePct = {};
  for (const [t, m] of Object.entries(byTypeMinutes)) {
    byTypePct[t] = totalMinutes ? Math.round((m / totalMinutes) * 100) : 0;
  }
  const parts = [`${totalMinutes} min`];
  const dominant = Object.entries(byTypePct).sort((a, b) => b[1] - a[1])[0];
  if (dominant) parts.push(`${dominant[1]}% ${dominant[0]}`);
  if (undergroundLinks) {
    parts.push(`${undergroundLinks} underground link${undergroundLinks > 1 ? 's' : ''}`);
  }
  parts.push(accessible ? 'wheelchair accessible' : 'not step-free');
  return { totalMinutes, byTypePct, undergroundLinks, accessible, text: parts.join(' · ') };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/wayfinding.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/wayfinding.js test/wayfinding.test.js
git commit -m "feat(wayfinding): summarizeRoute route-type summary"
```

---

## Task 7: map-data — `indexById` + `searchNodes`

**Files:**
- Create: `js/mapData.js`
- Test: `test/mapData.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/mapData.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexById, searchNodes } from '../js/mapData.js';

const nodes = [
  { id: 'nhcs-l1-lobby', label: 'NHCS Level 1 main lobby', aliases: ['heart centre lobby'] },
  { id: 'sgh-block7-b1', label: 'SGH Block 7 Basement 1', aliases: [] },
];

test('indexById builds a Map keyed by id', () => {
  const m = indexById(nodes);
  assert.equal(m.get('sgh-block7-b1').label, 'SGH Block 7 Basement 1');
});

test('searchNodes matches label prefix and substring', () => {
  assert.equal(searchNodes(nodes, 'NHCS')[0].id, 'nhcs-l1-lobby');
  assert.equal(searchNodes(nodes, 'basement')[0].id, 'sgh-block7-b1');
});

test('searchNodes matches aliases', () => {
  assert.equal(searchNodes(nodes, 'heart centre')[0].id, 'nhcs-l1-lobby');
});

test('searchNodes returns [] for empty query', () => {
  assert.deepEqual(searchNodes(nodes, '  '), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mapData.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `js/mapData.js`:

```js
// Index any record list by its `id` field.
export function indexById(records) {
  return new Map(records.map((r) => [r.id, r]));
}

// Search nodes by label / aliases (case-insensitive), best matches first.
export function searchNodes(nodes, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const n of nodes) {
    const label = n.label.toLowerCase();
    const aliases = (n.aliases || []).map((a) => a.toLowerCase());
    let score = -1;
    if (label === q) score = 100;
    else if (label.startsWith(q)) score = 80;
    else if (label.includes(q)) score = 60;
    else if (aliases.some((a) => a.includes(q))) score = 40;
    if (score >= 0) scored.push({ node: n, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.node);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/mapData.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/mapData.js test/mapData.test.js
git commit -m "feat(map-data): indexById and searchNodes"
```

---

## Task 8: places — POI queries

**Files:**
- Create: `js/places.js`
- Test: `test/places.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/places.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../js/wayfinding.js';
import { poisByCategory, nearestPoi, poisNearNode } from '../js/places.js';

const graph = buildGraph(
  [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
  [
    { id: 'e1', from: 'a', to: 'b', path_type: 'indoor', walk_time_minutes: 2, accessible: true },
    { id: 'e2', from: 'b', to: 'c', path_type: 'indoor', walk_time_minutes: 5, accessible: true },
  ],
);
const pois = [
  { id: 'p1', name: 'Toilet near B', category: 'toilet', node: 'b' },
  { id: 'p2', name: 'Toilet near C', category: 'toilet', node: 'c' },
  { id: 'p3', name: 'Cafe near B', category: 'food', node: 'b' },
];

test('poisByCategory filters', () => {
  assert.equal(poisByCategory(pois, 'toilet').length, 2);
  assert.equal(poisByCategory(pois, 'food').length, 1);
});

test('nearestPoi returns the closest POI of a category by walk time', () => {
  const best = nearestPoi(graph, pois, 'a', { category: 'toilet', mode: 'fastest' });
  assert.equal(best.poi.id, 'p1');           // B (2 min) beats C (7 min)
  assert.equal(best.route.totalMinutes, 2);
});

test('poisNearNode returns POIs within maxMinutes, sorted', () => {
  const near = poisNearNode(graph, pois, 'a', { maxMinutes: 3, mode: 'fastest' });
  assert.deepEqual(near.map((r) => r.poi.id), ['p1', 'p3']);   // both at B (2 min); C excluded
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/places.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `js/places.js`:

```js
import { findRoute } from './wayfinding.js';

// Filter POIs by category.
export function poisByCategory(pois, category) {
  return pois.filter((p) => p.category === category);
}

// Nearest POI (by comfort-weighted walk time) reachable from a node.
// opts: { category, accessibleOnly, mode }. Returns { poi, route } or null.
export function nearestPoi(graph, pois, fromId, opts = {}) {
  const candidates = opts.category ? poisByCategory(pois, opts.category) : pois;
  let best = null;
  for (const poi of candidates) {
    const route = findRoute(graph, fromId, poi.node, {
      mode: opts.mode || 'sheltered',
      accessibleOnly: opts.accessibleOnly || false,
    });
    if (!route) continue;
    if (!best || route.totalMinutes < best.route.totalMinutes) best = { poi, route };
  }
  return best;
}

// All POIs reachable within maxMinutes of a node, sorted nearest first.
// opts: { maxMinutes, mode }.
export function poisNearNode(graph, pois, nodeId, opts = {}) {
  const maxMinutes = opts.maxMinutes ?? Infinity;
  const results = [];
  for (const poi of pois) {
    const route = findRoute(graph, nodeId, poi.node, { mode: opts.mode || 'sheltered' });
    if (route && route.totalMinutes <= maxMinutes) results.push({ poi, minutes: route.totalMinutes });
  }
  return results.sort((a, b) => a.minutes - b.minutes);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/places.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/places.js test/places.test.js
git commit -m "feat(places): POI category, nearest, and near-node queries"
```

---

## Task 9: validator — `validateGraph` + CLI

**Files:**
- Create: `tools/validate-graph.js`
- Test: `test/validate-graph.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/validate-graph.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGraph } from '../tools/validate-graph.js';

const goodNodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
const goodEdges = [{ id: 'e1', from: 'a', to: 'b', path_type: 'indoor', walk_time_minutes: 2, last_verified: '2026-06-20' }];
const goodPois = [{ id: 'p1', name: 'X', category: 'food', node: 'a' }];

test('validateGraph passes a clean graph', () => {
  const r = validateGraph({ nodes: goodNodes, edges: goodEdges, pois: goodPois });
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
});

test('validateGraph flags edge referencing missing node', () => {
  const r = validateGraph({ nodes: goodNodes, edges: [{ id: 'e9', from: 'a', to: 'zzz', path_type: 'indoor', walk_time_minutes: 1, last_verified: '2026-06-20' }], pois: [] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('zzz')));
});

test('validateGraph flags duplicate ids and bad walk time', () => {
  const r = validateGraph({
    nodes: [{ id: 'a', label: 'A' }, { id: 'a', label: 'dupe' }],
    edges: [{ id: 'e1', from: 'a', to: 'a', path_type: 'indoor', walk_time_minutes: 0, last_verified: '2026-06-20' }],
    pois: [],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.toLowerCase().includes('duplicate')));
  assert.ok(r.errors.some((e) => e.includes('walk_time_minutes')));
});

test('validateGraph warns on missing last_verified, POI bad node is an error', () => {
  const r = validateGraph({
    nodes: goodNodes,
    edges: [{ id: 'e1', from: 'a', to: 'b', path_type: 'indoor', walk_time_minutes: 2 }],
    pois: [{ id: 'p9', name: 'Y', category: 'food', node: 'nope' }],
  });
  assert.ok(r.warnings.some((w) => w.includes('last_verified')));
  assert.ok(r.errors.some((e) => e.includes('nope')));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/validate-graph.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `tools/validate-graph.js`:

```js
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Validate a route graph + POIs. Returns { errors, warnings, ok }.
export function validateGraph({ nodes, edges, pois = [] }) {
  const errors = [];
  const warnings = [];

  const nodeIds = new Set();
  for (const n of nodes) {
    if (nodeIds.has(n.id)) errors.push(`Duplicate node id: ${n.id}`);
    nodeIds.add(n.id);
    if (!n.label) errors.push(`Node ${n.id} missing label`);
  }

  const edgeIds = new Set();
  for (const e of edges) {
    if (edgeIds.has(e.id)) errors.push(`Duplicate edge id: ${e.id}`);
    edgeIds.add(e.id);
    if (!nodeIds.has(e.from)) errors.push(`Edge ${e.id} from-node not found: ${e.from}`);
    if (!nodeIds.has(e.to)) errors.push(`Edge ${e.id} to-node not found: ${e.to}`);
    if (typeof e.walk_time_minutes !== 'number' || e.walk_time_minutes <= 0) {
      errors.push(`Edge ${e.id} invalid walk_time_minutes`);
    }
    if (!e.last_verified) warnings.push(`Edge ${e.id} missing last_verified`);
  }

  for (const p of pois) {
    if (!nodeIds.has(p.node)) errors.push(`POI ${p.id} references unknown node: ${p.node}`);
  }

  return { errors, warnings, ok: errors.length === 0 };
}

// CLI: validate the files in data/ and exit non-zero on error.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = async (f) => JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url), 'utf8'));
  const [nodes, edges, pois] = await Promise.all([read('nodes.json'), read('edges.json'), read('pois.json')]);
  const { errors, warnings, ok } = validateGraph({ nodes, edges, pois });
  warnings.forEach((w) => console.warn('WARN:', w));
  errors.forEach((e) => console.error('ERROR:', e));
  console.log(ok
    ? `OK: ${nodes.length} nodes, ${edges.length} edges, ${pois.length} POIs`
    : `FAILED: ${errors.length} error(s)`);
  process.exit(ok ? 0 : 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/validate-graph.test.js`
Expected: PASS.

- [ ] **Step 5: Run the CLI against the seed data**

Run: `npm run validate`
Expected: `OK: 12 nodes, 12 edges, 7 POIs` and exit 0.

- [ ] **Step 6: Commit**

```bash
git add tools/validate-graph.js test/validate-graph.test.js
git commit -m "feat(map-data): graph validator with CLI guard"
```

---

## Task 10: Full suite + changelog

**Files:**
- Create: `docs/changelog/v0.1.md`

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: ALL tests across `test/*.test.js` PASS, exit 0.

- [ ] **Step 2: Run the validator**

Run: `npm run validate`
Expected: `OK: 12 nodes, 12 edges, 7 POIs`, exit 0.

- [ ] **Step 3: Write the changelog**

Create `docs/changelog/v0.1.md`:

```markdown
# v0.1 — Routing core & data layer

- Seed route graph for the Outram cluster (12 nodes, 12 edges) + 7 POIs.
- `wayfinding`: Dijkstra routing with comfort weighting (fastest / sheltered),
  accessible-only filter, and a route-type summary.
- `map-data`: id index + label/alias node search.
- `places`: POI queries by category, nearest-by-walk-time, and near-a-node.
- `validate-graph`: integrity guard (dangling edges, dup ids, bad walk times,
  missing last_verified, POI node refs) with a CLI used by `npm run validate`.
- All logic unit-tested with the Node built-in test runner (no deps).
```

- [ ] **Step 4: Commit**

```bash
git add docs/changelog/v0.1.md
git commit -m "docs: v0.1 changelog (routing core & data layer)"
```

---

## Done criteria

- `npm test` is green across all `test/*.test.js`.
- `npm run validate` prints `OK: 12 nodes, 12 edges, 7 POIs` and exits 0.
- `js/wayfinding.js`, `js/mapData.js`, `js/places.js`, `tools/validate-graph.js`
  exist as pure ES modules importable in both Node and the browser.
- No UI yet — that is Plan 2 (client PWA). Ingestion backend is Plan 3.

# Ingestion Backend + Coordinate Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Termux mapping tool (thin Python server + phone form + Node merge tool) to grow the route graph in detail, on a shared roughly-to-scale coordinate grid so floors align.

**Architecture:** Part A upgrades coordinates to one shared grid (floors align) and adds `mapView.unproject`. Part B adds a pure-Python ingestion server, a mapping form that reuses `mapView`/`mapData`, and a Node merge tool that reuses `validateGraph`.

**Tech Stack:** Vanilla JS (ES modules), Node 18+ test runner, Python 3 stdlib (`http.server`), inline SVG. No deps.

**Spec:** `docs/superpowers/specs/2026-06-21-ingestion-backend-design.md`

---

## File structure

| File | Change |
|---|---|
| `js/mapView.js` | add `unproject` |
| `js/app.js` | floor map uses one shared transform (all nodes) |
| `data/nodes.json` | re-space coords onto the shared grid (lift pairs aligned) |
| `data/meta.json` | new — optional `scale` |
| `tools/merge-staging.js` | new — `slugifyId`, `stagedToGraph`, dry-run/`--apply` CLI |
| `ingestion/server.py` | new — thin Python server |
| `ingestion/index.html`, `ingestion/ingest.js` | new — mapping form |
| `test/mapView.test.js`, `test/merge-staging.test.js` | tests |
| `sw.js` | cache bump; add `data/meta.json` |
| `docs/ingestion.md`, `docs/changelog/v0.5.md` | docs |

---

# Part A — Coordinate foundation

## Task 1: mapView.unproject

**Files:**
- Modify: `js/mapView.js`
- Test: `test/mapView.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `test/mapView.test.js`:

```js
import { unproject } from '../js/mapView.js';

test('unproject is the inverse of project', () => {
  const t = fitTransform([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }], 110, 110, 10);
  const back = unproject(project({ x: 7, y: 3 }, t), t);
  assert.ok(Math.abs(back.x - 7) < 1e-9, `x=${back.x}`);
  assert.ok(Math.abs(back.y - 3) < 1e-9, `y=${back.y}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mapView.test.js`
Expected: FAIL — `unproject` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `js/mapView.js`:

```js
// Inverse of project(): a screen-space point back to data/grid coords.
export function unproject(point, t) {
  return { x: (point.x - t.offsetX) / t.scale, y: (point.y - t.offsetY) / t.scale };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/mapView.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/mapView.js test/mapView.test.js
git commit -m "feat(map): mapView.unproject (screen -> grid coords)"
```

---

## Task 2: Re-space seed coords onto the shared grid + meta.json

**Files:**
- Modify: `data/nodes.json`
- Create: `data/meta.json`

- [ ] **Step 1: Rewrite `data/nodes.json`** with shared-grid coords (lift pairs share x/y across levels: SGH Block 7 lift L1 == basement B1 at 48,52; the NHCS stack b1-lift / l1-lobby / l2-cafe all at 80,52):

```json
[
  { "id": "outram-mrt-exit", "label": "Outram Park MRT Exit 4", "aliases": ["mrt", "outram mrt"], "building": "MRT", "level": 1, "lat": 1.2803, "lng": 103.8397, "x": 70, "y": 15, "type": "entrance" },
  { "id": "sgh-block5-l1", "label": "SGH Block 5 Level 1", "aliases": ["block 5"], "building": "SGH", "level": 1, "lat": 1.2796, "lng": 103.8352, "x": 25, "y": 45, "type": "junction" },
  { "id": "sgh-block7-l1-lobby", "label": "SGH Block 7 Level 1 lobby", "aliases": ["block 7 lobby"], "building": "SGH", "level": 1, "lat": 1.2790, "lng": 103.8358, "x": 40, "y": 50, "type": "lobby" },
  { "id": "sgh-block7-lift", "label": "SGH Block 7 lifts", "aliases": ["block 7 lift"], "building": "SGH", "level": 1, "lat": null, "lng": null, "x": 48, "y": 52, "type": "lift" },
  { "id": "sgh-block7-b1", "label": "SGH Block 7 Basement 1", "aliases": ["block 7 basement"], "building": "SGH", "level": -1, "lat": null, "lng": null, "x": 48, "y": 52, "type": "junction" },
  { "id": "sgh-block3-b1", "label": "SGH Block 3 Basement 1", "aliases": ["block 3 basement", "kopitiam basement"], "building": "SGH", "level": -1, "lat": null, "lng": null, "x": 38, "y": 62, "type": "junction" },
  { "id": "linkway-nhcs-sgh-b1", "label": "NHCS–SGH basement linkway", "aliases": ["underground linkway", "basement linkway"], "building": "LINK", "level": -1, "lat": null, "lng": null, "x": 62, "y": 55, "type": "junction" },
  { "id": "nhcs-b1-lift", "label": "NHCS Basement 1 lifts", "aliases": ["nhcs basement lift"], "building": "NHCS", "level": -1, "lat": null, "lng": null, "x": 80, "y": 52, "type": "lift" },
  { "id": "nhcs-l1-lobby", "label": "NHCS Level 1 main lobby", "aliases": ["heart centre lobby", "nhcs lobby"], "building": "NHCS", "level": 1, "lat": 1.2789, "lng": 103.8410, "x": 80, "y": 52, "type": "lobby" },
  { "id": "nhcs-l1-entrance", "label": "NHCS main entrance (drop-off)", "aliases": ["nhcs entrance", "heart centre entrance"], "building": "NHCS", "level": 1, "lat": 1.2791, "lng": 103.8412, "x": 82, "y": 42, "type": "entrance" },
  { "id": "nhcs-l2-cafe", "label": "NHCS Level 2 cafe", "aliases": ["nhcs cafe", "heart centre cafe", "cafe level 2"], "building": "NHCS", "level": 2, "lat": null, "lng": null, "x": 80, "y": 52, "type": "landmark" },
  { "id": "ncc-l1-lobby", "label": "NCC Level 1 lobby", "aliases": ["cancer centre lobby", "ncc lobby"], "building": "NCC", "level": 1, "lat": 1.2784, "lng": 103.8405, "x": 82, "y": 70, "type": "lobby" },
  { "id": "bus-stop-outram", "label": "Bus stop opp SGH (Outram Rd)", "aliases": ["bus stop"], "building": "EXT", "level": 1, "lat": 1.2808, "lng": 103.8366, "x": 40, "y": 8, "type": "entrance" }
]
```

- [ ] **Step 2: Create `data/meta.json`**

```json
{
  "coordinateScale": null,
  "scaleUnit": "grid-units-per-metre",
  "note": "Shared roughly-to-scale grid for the whole cluster; floors share one coordinate space. Set coordinateScale later to refine a building toward true scale.",
  "updated": "2026-06-21"
}
```

- [ ] **Step 3: Validate**

Run: `npm run validate`
Expected: `OK: 13 nodes, 13 edges, 7 POIs`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add data/nodes.json data/meta.json
git commit -m "feat(map-data): shared roughly-to-scale coordinate grid + meta.json"
```

---

## Task 3: Floor map uses one shared transform

**Files:**
- Modify: `js/app.js` (the `mapSVG` function)

- [ ] **Step 1: Make the transform span all levels**

In `js/app.js`, in `mapSVG(level)`, replace the transform line so it fits **all** coord-bearing nodes (not just this level), making floors align:

Find:

```js
  const levelNodes = nodesOnLevel(nodes, level);
  if (!levelNodes.length) return '<p class="msg">No map for this level.</p>';
  const t = fitTransform(levelNodes, MAP_W, MAP_H, MAP_PAD);
```

Replace with:

```js
  const levelNodes = nodesOnLevel(nodes, level);
  if (!levelNodes.length) return '<p class="msg">No map for this level.</p>';
  const allCoordNodes = nodes.filter((n) => typeof n.x === 'number' && typeof n.y === 'number');
  const t = fitTransform(allCoordNodes, MAP_W, MAP_H, MAP_PAD);
```

- [ ] **Step 2: Verify floors align in the browser**

Run: `python -m http.server 8080` and open `http://localhost:8080` (clear the old service worker first: DevTools → Application → Service Workers → Unregister, then reload).
Make a route Outram MRT → NHCS cafe. Switch L1 ↔ B1 ↔ L2: the SGH Block 7 lift (L1) and Block 7 basement (B1) sit at the **same screen position**; the NHCS lobby/lift/cafe stack stays put across floors.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat(map): shared transform so floors align across levels"
```

---

# Part B — Ingestion

## Task 4: merge-staging pure helpers

**Files:**
- Create: `tools/merge-staging.js`
- Test: `test/merge-staging.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/merge-staging.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugifyId, stagedToGraph } from '../tools/merge-staging.js';
import { validateGraph } from '../tools/validate-graph.js';

test('slugifyId makes a kebab id from a label', () => {
  assert.equal(slugifyId('NHCS Level 2 cafe'), 'nhcs-level-2-cafe');
});

test('slugifyId dedupes against existing ids', () => {
  assert.equal(slugifyId('Lobby', ['lobby']), 'lobby-2');
  assert.equal(slugifyId('Lobby', ['lobby', 'lobby-2']), 'lobby-3');
});

test('slugifyId falls back for empty-ish labels', () => {
  assert.equal(slugifyId('!!!'), 'node');
});

test('stagedToGraph builds nodes + edges with generated ids', () => {
  const nodes = [{ id: 'a', label: 'A', building: 'X', level: 1, x: 0, y: 0 }];
  const edges = [{ id: 'e-001', from: 'a', to: 'a', path_type: 'indoor', walk_time_minutes: 2, last_verified: '2026-06-21' }];
  const staged = [{ node: { label: 'New Lobby', building: 'X', level: 1, type: 'lobby', x: 5, y: 6 }, edges: [{ to: 'a', path_type: 'indoor', walk_time_minutes: 3, accessible: true }] }];
  const { addedNodes, addedEdges } = stagedToGraph(staged, nodes, edges);
  assert.equal(addedNodes[0].id, 'new-lobby');
  assert.equal(addedNodes[0].x, 5);
  assert.equal(addedEdges[0].id, 'e-002');
  assert.equal(addedEdges[0].from, 'new-lobby');
  assert.equal(addedEdges[0].to, 'a');
});

test('stagedToGraph output merges into a valid graph', () => {
  const nodes = [{ id: 'a', label: 'A', building: 'X', level: 1, x: 0, y: 0 }];
  const edges = [{ id: 'e-001', from: 'a', to: 'a', path_type: 'indoor', walk_time_minutes: 2, last_verified: '2026-06-21' }];
  const staged = [{ node: { label: 'B', building: 'X', level: 1, type: 'lobby', x: 5, y: 5 }, edges: [{ to: 'a', path_type: 'indoor', walk_time_minutes: 3, accessible: true }] }];
  const { addedNodes, addedEdges } = stagedToGraph(staged, nodes, edges);
  const r = validateGraph({ nodes: [...nodes, ...addedNodes], edges: [...edges, ...addedEdges], pois: [] });
  assert.equal(r.ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/merge-staging.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `tools/merge-staging.js`:

```js
import { readFile, writeFile, readdir, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateGraph } from './validate-graph.js';

// Kebab-case id from a label, de-duplicated against existing ids.
export function slugifyId(label, existingIds = []) {
  const base = String(label).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'node';
  const set = new Set(existingIds);
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

// Convert staged waypoint records into new node + edge records.
export function stagedToGraph(staged, nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const addedNodes = [];
  const addedEdges = [];
  let maxEdge = edges.reduce((m, e) => Math.max(m, parseInt(String(e.id).replace(/^e-/, ''), 10) || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  for (const rec of staged) {
    const n = rec.node || {};
    const id = slugifyId(n.label, ids);
    ids.push(id);
    const node = {
      id, label: n.label, aliases: n.aliases || [], building: n.building,
      level: n.level, lat: n.lat ?? null, lng: n.lng ?? null, type: n.type || 'landmark',
    };
    if (typeof n.x === 'number' && typeof n.y === 'number') { node.x = n.x; node.y = n.y; }
    addedNodes.push(node);
    for (const e of rec.edges || []) {
      maxEdge += 1;
      addedEdges.push({
        id: `e-${String(maxEdge).padStart(3, '0')}`, from: id, to: e.to,
        path_type: e.path_type, walk_time_minutes: e.walk_time_minutes,
        accessible: e.accessible !== false, oneway: false, notes: e.notes || '', last_verified: today,
      });
    }
  }
  return { addedNodes, addedEdges };
}

// CLI: review (dry-run) or apply the staging files into data/.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes('--apply');
  const root = new URL('../', import.meta.url);
  const dataUrl = (f) => new URL(`data/${f}`, root);
  const stagingDir = new URL('ingestion/staging/', root);
  const nodes = JSON.parse(await readFile(dataUrl('nodes.json'), 'utf8'));
  const edges = JSON.parse(await readFile(dataUrl('edges.json'), 'utf8'));
  const pois = JSON.parse(await readFile(dataUrl('pois.json'), 'utf8'));

  let files = [];
  try {
    files = (await readdir(stagingDir)).filter((f) => f.startsWith('session-') && f.endsWith('.json'));
  } catch { /* no staging dir */ }
  if (!files.length) { console.log('No staging files in ingestion/staging/.'); process.exit(0); }

  const staged = [];
  for (const f of files) {
    const recs = JSON.parse(await readFile(new URL(f, stagingDir), 'utf8'));
    for (const r of (Array.isArray(recs) ? recs : [recs])) staged.push(r);
  }

  const { addedNodes, addedEdges } = stagedToGraph(staged, nodes, edges);
  const mergedNodes = [...nodes, ...addedNodes];
  const mergedEdges = [...edges, ...addedEdges];
  const { errors, warnings, ok } = validateGraph({ nodes: mergedNodes, edges: mergedEdges, pois });

  console.log(`Staging: ${files.length} file(s), ${staged.length} waypoint(s) -> +${addedNodes.length} nodes, +${addedEdges.length} edges`);
  warnings.forEach((w) => console.warn('WARN:', w));
  errors.forEach((e) => console.error('ERROR:', e));

  if (!apply) {
    console.log(ok ? 'Dry run OK. Re-run with --apply to write.' : 'Dry run FAILED — fix errors before applying.');
    process.exit(ok ? 0 : 1);
  }
  if (!ok) { console.error('Refusing to apply: validation errors.'); process.exit(1); }

  await writeFile(dataUrl('nodes.json'), `${JSON.stringify(mergedNodes, null, 2)}\n`);
  await writeFile(dataUrl('edges.json'), `${JSON.stringify(mergedEdges, null, 2)}\n`);
  const mergedDir = new URL('ingestion/staging/merged/', root);
  await mkdir(mergedDir, { recursive: true });
  for (const f of files) await rename(new URL(f, stagingDir), new URL(f, mergedDir));
  console.log(`Applied: ${mergedNodes.length} nodes, ${mergedEdges.length} edges. Archived ${files.length} staging file(s).`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/merge-staging.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/merge-staging.js test/merge-staging.test.js
git commit -m "feat(ingestion): merge-staging helpers (slugifyId, stagedToGraph) + dry-run/apply CLI"
```

---

## Task 5: Ingestion server

**Files:**
- Create: `ingestion/server.py`

- [ ] **Step 1: Create `ingestion/server.py`**

```python
#!/usr/bin/env python3
"""Tiny ingestion server for the hospital wayfinder (Termux-friendly, stdlib only).

Serves the repo statically (form + js/ + data/ + css/) and adds:
  POST /waypoint  -> append a record to ingestion/staging/session-YYYYMMDD.json
  GET  /gps       -> termux-location passthrough (optional)
Run: python ingestion/server.py [port]   (default 8788)
"""
import json
import os
import subprocess
import sys
from datetime import date, datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAGING = os.path.join(ROOT, "ingestion", "staging")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _send_json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/gps":
            try:
                out = subprocess.run(
                    ["termux-location", "-p", "gps"],
                    capture_output=True, text=True, timeout=30,
                )
                self._send_json(200, json.loads(out.stdout) if out.stdout.strip() else {"error": "no fix"})
            except Exception as exc:  # noqa: BLE001
                self._send_json(200, {"error": str(exc)})
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/waypoint":
            self._send_json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            record = json.loads(self.rfile.read(length) or b"{}")
        except Exception as exc:  # noqa: BLE001
            self._send_json(400, {"error": f"bad json: {exc}"})
            return
        record.setdefault("status", "staged")
        record.setdefault("captured_at", datetime.now().isoformat(timespec="seconds"))
        os.makedirs(STAGING, exist_ok=True)
        path = os.path.join(STAGING, f"session-{date.today():%Y%m%d}.json")
        data = []
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                try:
                    data = json.load(fh)
                except Exception:  # noqa: BLE001
                    data = []
        data.append(record)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
        self._send_json(200, {"ok": True, "count": len(data)})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8788
    print(f"Ingestion server: http://localhost:{port}/ingestion/  (Ctrl-C to stop)")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Manual test — POST a waypoint**

Run in one shell: `python ingestion/server.py 8788`
In another:

```bash
curl -s -X POST http://localhost:8788/waypoint -H "Content-Type: application/json" \
  -d '{"node":{"label":"Test node","building":"SGH","level":1},"edges":[{"to":"sgh-block5-l1","path_type":"indoor","walk_time_minutes":2,"accessible":true}]}'
```

Expected: `{"ok": true, "count": 1}` and a file `ingestion/staging/session-YYYYMMDD.json` containing the record.
Then delete the test staging file: `rm ingestion/staging/session-*.json` (don't merge test data).

- [ ] **Step 3: Commit**

```bash
git add ingestion/server.py
git commit -m "feat(ingestion): thin pure-Python staging server"
```

---

## Task 6: Mapping form

**Files:**
- Create: `ingestion/index.html`, `ingestion/ingest.js`

- [ ] **Step 1: Create `ingestion/index.html`**

```html
<!doctype html>
<html lang="en-SG">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Wayfinder — mapping</title>
  <style>
    body { font: 400 16px/1.5 system-ui, sans-serif; margin: 0; padding: 14px; max-width: 560px; background: #f5f7f8; color: #1a2b32; }
    h1 { font-size: 18px; }
    label { font-size: 13px; color: #5b727c; display: block; margin-top: 8px; }
    input, select { width: 100%; min-height: 42px; padding: 8px 10px; font-size: 15px; border: 1px solid #cdd8da; border-radius: 8px; background: #fff; box-sizing: border-box; }
    .row { display: flex; gap: 8px; }
    .row > div { flex: 1; }
    .edgerow { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; border: 1px solid #dce5e7; border-radius: 8px; padding: 8px; margin-top: 6px; }
    .edgerow input[type="checkbox"] { width: auto; min-height: 0; }
    button { min-height: 44px; padding: 8px 14px; border: 1px solid #0f9488; background: #fff; color: #0f3d39; border-radius: 8px; font-size: 15px; }
    button.primary { background: #0f9488; color: #fff; border-color: #0f9488; width: 100%; margin-top: 12px; }
    #map svg { background: #fff; border: 1px solid #cdd8da; border-radius: 8px; touch-action: manipulation; }
    #status { margin-top: 8px; font-weight: 500; min-height: 20px; }
    .muted { color: #5b727c; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Add waypoint</h1>
  <label>Landmark name</label>
  <input id="label" placeholder="e.g. SGH Block 2 pharmacy">
  <div class="row">
    <div><label>Building</label><input id="building" list="buildinglist" placeholder="SGH"></div>
    <div><label>Level</label><input id="level" type="number" value="1"></div>
  </div>
  <div class="row">
    <div><label>Type</label>
      <select id="type"><option>landmark</option><option>lobby</option><option>junction</option><option>lift</option><option>escalator</option><option>stairs</option><option>entrance</option></select>
    </div>
    <div><label>Aliases (comma-sep)</label><input id="aliases" placeholder="optional"></div>
  </div>

  <label>Tap your spot on the map (optional)</label>
  <div id="map"></div>

  <label>GPS (outdoor only)</label>
  <div class="row" style="align-items:center">
    <button id="grab-gps" type="button">Grab GPS</button>
    <span id="gps-out" class="muted"></span>
  </div>
  <input id="lat" type="hidden"><input id="lng" type="hidden">

  <label>Walk-time stopwatch</label>
  <div class="row" style="align-items:center">
    <button id="timer-start" type="button">Start</button>
    <button id="timer-stop" type="button">Arrive</button>
    <span id="timer-out" class="muted"></span>
  </div>

  <label>Connecting corridors</label>
  <div id="edges"></div>
  <button id="add-edge" type="button" style="margin-top:6px">+ another corridor</button>

  <button id="save" class="primary" type="button">Save waypoint → staging</button>
  <div id="status"></div>

  <datalist id="nodelist"></datalist>
  <datalist id="buildinglist"></datalist>
  <script type="module" src="ingest.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `ingestion/ingest.js`**

```js
import { nodesOnLevel, buildingZones, fitTransform, project, unproject } from '../js/mapView.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAP_W = 320;
const MAP_H = 240;
const MAP_PAD = 22;

let nodes = [];
let placed = null;
let timerStart = null;

async function init() {
  nodes = await fetch('/data/nodes.json').then((r) => r.json());
  $('#nodelist').innerHTML = nodes.map((n) => `<option value="${esc(n.label)}">`).join('');
  $('#buildinglist').innerHTML = [...new Set(nodes.map((n) => n.building))].map((b) => `<option value="${esc(b)}">`).join('');
  $('#level').addEventListener('input', renderMap);
  $('#grab-gps').addEventListener('click', grabGps);
  $('#add-edge').addEventListener('click', addEdgeRow);
  $('#timer-start').addEventListener('click', () => { timerStart = Date.now(); $('#timer-out').textContent = 'timing…'; });
  $('#timer-stop').addEventListener('click', stopTimer);
  $('#save').addEventListener('click', save);
  addEdgeRow();
  renderMap();
}

function levelValue() { return Number($('#level').value || 1); }

function renderMap() {
  const level = levelValue();
  const coordNodes = nodes.filter((n) => typeof n.x === 'number' && typeof n.y === 'number');
  const t = fitTransform(coordNodes.length ? coordNodes : [{ x: 0, y: 0 }, { x: 100, y: 100 }], MAP_W, MAP_H, MAP_PAD);
  const P = (p) => project(p, t);
  const lvl = nodesOnLevel(nodes, level);
  const zones = buildingZones(lvl).filter((z) => z.maxX > z.minX || z.maxY > z.minY).map((z) => {
    const a = P({ x: z.minX, y: z.minY });
    const b = P({ x: z.maxX, y: z.maxY });
    const x = Math.min(a.x, b.x) - 10;
    const y = Math.min(a.y, b.y) - 10;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(Math.abs(b.x - a.x) + 20).toFixed(1)}" height="${(Math.abs(b.y - a.y) + 20).toFixed(1)}" rx="10" fill="#e6f4f2" stroke="#dce5e7"/>`;
  }).join('');
  const dots = lvl.map((n) => {
    const p = P(n);
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#5b727c"/><text x="${(p.x + 6).toFixed(1)}" y="${(p.y + 3).toFixed(1)}" font-size="9" fill="#5b727c">${esc(n.label)}</text>`;
  }).join('');
  const pin = placed ? (() => { const p = P(placed); return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="#0f9488" stroke="#fff" stroke-width="2"/>`; })() : '';
  $('#map').innerHTML = `<svg viewBox="0 0 ${MAP_W} ${MAP_H}" width="100%">${zones}${dots}${pin}</svg>`;
  const svg = $('#map svg');
  svg.addEventListener('click', (ev) => {
    const r = svg.getBoundingClientRect();
    const sx = (ev.clientX - r.left) * (MAP_W / r.width);
    const sy = (ev.clientY - r.top) * (MAP_H / r.height);
    placed = unproject({ x: sx, y: sy }, t);
    placed = { x: Math.round(placed.x * 10) / 10, y: Math.round(placed.y * 10) / 10 };
    renderMap();
  });
}

function stopTimer() {
  if (!timerStart) return;
  const mins = Math.max(1, Math.round((Date.now() - timerStart) / 60000));
  $('#timer-out').textContent = `${mins} min`;
  const walks = document.querySelectorAll('.edgerow [data-k="walk"]');
  if (walks.length) walks[walks.length - 1].value = mins;
  timerStart = null;
}

function grabGps() {
  const set = (lat, lng) => { $('#lat').value = lat; $('#lng').value = lng; $('#gps-out').textContent = `lat ${(+lat).toFixed(5)}, lng ${(+lng).toFixed(5)}`; };
  const viaServer = async () => {
    try { const g = await fetch('/gps').then((r) => r.json()); if (g.latitude) set(g.latitude, g.longitude); else $('#gps-out').textContent = 'no GPS fix'; } catch { $('#gps-out').textContent = 'no GPS'; }
  };
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => set(pos.coords.latitude, pos.coords.longitude), viaServer, { enableHighAccuracy: true, timeout: 15000 });
  } else { viaServer(); }
}

function addEdgeRow() {
  const div = document.createElement('div');
  div.className = 'edgerow';
  div.innerHTML = `
    <input list="nodelist" placeholder="connects to…" data-k="to">
    <select data-k="path_type"><option>indoor</option><option>sheltered</option><option>underground</option><option>outdoor</option></select>
    <input type="number" min="1" placeholder="walk min" data-k="walk">
    <label style="display:flex;align-items:center;gap:6px;color:#1a2b32"><input type="checkbox" data-k="acc" checked> accessible</label>
    <input placeholder="notes" data-k="notes" style="grid-column:1/3">`;
  $('#edges').appendChild(div);
}

async function save() {
  const node = {
    label: $('#label').value.trim(),
    building: $('#building').value.trim(),
    level: levelValue(),
    type: $('#type').value,
    aliases: $('#aliases').value.split(',').map((s) => s.trim()).filter(Boolean),
    lat: $('#lat').value ? Number($('#lat').value) : null,
    lng: $('#lng').value ? Number($('#lng').value) : null,
  };
  if (placed) { node.x = placed.x; node.y = placed.y; }
  if (!node.label || !node.building) { $('#status').textContent = 'Label and building are required.'; return; }
  const labelToId = new Map(nodes.map((n) => [n.label, n.id]));
  const edges = [...document.querySelectorAll('.edgerow')].map((row) => {
    const g = (k) => row.querySelector(`[data-k="${k}"]`);
    const toRaw = g('to').value.trim();
    return { to: labelToId.get(toRaw) || toRaw, path_type: g('path_type').value, walk_time_minutes: Number(g('walk').value) || 1, accessible: g('acc').checked, notes: g('notes').value.trim() };
  }).filter((e) => e.to);
  const res = await fetch('/waypoint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ node, edges }) }).then((r) => r.json()).catch(() => ({ error: 'network' }));
  if (res.ok) {
    $('#status').textContent = `Saved ✓ (${res.count} this session)`;
    nodes.push({ ...node, id: node.label });
    $('#nodelist').innerHTML = nodes.map((n) => `<option value="${esc(n.label)}">`).join('');
    $('#label').value = ''; $('#aliases').value = ''; $('#lat').value = ''; $('#lng').value = ''; $('#gps-out').textContent = ''; $('#timer-out').textContent = '';
    placed = null; $('#edges').innerHTML = ''; addEdgeRow(); renderMap();
  } else {
    $('#status').textContent = `Save failed: ${res.error || '?'}`;
  }
}

init();
```

- [ ] **Step 3: Verify in the browser**

Run: `python ingestion/server.py 8788`
Open `http://localhost:8788/ingestion/`. Verify: existing nodes appear on the map; tapping drops a teal pin; the level field changes which nodes show; the stopwatch fills the corridor's walk-time; "connects to" autocompletes node names; Save shows "Saved ✓ (N this session)" and a `session-*.json` appears in `ingestion/staging/`.
Then remove the test file: `rm ingestion/staging/session-*.json`.

- [ ] **Step 4: Commit**

```bash
git add ingestion/index.html ingestion/ingest.js
git commit -m "feat(ingestion): phone mapping form (tap-to-place, stopwatch, connects-to)"
```

---

## Task 7: SW cache, docs, changelog, full suite

**Files:**
- Modify: `sw.js`
- Create: `docs/ingestion.md`, `docs/changelog/v0.5.md`

- [ ] **Step 1: Bump the cache and add `data/meta.json`**

In `sw.js`, change the cache name and add the meta file:

```js
const CACHE = 'hw-v0.5';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/styles.css',
  './js/app.js', './js/wayfinding.js', './js/mapData.js', './js/places.js',
  './js/render.js', './js/platform.js', './js/mapView.js', './js/pwa.js',
  './data/nodes.json', './data/edges.json', './data/pois.json', './data/meta.json',
  './icon-192.svg', './icon-512.svg',
];
```

(The `ingestion/` tool is dev-only and intentionally not precached for the patient app.)

- [ ] **Step 2: Create `docs/ingestion.md`**

```markdown
# Mapping new waypoints (ingestion)

Grow the route graph from your phone while walking the corridors.

## On Termux
1. `pkg install python` (and optionally `termux-api` + the Termux:API app for GPS).
2. `python ingestion/server.py` (defaults to port 8788).
3. Open `http://localhost:8788/ingestion/` in Chrome.
4. For each waypoint: name it, pick building/level/type, tap its spot on the map,
   pick the connecting corridor(s), time the walk with the stopwatch, Save.
   Records append to `ingestion/staging/session-YYYYMMDD.json` (gitignored).

## Back at the desk
1. Review: `node tools/merge-staging.js` (dry-run — prints what would be added +
   any validation problems).
2. Apply: `node tools/merge-staging.js --apply` (writes `data/nodes.json` +
   `data/edges.json`, archives the staging file to `ingestion/staging/merged/`).
3. `npm run validate`, then commit the data change.

## Coordinates
Place nodes roughly to scale on a shared grid; the same spot keeps the same x/y on
every floor (so floors line up). Use the stopwatch/step count as a sense of
proportion. See `data/meta.json` to refine toward true scale later.
```

- [ ] **Step 3: Create `docs/changelog/v0.5.md`**

```markdown
# v0.5 — Ingestion backend + shared coordinate grid

- Coordinates now use one shared, roughly-to-scale grid for the whole cluster, so
  the floor map's levels line up (lift stacks stay put across floors).
  `mapView.unproject` added for tap-to-place.
- Ingestion: a thin pure-Python server (`ingestion/server.py`) + a phone mapping
  form (tap-to-place, walk-time stopwatch, connects-to autocomplete) that append
  waypoints to a gitignored staging file.
- `tools/merge-staging.js` reviews (dry-run) and applies staged waypoints into the
  graph, reusing `validateGraph`; refuses to apply on validation errors.
- See `docs/ingestion.md`. Tests: 53 total.
```

- [ ] **Step 4: Run the full suite + validate**

Run: `npm test`
Expected: all pass (47 prior + `unproject` 1 + merge-staging 5 − none removed = 53). Confirm the printed total and that fail = 0.

Run: `npm run validate`
Expected: `OK: 13 nodes, 13 edges, 7 POIs`.

- [ ] **Step 5: Commit**

```bash
git add sw.js docs/ingestion.md docs/changelog/v0.5.md
git commit -m "feat(ingestion): cache bump, usage docs, v0.5 changelog"
```

---

## Done criteria

- `npm test` green (53 tests); `npm run validate` → `OK: 13 nodes, 13 edges, 7 POIs`.
- Floor map levels align (shared transform) across L2/L1/B1.
- `python ingestion/server.py` serves the form at `/ingestion/`; saving a waypoint
  appends to `ingestion/staging/`, and `node tools/merge-staging.js` reviews/applies
  it (reusing `validateGraph`).
- Patient app and its tests unchanged in behavior; `ingestion/` is dev-only.

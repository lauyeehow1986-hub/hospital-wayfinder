import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, findRoute } from '../js/wayfinding.js';
import { indexById } from '../js/mapData.js';
import {
  levelsPresent,
  levelLabel,
  nodesOnLevel,
  edgesOnLevel,
  buildingZones,
  fitTransform,
  project,
  routeByLevel,
} from '../js/mapView.js';

const nodes = [
  { id: 'a', label: 'A', building: 'X', level: 1, x: 0, y: 0 },
  { id: 'b', label: 'B', building: 'X', level: 1, x: 10, y: 0 },
  { id: 'c', label: 'C', building: 'Y', level: -1, x: 10, y: 0 },
  { id: 'd', label: 'D', building: 'Y', level: 1 },
];
const edges = [
  { id: 'e1', from: 'a', to: 'b', path_type: 'indoor', walk_time_minutes: 2 },
  { id: 'e2', from: 'b', to: 'c', path_type: 'indoor', walk_time_minutes: 1 },
];
const nodeById = indexById(nodes);
const graph = buildGraph(nodes, edges);

// --- selectors ------------------------------------------------------------

test('levelsPresent returns unique levels, descending', () => {
  assert.deepEqual(levelsPresent(nodes), [1, -1]);
});

test('levelLabel formats floors', () => {
  assert.equal(levelLabel(1), 'L1');
  assert.equal(levelLabel(-1), 'B1');
  assert.equal(levelLabel(0), 'G');
});

test('nodesOnLevel filters by level and requires coords', () => {
  assert.deepEqual(nodesOnLevel(nodes, 1).map((n) => n.id), ['a', 'b']);
});

test('edgesOnLevel keeps only intra-level edges', () => {
  assert.deepEqual(edgesOnLevel(edges, 1, nodeById).map((e) => e.id), ['e1']);
  assert.deepEqual(edgesOnLevel(edges, -1, nodeById).map((e) => e.id), []);
});

// --- zones + transform ----------------------------------------------------

test('buildingZones makes one bounding box per building', () => {
  const zones = buildingZones(nodesOnLevel(nodes, 1));
  assert.equal(zones.length, 1);
  assert.deepEqual(zones[0], { building: 'X', minX: 0, minY: 0, maxX: 10, maxY: 0 });
});

test('fitTransform maps min to pad and preserves aspect', () => {
  const t = fitTransform([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }], 110, 110, 10);
  assert.equal(t.scale, 9);
  const o = project({ x: 0, y: 0 }, t);
  assert.equal(Math.round(o.x), 10);
  assert.equal(Math.round(o.y), 10);
  assert.equal(Math.round(project({ x: 10, y: 10 }, t).x), 100);
});

test('fitTransform falls back for a single point', () => {
  const t = fitTransform([{ x: 5, y: 5 }], 100, 100, 10);
  assert.equal(t.scale, 1);
  assert.equal(Math.round(project({ x: 5, y: 5 }, t).x), 50);
});

// --- route geometry -------------------------------------------------------

test('routeByLevel splits segments per level and records cross-level changes', () => {
  const r = routeByLevel(graph, findRoute(graph, 'a', 'c', { mode: 'fastest' }));
  assert.deepEqual(r.byLevel[1].segments.map((s) => [s.fromId, s.toId]), [['a', 'b']]);
  assert.deepEqual(r.byLevel[1].nodes.map((n) => n.id), ['a', 'b']);
  assert.deepEqual(r.byLevel[-1].nodes.map((n) => n.id), ['c']);
  assert.equal(r.changes.length, 1);
  assert.deepEqual(
    { from: r.changes[0].fromLevel, to: r.changes[0].toLevel, dir: r.changes[0].direction, at: r.changes[0].atNodeId },
    { from: 1, to: -1, dir: 'down', at: 'b' },
  );
});

test('routeByLevel handles a null result', () => {
  assert.deepEqual(routeByLevel(graph, null), { byLevel: {}, changes: [] });
});

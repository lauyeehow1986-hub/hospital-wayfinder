import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, findRoute, summarizeRoute } from '../js/wayfinding.js';

// --- buildGraph -----------------------------------------------------------

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
  assert.equal(g.adj.get('a').length, 1); // a->b
  assert.equal(g.adj.get('b').length, 2); // b->a (reverse of e1) and b->c
});

test('buildGraph respects oneway edges', () => {
  const g = buildGraph(nodes, edges);
  assert.equal(g.adj.get('c').length, 0); // e2 is oneway b->c, no reverse
});

test('buildGraph throws on edge referencing unknown node', () => {
  assert.throws(() =>
    buildGraph(nodes, [{ id: 'x', from: 'a', to: 'zzz', path_type: 'indoor', walk_time_minutes: 1 }]),
  );
});

// --- findRoute (Dijkstra) -------------------------------------------------

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

// --- comfort weighting + accessible filter --------------------------------

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
  assert.deepEqual(r.path, ['a', 'x', 'd']); // 3 min raw beats 4 min
});

test('sheltered mode avoids exposed outdoor even though it is longer', () => {
  const r = findRoute(comfort, 'a', 'd', { mode: 'sheltered' });
  assert.deepEqual(r.path, ['a', 'b', 'd']); // outdoor penalised x3
});

test('accessibleOnly excludes non-accessible edges', () => {
  const r = findRoute(comfort, 'a', 'd', { mode: 'fastest', accessibleOnly: true });
  assert.deepEqual(r.path, ['a', 'b', 'd']); // c3 (a->x) is accessible:false, excluded
});

// --- summarizeRoute -------------------------------------------------------

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
  const s = summarizeRoute({
    totalMinutes: 4,
    edges: [{ path_type: 'outdoor', walk_time_minutes: 4, accessible: false }],
  });
  assert.equal(s.accessible, false);
  assert.match(s.text, /not step-free/);
});

test('summarizeRoute(null) returns null', () => {
  assert.equal(summarizeRoute(null), null);
});

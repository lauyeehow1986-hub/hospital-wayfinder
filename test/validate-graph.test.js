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
  const r = validateGraph({
    nodes: goodNodes,
    edges: [{ id: 'e9', from: 'a', to: 'zzz', path_type: 'indoor', walk_time_minutes: 1, last_verified: '2026-06-20' }],
    pois: [],
  });
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

test('validateGraph warns when a node lacks x/y coordinates', () => {
  const r = validateGraph({ nodes: [{ id: 'a', label: 'A' }], edges: [], pois: [] });
  assert.ok(r.warnings.some((w) => w.includes('x/y')));
  assert.equal(r.ok, true);
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

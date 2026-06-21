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

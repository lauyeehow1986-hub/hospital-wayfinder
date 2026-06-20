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
  assert.equal(best.poi.id, 'p1'); // B (2 min) beats C (7 min)
  assert.equal(best.route.totalMinutes, 2);
});

test('poisNearNode returns POIs within maxMinutes, sorted', () => {
  const near = poisNearNode(graph, pois, 'a', { maxMinutes: 3, mode: 'fastest' });
  assert.deepEqual(near.map((r) => r.poi.id), ['p1', 'p3']); // both at B (2 min); C excluded
});

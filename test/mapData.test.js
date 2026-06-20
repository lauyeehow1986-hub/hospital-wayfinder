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

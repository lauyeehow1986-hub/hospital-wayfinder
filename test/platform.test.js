import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addRecent } from '../js/platform.js';

test('addRecent prepends new id', () => {
  assert.deepEqual(addRecent(['b', 'c'], 'a'), ['a', 'b', 'c']);
});

test('addRecent dedupes and moves existing id to front', () => {
  assert.deepEqual(addRecent(['a', 'b', 'c'], 'c'), ['c', 'a', 'b']);
});

test('addRecent caps the list length', () => {
  assert.deepEqual(addRecent(['a', 'b', 'c', 'd', 'e'], 'f', 5), ['f', 'a', 'b', 'c', 'd']);
});

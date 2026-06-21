import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideLimit, LIMITS } from '../bot/src/ratelimit.js';

test('decideLimit allows under the limits', () => {
  assert.equal(decideLimit({ userCount: 0, globalCount: 0 }, LIMITS).allowed, true);
});

test('decideLimit blocks at the per-user cap', () => {
  const d = decideLimit({ userCount: LIMITS.perUserDaily, globalCount: 0 }, LIMITS);
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'user');
});

test('decideLimit blocks at the global cap first', () => {
  const d = decideLimit({ userCount: 0, globalCount: LIMITS.globalDaily }, LIMITS);
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'global');
});

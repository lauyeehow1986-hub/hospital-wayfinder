import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, findRoute } from '../js/wayfinding.js';
import {
  PATH_TYPE_META,
  CATEGORY_META,
  modeToOpts,
  routeToRows,
  comfortSegments,
  poiRow,
} from '../js/render.js';

// --- meta maps + modeToOpts ----------------------------------------------

test('PATH_TYPE_META covers all four path types with colour + label', () => {
  for (const t of ['indoor', 'outdoor', 'underground', 'sheltered']) {
    assert.ok(PATH_TYPE_META[t], `missing ${t}`);
    assert.match(PATH_TYPE_META[t].color, /^#[0-9a-f]{6}$/i);
    assert.ok(PATH_TYPE_META[t].label.length > 0);
  }
});

test('CATEGORY_META covers the POI categories', () => {
  for (const c of ['food', 'toilet', 'charging', 'rest_area', 'convenience', 'atm', 'pharmacy', 'water']) {
    assert.ok(CATEGORY_META[c], `missing ${c}`);
    assert.ok(CATEGORY_META[c].label.length > 0);
  }
});

test('modeToOpts maps the three UI modes to routing options', () => {
  assert.deepEqual(modeToOpts('fastest'), { mode: 'fastest', accessibleOnly: false });
  assert.deepEqual(modeToOpts('sheltered'), { mode: 'sheltered', accessibleOnly: false });
  assert.deepEqual(modeToOpts('step-free'), { mode: 'sheltered', accessibleOnly: true });
  assert.deepEqual(modeToOpts('anything-else'), { mode: 'sheltered', accessibleOnly: false });
});

// --- routeToRows ----------------------------------------------------------

const g = buildGraph(
  [{ id: 'a', label: 'A lobby' }, { id: 'b', label: 'B junction' }, { id: 'c', label: 'C clinic' }],
  [
    { id: 'e1', from: 'a', to: 'b', path_type: 'indoor', walk_time_minutes: 2, accessible: true, notes: 'Air-con' },
    { id: 'e2', from: 'b', to: 'c', path_type: 'underground', walk_time_minutes: 3, accessible: true, notes: '' },
  ],
);

test('routeToRows builds start, step, end rows with edge detail', () => {
  const rows = routeToRows(g, findRoute(g, 'a', 'c', { mode: 'fastest' }));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.kind), ['start', 'step', 'end']);
  assert.equal(rows[0].label, 'A lobby');
  assert.equal(rows[1].label, 'B junction');
  assert.equal(rows[1].pathType, 'indoor');
  assert.equal(rows[1].minutes, 2);
  assert.equal(rows[1].notes, 'Air-con');
  assert.equal(rows[2].label, 'C clinic');
  assert.equal(rows[2].pathType, 'underground');
});

test('routeToRows returns [] for a null result', () => {
  assert.deepEqual(routeToRows(g, null), []);
});

// --- comfortSegments ------------------------------------------------------

test('comfortSegments maps byTypePct to coloured segments, largest first', () => {
  const segs = comfortSegments({ byTypePct: { indoor: 60, underground: 30, sheltered: 10 } });
  assert.deepEqual(segs.map((s) => s.pathType), ['indoor', 'underground', 'sheltered']);
  assert.equal(segs[0].pct, 60);
  assert.equal(segs[0].color, PATH_TYPE_META.indoor.color);
});

test('comfortSegments returns [] when there is no summary', () => {
  assert.deepEqual(comfortSegments(null), []);
});

// --- poiRow ---------------------------------------------------------------

test('poiRow formats a food POI with price tier badge', () => {
  const row = poiRow({ name: 'Kopitiam', category: 'food', attributes: { price_tier: 1 } }, 4);
  assert.equal(row.name, 'Kopitiam');
  assert.equal(row.minutes, 4);
  assert.ok(row.badges.includes('$'));
});

test('poiRow adds accessible and 24h badges', () => {
  const row = poiRow({ name: 'Toilet', category: 'toilet', attributes: { accessible: true, open_24h: true } }, 2);
  assert.ok(row.badges.includes('accessible'));
  assert.ok(row.badges.includes('24h'));
});

test('poiRow falls back gracefully for unknown category', () => {
  const row = poiRow({ name: 'Mystery', category: 'zzz', attributes: {} }, 1);
  assert.equal(row.name, 'Mystery');
  assert.deepEqual(row.badges, []);
});

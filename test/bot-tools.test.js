import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../js/wayfinding.js';
import { indexById } from '../js/mapData.js';
import { TOOL_DEFS, dispatchTool } from '../bot/src/tools.js';

const nodes = [
  { id: 'a', label: 'A lobby', building: 'X', level: 1, x: 0, y: 0 },
  { id: 'b', label: 'B clinic', building: 'X', level: 1, x: 10, y: 0 },
];
const edges = [{ id: 'e1', from: 'a', to: 'b', path_type: 'indoor', walk_time_minutes: 3, accessible: true }];
const pois = [{ id: 'p1', name: 'Toilet near B', category: 'toilet', node: 'b' }];
const ctx = { graph: buildGraph(nodes, edges), nodes, pois, nodeIndex: indexById(nodes) };

test('TOOL_DEFS lists the expected tools', () => {
  const names = TOOL_DEFS.map((t) => t.name);
  for (const n of ['search_nodes', 'find_route', 'nearest_place', 'places_near', 'record_feedback']) {
    assert.ok(names.includes(n), `missing ${n}`);
  }
});

test('search_nodes resolves a name to nodes', () => {
  const out = dispatchTool('search_nodes', { query: 'A lobby' }, ctx);
  assert.equal(JSON.parse(out.content)[0].id, 'a');
});

test('find_route returns a summary and steps', () => {
  const out = dispatchTool('find_route', { from: 'a', to: 'b', mode: 'fastest' }, ctx);
  const parsed = JSON.parse(out.content);
  assert.match(parsed.summary, /min/);
  assert.equal(parsed.steps.length, 1);
});

test('nearest_place finds a category', () => {
  const out = dispatchTool('nearest_place', { from: 'a', category: 'toilet' }, ctx);
  assert.equal(JSON.parse(out.content).name, 'Toilet near B');
});

test('record_feedback returns a feedback object', () => {
  const out = dispatchTool('record_feedback', { detail: 'linkway closed', severity: 'high' }, ctx);
  assert.ok(out.feedback);
  assert.equal(out.feedback.detail, 'linkway closed');
});

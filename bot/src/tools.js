// Claude tool definitions + pure dispatch over the routing modules. No SDK import,
// so this is unit-testable at the repo root without bot dependencies installed.
import { findRoute, summarizeRoute } from '../../js/wayfinding.js';
import { searchNodes } from '../../js/mapData.js';
import { nearestPoi, poisNearNode } from '../../js/places.js';
import { modeToOpts } from '../../js/render.js';

export const TOOL_DEFS = [
  {
    name: 'search_nodes',
    description: 'Find hospital landmarks/locations by name. Returns matching node ids + labels. Call this first to turn a place name into a node id.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Place name, e.g. "NHCS lobby"' } }, required: ['query'] },
  },
  {
    name: 'find_route',
    description: 'Walking route between two node ids. mode: "fastest", "sheltered" (prefers indoor/sheltered), or "step-free" (wheelchair accessible). Returns a summary + steps.',
    input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, mode: { type: 'string', enum: ['fastest', 'sheltered', 'step-free'] } }, required: ['from', 'to'] },
  },
  {
    name: 'nearest_place',
    description: 'Nearest place of interest of a category from a node id. category: food, toilet, charging, rest_area, convenience, atm, pharmacy, water, info.',
    input_schema: { type: 'object', properties: { from: { type: 'string' }, category: { type: 'string' } }, required: ['from', 'category'] },
  },
  {
    name: 'places_near',
    description: 'List places of interest within walking distance (minutes) of a node id.',
    input_schema: { type: 'object', properties: { node: { type: 'string' }, maxMinutes: { type: 'number' } }, required: ['node'] },
  },
  {
    name: 'record_feedback',
    description: 'Record a user-reported problem (a route is wrong/closed, a place moved/closed). Use when the user reports an issue rather than asks a question.',
    input_schema: { type: 'object', properties: { category: { type: 'string' }, location: { type: 'string' }, detail: { type: 'string' }, severity: { type: 'string', enum: ['low', 'medium', 'high'] } }, required: ['detail'] },
  },
];

const labelOf = (nodeIndex, id) => (nodeIndex.get(id) ? nodeIndex.get(id).label : id);

// Returns { content: string, feedback?: object }. record_feedback surfaces a
// feedback object for the Worker to act on; everything else is read-only.
export function dispatchTool(name, input, ctx) {
  const { graph, nodes, pois, nodeIndex } = ctx;
  if (name === 'search_nodes') {
    const matches = searchNodes(nodes, input.query || '').slice(0, 5)
      .map((n) => ({ id: n.id, label: n.label, building: n.building, level: n.level }));
    return { content: JSON.stringify(matches) };
  }
  if (name === 'find_route') {
    const result = findRoute(graph, input.from, input.to, modeToOpts(input.mode || 'sheltered'));
    if (!result) return { content: 'No route found between those nodes.' };
    const summary = summarizeRoute(result);
    const steps = result.edges.map((e, i) => `${i + 1}. ${e.path_type} to ${labelOf(nodeIndex, result.path[i + 1])} (${e.walk_time_minutes} min)`);
    return { content: JSON.stringify({ summary: summary.text, from: labelOf(nodeIndex, result.path[0]), to: labelOf(nodeIndex, result.path[result.path.length - 1]), steps }) };
  }
  if (name === 'nearest_place') {
    const best = nearestPoi(graph, pois, input.from, { category: input.category, mode: 'sheltered' });
    if (!best) return { content: 'Nothing of that category is reachable from there.' };
    return { content: JSON.stringify({ name: best.poi.name, minutes: best.route.totalMinutes, node: best.poi.node }) };
  }
  if (name === 'places_near') {
    const list = poisNearNode(graph, pois, input.node, { maxMinutes: input.maxMinutes ?? 10 })
      .map((r) => ({ name: r.poi.name, category: r.poi.category, minutes: r.minutes }));
    return { content: JSON.stringify(list) };
  }
  if (name === 'record_feedback') {
    return {
      content: 'Thanks — your report has been recorded and passed to the maintainer.',
      feedback: { category: input.category || 'general', location: input.location || '', detail: input.detail || '', severity: input.severity || 'medium' },
    };
  }
  return { content: `Unknown tool: ${name}` };
}

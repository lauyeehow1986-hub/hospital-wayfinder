// Points-of-interest queries. POIs are node-anchored, so "nearest" reuses the
// router. Pure module, no DOM.
import { findRoute } from './wayfinding.js';

// Filter POIs by category.
export function poisByCategory(pois, category) {
  return pois.filter((p) => p.category === category);
}

// Nearest POI (by comfort-weighted walk time) reachable from a node.
// opts: { category, accessibleOnly, mode }. Returns { poi, route } or null.
export function nearestPoi(graph, pois, fromId, opts = {}) {
  const candidates = opts.category ? poisByCategory(pois, opts.category) : pois;
  let best = null;
  for (const poi of candidates) {
    const route = findRoute(graph, fromId, poi.node, {
      mode: opts.mode || 'sheltered',
      accessibleOnly: opts.accessibleOnly || false,
    });
    if (!route) continue;
    if (!best || route.totalMinutes < best.route.totalMinutes) best = { poi, route };
  }
  return best;
}

// All POIs reachable within maxMinutes of a node, sorted nearest first.
// opts: { maxMinutes, mode }.
export function poisNearNode(graph, pois, nodeId, opts = {}) {
  const maxMinutes = opts.maxMinutes ?? Infinity;
  const results = [];
  for (const poi of pois) {
    const route = findRoute(graph, nodeId, poi.node, { mode: opts.mode || 'sheltered' });
    if (route && route.totalMinutes <= maxMinutes) results.push({ poi, minutes: route.totalMinutes });
  }
  return results.sort((a, b) => a.minutes - b.minutes);
}

// Pure routing core — no DOM, importable in both Node (tests) and the browser.

// Comfort multipliers per routing mode, keyed by edge.path_type.
// "fastest" = pure walk time; "sheltered" penalises exposed outdoor walking.
export const COMFORT_WEIGHTS = {
  fastest: { indoor: 1, sheltered: 1, underground: 1, outdoor: 1 },
  sheltered: { indoor: 1, sheltered: 1.1, underground: 1.2, outdoor: 3 },
};

// Build an adjacency map from node + edge records.
// Edges are bidirectional unless edge.oneway === true.
export function buildGraph(nodes, edges) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    if (!adj.has(edge.from) || !adj.has(edge.to)) {
      throw new Error(`Edge ${edge.id} references unknown node (${edge.from} -> ${edge.to})`);
    }
    adj.get(edge.from).push({ to: edge.to, edge });
    if (!edge.oneway) {
      adj.get(edge.to).push({ to: edge.from, edge });
    }
  }
  return { nodes: nodeMap, adj };
}

// Dijkstra shortest path by comfort-weighted cost.
// opts: { mode = 'sheltered', accessibleOnly = false }
// Returns { path: [nodeId...], edges: [edge...], totalMinutes } or null.
export function findRoute(graph, fromId, toId, opts = {}) {
  const mode = opts.mode || 'sheltered';
  const accessibleOnly = opts.accessibleOnly || false;
  const weights = COMFORT_WEIGHTS[mode] || COMFORT_WEIGHTS.sheltered;
  if (!graph.nodes.has(fromId) || !graph.nodes.has(toId)) return null;
  if (fromId === toId) return { path: [fromId], edges: [], totalMinutes: 0 };

  const dist = new Map([[fromId, 0]]);
  const prev = new Map();
  const visited = new Set();
  const frontier = new Set([fromId]);

  while (frontier.size) {
    let u = null;
    let best = Infinity;
    for (const id of frontier) {
      const d = dist.get(id);
      if (d < best) {
        best = d;
        u = id;
      }
    }
    frontier.delete(u);
    if (u === toId) break;
    if (visited.has(u)) continue;
    visited.add(u);

    for (const { to, edge } of graph.adj.get(u)) {
      if (visited.has(to)) continue;
      if (accessibleOnly && edge.accessible === false) continue;
      const w = weights[edge.path_type] ?? 1;
      const cost = dist.get(u) + edge.walk_time_minutes * w;
      if (cost < (dist.get(to) ?? Infinity)) {
        dist.set(to, cost);
        prev.set(to, { from: u, edge });
        frontier.add(to);
      }
    }
  }

  if (!prev.has(toId)) return null;

  const path = [toId];
  const edgesUsed = [];
  let totalMinutes = 0;
  let cur = toId;
  while (cur !== fromId) {
    const step = prev.get(cur);
    edgesUsed.unshift(step.edge);
    totalMinutes += step.edge.walk_time_minutes;
    path.unshift(step.from);
    cur = step.from;
  }
  return { path, edges: edgesUsed, totalMinutes };
}

// Summarise a route result into human-readable stats.
export function summarizeRoute(result) {
  if (!result) return null;
  const { edges, totalMinutes } = result;
  const byTypeMinutes = {};
  let undergroundLinks = 0;
  let accessible = true;
  for (const e of edges) {
    byTypeMinutes[e.path_type] = (byTypeMinutes[e.path_type] || 0) + e.walk_time_minutes;
    if (e.path_type === 'underground') undergroundLinks += 1;
    if (e.accessible === false) accessible = false;
  }
  const byTypePct = {};
  for (const [t, m] of Object.entries(byTypeMinutes)) {
    byTypePct[t] = totalMinutes ? Math.round((m / totalMinutes) * 100) : 0;
  }
  const parts = [`${totalMinutes} min`];
  const dominant = Object.entries(byTypePct).sort((a, b) => b[1] - a[1])[0];
  if (dominant) parts.push(`${dominant[1]}% ${dominant[0]}`);
  if (undergroundLinks) {
    parts.push(`${undergroundLinks} underground link${undergroundLinks > 1 ? 's' : ''}`);
  }
  parts.push(accessible ? 'wheelchair accessible' : 'not step-free');
  return { totalMinutes, byTypePct, undergroundLinks, accessible, text: parts.join(' · ') };
}

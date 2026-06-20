// Pure geometry for the schematic floor map. No DOM.

// Unique levels present, descending (upper floors first).
export function levelsPresent(nodes) {
  return [...new Set(nodes.map((n) => n.level))].sort((a, b) => b - a);
}

export function levelLabel(level) {
  if (level === 0) return 'G';
  return level > 0 ? `L${level}` : `B${-level}`;
}

// Nodes on a level that have numeric coordinates.
export function nodesOnLevel(nodes, level) {
  return nodes.filter((n) => n.level === level && typeof n.x === 'number' && typeof n.y === 'number');
}

// Edges whose both endpoints are on the given level.
export function edgesOnLevel(edges, level, nodeById) {
  return edges.filter((e) => {
    const a = nodeById.get(e.from);
    const b = nodeById.get(e.to);
    return a && b && a.level === level && b.level === level;
  });
}

// One bounding box per building from a set of (on-level, coord-bearing) nodes.
export function buildingZones(levelNodes) {
  const byBuilding = new Map();
  for (const n of levelNodes) {
    const key = n.building || '?';
    const z = byBuilding.get(key) || { building: key, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    z.minX = Math.min(z.minX, n.x);
    z.minY = Math.min(z.minY, n.y);
    z.maxX = Math.max(z.maxX, n.x);
    z.maxY = Math.max(z.maxY, n.y);
    byBuilding.set(key, z);
  }
  return [...byBuilding.values()];
}

function bounds(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

// Map data coords into a width×height box (aspect-preserved, centered).
export function fitTransform(points, width, height, pad = 10) {
  if (!points.length) return { scale: 1, offsetX: pad, offsetY: pad };
  const b = bounds(points);
  const dx = b.maxX - b.minX;
  const dy = b.maxY - b.minY;
  const sx = dx > 0 ? (width - 2 * pad) / dx : Infinity;
  const sy = dy > 0 ? (height - 2 * pad) / dy : Infinity;
  let scale = Math.min(sx, sy);
  if (!Number.isFinite(scale)) scale = 1;
  const offsetX = pad + (width - 2 * pad - dx * scale) / 2 - b.minX * scale;
  const offsetY = pad + (height - 2 * pad - dy * scale) / 2 - b.minY * scale;
  return { scale, offsetX, offsetY };
}

export function project(point, t) {
  return { x: point.x * t.scale + t.offsetX, y: point.y * t.scale + t.offsetY };
}

// Split a route into per-level geometry, plus the cross-level transitions.
// Returns { byLevel: { [level]: { segments, nodes } }, changes: [...] }.
export function routeByLevel(graph, result) {
  const byLevel = {};
  const changes = [];
  if (!result) return { byLevel, changes };
  const at = (id) => graph.nodes.get(id);
  const ensure = (lvl) => (byLevel[lvl] || (byLevel[lvl] = { segments: [], nodes: [] }));
  const path = result.path;

  path.forEach((id, i) => {
    const n = at(id);
    if (!n || typeof n.x !== 'number' || typeof n.y !== 'number') return;
    const role = i === 0 ? 'start' : i === path.length - 1 ? 'end' : 'via';
    ensure(n.level).nodes.push({ id, x: n.x, y: n.y, role });
  });

  result.edges.forEach((edge, i) => {
    const a = at(path[i]);
    const b = at(path[i + 1]);
    if (!a || !b) return;
    if (a.level === b.level) {
      if (typeof a.x === 'number' && typeof b.x === 'number') {
        ensure(a.level).segments.push({ fromId: a.id, toId: b.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, pathType: edge.path_type });
      }
    } else {
      changes.push({ atNodeId: a.id, nextNodeId: b.id, fromLevel: a.level, toLevel: b.level, direction: b.level < a.level ? 'down' : 'up' });
    }
  });

  return { byLevel, changes };
}

// The handoff markers to draw on a level: only DEPARTURES (where the route
// leaves this level), so a marker never lands on an arrival/destination pin.
export function handoffsForLevel(changes, level) {
  return changes
    .filter((c) => c.fromLevel === level)
    .map((c) => ({ atNodeId: c.atNodeId, toLevel: c.toLevel, direction: c.direction }));
}

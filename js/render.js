// Pure presentation helpers — no DOM. Shared by app.js (browser) and tests (Node).

export const PATH_TYPE_META = {
  indoor: { color: '#2563eb', icon: 'building', label: 'Indoor' },
  sheltered: { color: '#16a34a', icon: 'umbrella', label: 'Sheltered' },
  underground: { color: '#7c3aed', icon: 'stairs-down', label: 'Underground' },
  outdoor: { color: '#d97706', icon: 'sun', label: 'Outdoor' },
};

export const CATEGORY_META = {
  food: { icon: 'food', label: 'Food' },
  toilet: { icon: 'toilet', label: 'Toilet' },
  charging: { icon: 'plug', label: 'Charging' },
  rest_area: { icon: 'seat', label: 'Rest area' },
  convenience: { icon: 'store', label: 'Convenience' },
  atm: { icon: 'cash', label: 'ATM' },
  pharmacy: { icon: 'pill', label: 'Pharmacy' },
  water: { icon: 'droplet', label: 'Water' },
  info: { icon: 'info', label: 'Info' },
};

// Map a UI mode name to wayfinding.findRoute options.
export function modeToOpts(modeName) {
  if (modeName === 'fastest') return { mode: 'fastest', accessibleOnly: false };
  if (modeName === 'step-free') return { mode: 'sheltered', accessibleOnly: true };
  return { mode: 'sheltered', accessibleOnly: false };
}

// Turn a findRoute() result into ordered display rows.
// row: { kind: 'start'|'step'|'end', label, pathType?, minutes?, notes?, accessible? }
export function routeToRows(graph, result) {
  if (!result) return [];
  const labelOf = (id) => (graph.nodes.get(id) ? graph.nodes.get(id).label : id);
  const rows = [{ kind: 'start', label: labelOf(result.path[0]) }];
  result.edges.forEach((edge, i) => {
    const toId = result.path[i + 1];
    const last = i === result.edges.length - 1;
    rows.push({
      kind: last ? 'end' : 'step',
      label: labelOf(toId),
      pathType: edge.path_type,
      minutes: edge.walk_time_minutes,
      notes: edge.notes || '',
      accessible: edge.accessible !== false,
    });
  });
  return rows;
}

// Turn a summarizeRoute() summary into sized, coloured bar segments.
export function comfortSegments(summary) {
  if (!summary || !summary.byTypePct) return [];
  return Object.entries(summary.byTypePct)
    .map(([pathType, pct]) => ({
      pathType,
      pct,
      color: PATH_TYPE_META[pathType] ? PATH_TYPE_META[pathType].color : '#5b727c',
    }))
    .sort((a, b) => b.pct - a.pct);
}

// Format a POI + walk time into a display row.
export function poiRow(poi, minutes) {
  const meta = CATEGORY_META[poi.category] || { icon: 'pin', label: poi.category };
  const attrs = poi.attributes || {};
  const badges = [];
  if (poi.category === 'food' && attrs.price_tier) badges.push('$'.repeat(attrs.price_tier));
  if (attrs.accessible === true) badges.push('accessible');
  if (attrs.open_24h === true) badges.push('24h');
  return { icon: meta.icon, category: meta.label, name: poi.name, minutes, badges };
}

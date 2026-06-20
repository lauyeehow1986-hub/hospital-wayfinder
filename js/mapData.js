// Pure data-access helpers over node/edge/POI record lists. No DOM.

// Index any record list by its `id` field.
export function indexById(records) {
  return new Map(records.map((r) => [r.id, r]));
}

// Search nodes by label / aliases (case-insensitive), best matches first.
export function searchNodes(nodes, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const n of nodes) {
    const label = n.label.toLowerCase();
    const aliases = (n.aliases || []).map((a) => a.toLowerCase());
    let score = -1;
    if (label === q) score = 100;
    else if (label.startsWith(q)) score = 80;
    else if (label.includes(q)) score = 60;
    else if (aliases.some((a) => a.includes(q))) score = 40;
    if (score >= 0) scored.push({ node: n, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.node);
}

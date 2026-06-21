// Load + cache the route graph from raw GitHub so edits go live without redeploy.
import { buildGraph } from '../../js/wayfinding.js';
import { indexById } from '../../js/mapData.js';

const RAW = 'https://raw.githubusercontent.com/lauyeehow1986-hub/hospital-wayfinder/main/data';
const TTL_MS = 5 * 60 * 1000;
let cache = null;
let cachedAt = 0;

export async function loadGraph() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const [nodes, edges, pois] = await Promise.all([
    fetch(`${RAW}/nodes.json`).then((r) => r.json()),
    fetch(`${RAW}/edges.json`).then((r) => r.json()),
    fetch(`${RAW}/pois.json`).then((r) => r.json()),
  ]);
  cache = { graph: buildGraph(nodes, edges), nodes, pois, nodeIndex: indexById(nodes) };
  cachedAt = Date.now();
  return cache;
}

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Validate a route graph + POIs. Returns { errors, warnings, ok }.
export function validateGraph({ nodes, edges, pois = [] }) {
  const errors = [];
  const warnings = [];

  const nodeIds = new Set();
  for (const n of nodes) {
    if (nodeIds.has(n.id)) errors.push(`Duplicate node id: ${n.id}`);
    nodeIds.add(n.id);
    if (!n.label) errors.push(`Node ${n.id} missing label`);
    if (typeof n.x !== 'number' || typeof n.y !== 'number') {
      warnings.push(`Node ${n.id} missing x/y (not on floor map)`);
    }
  }

  const edgeIds = new Set();
  for (const e of edges) {
    if (edgeIds.has(e.id)) errors.push(`Duplicate edge id: ${e.id}`);
    edgeIds.add(e.id);
    if (!nodeIds.has(e.from)) errors.push(`Edge ${e.id} from-node not found: ${e.from}`);
    if (!nodeIds.has(e.to)) errors.push(`Edge ${e.id} to-node not found: ${e.to}`);
    if (typeof e.walk_time_minutes !== 'number' || e.walk_time_minutes <= 0) {
      errors.push(`Edge ${e.id} invalid walk_time_minutes`);
    }
    if (!e.last_verified) warnings.push(`Edge ${e.id} missing last_verified`);
  }

  for (const p of pois) {
    if (!nodeIds.has(p.node)) errors.push(`POI ${p.id} references unknown node: ${p.node}`);
  }

  return { errors, warnings, ok: errors.length === 0 };
}

// CLI: validate the files in data/ and exit non-zero on error.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = async (f) => JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url), 'utf8'));
  const [nodes, edges, pois] = await Promise.all([read('nodes.json'), read('edges.json'), read('pois.json')]);
  const { errors, warnings, ok } = validateGraph({ nodes, edges, pois });
  warnings.forEach((w) => console.warn('WARN:', w));
  errors.forEach((e) => console.error('ERROR:', e));
  console.log(ok
    ? `OK: ${nodes.length} nodes, ${edges.length} edges, ${pois.length} POIs`
    : `FAILED: ${errors.length} error(s)`);
  process.exit(ok ? 0 : 1);
}

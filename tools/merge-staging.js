import { readFile, writeFile, readdir, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateGraph } from './validate-graph.js';

// Kebab-case id from a label, de-duplicated against existing ids.
export function slugifyId(label, existingIds = []) {
  const base = String(label).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'node';
  const set = new Set(existingIds);
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

// Convert staged waypoint records into new node + edge records.
export function stagedToGraph(staged, nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const addedNodes = [];
  const addedEdges = [];
  let maxEdge = edges.reduce((m, e) => Math.max(m, parseInt(String(e.id).replace(/^e-/, ''), 10) || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  for (const rec of staged) {
    const n = rec.node || {};
    const id = slugifyId(n.label, ids);
    ids.push(id);
    const node = {
      id, label: n.label, aliases: n.aliases || [], building: n.building,
      level: n.level, lat: n.lat ?? null, lng: n.lng ?? null, type: n.type || 'landmark',
    };
    if (typeof n.x === 'number' && typeof n.y === 'number') { node.x = n.x; node.y = n.y; }
    addedNodes.push(node);
    for (const e of rec.edges || []) {
      maxEdge += 1;
      addedEdges.push({
        id: `e-${String(maxEdge).padStart(3, '0')}`, from: id, to: e.to,
        path_type: e.path_type, walk_time_minutes: e.walk_time_minutes,
        accessible: e.accessible !== false, oneway: false, notes: e.notes || '', last_verified: today,
      });
    }
  }
  return { addedNodes, addedEdges };
}

// CLI: review (dry-run) or apply the staging files into data/.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes('--apply');
  const root = new URL('../', import.meta.url);
  const dataUrl = (f) => new URL(`data/${f}`, root);
  const stagingDir = new URL('ingestion/staging/', root);
  const nodes = JSON.parse(await readFile(dataUrl('nodes.json'), 'utf8'));
  const edges = JSON.parse(await readFile(dataUrl('edges.json'), 'utf8'));
  const pois = JSON.parse(await readFile(dataUrl('pois.json'), 'utf8'));

  let files = [];
  try {
    files = (await readdir(stagingDir)).filter((f) => f.startsWith('session-') && f.endsWith('.json'));
  } catch { /* no staging dir */ }
  if (!files.length) { console.log('No staging files in ingestion/staging/.'); process.exit(0); }

  const staged = [];
  for (const f of files) {
    const recs = JSON.parse(await readFile(new URL(f, stagingDir), 'utf8'));
    for (const r of (Array.isArray(recs) ? recs : [recs])) staged.push(r);
  }

  const { addedNodes, addedEdges } = stagedToGraph(staged, nodes, edges);
  const mergedNodes = [...nodes, ...addedNodes];
  const mergedEdges = [...edges, ...addedEdges];
  const { errors, warnings, ok } = validateGraph({ nodes: mergedNodes, edges: mergedEdges, pois });

  console.log(`Staging: ${files.length} file(s), ${staged.length} waypoint(s) -> +${addedNodes.length} nodes, +${addedEdges.length} edges`);
  warnings.forEach((w) => console.warn('WARN:', w));
  errors.forEach((e) => console.error('ERROR:', e));

  if (!apply) {
    console.log(ok ? 'Dry run OK. Re-run with --apply to write.' : 'Dry run FAILED — fix errors before applying.');
    process.exit(ok ? 0 : 1);
  }
  if (!ok) { console.error('Refusing to apply: validation errors.'); process.exit(1); }

  await writeFile(dataUrl('nodes.json'), `${JSON.stringify(mergedNodes, null, 2)}\n`);
  await writeFile(dataUrl('edges.json'), `${JSON.stringify(mergedEdges, null, 2)}\n`);
  const mergedDir = new URL('ingestion/staging/merged/', root);
  await mkdir(mergedDir, { recursive: true });
  for (const f of files) await rename(new URL(f, stagingDir), new URL(f, mergedDir));
  console.log(`Applied: ${mergedNodes.length} nodes, ${mergedEdges.length} edges. Archived ${files.length} staging file(s).`);
}

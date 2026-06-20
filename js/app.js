import { buildGraph, findRoute, summarizeRoute } from './wayfinding.js';
import { indexById, searchNodes } from './mapData.js';
import { poisNearNode } from './places.js';
import { PATH_TYPE_META, CATEGORY_META, modeToOpts, routeToRows, comfortSegments, poiRow } from './render.js';
import { levelsPresent, levelLabel, nodesOnLevel, edgesOnLevel, buildingZones, fitTransform, project, routeByLevel, handoffsForLevel } from './mapView.js';
import { getPrefs, savePrefs, getRecent, pushRecent } from './platform.js';
import './pwa.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { fromId: null, toId: null, mode: 'sheltered', nearbyRef: null, nearbyCat: 'all', routeView: 'map' };
let graph = null;
let nodes = [];
let pois = [];
let nodeIndex = new Map();
let edges = [];
let lastRoute = null;
const MAP_W = 340;
const MAP_H = 300;
const MAP_PAD = 26;

async function init() {
  applyPrefs(getPrefs());
  try {
    const [n, e, p] = await Promise.all([
      fetch('data/nodes.json').then((r) => r.json()),
      fetch('data/edges.json').then((r) => r.json()),
      fetch('data/pois.json').then((r) => r.json()),
    ]);
    nodes = n;
    pois = p;
    edges = e;
    graph = buildGraph(n, e);
    nodeIndex = indexById(n);
  } catch {
    $('#route-result').innerHTML = '<p class="msg">Connect once to download maps for offline use.</p>';
    return;
  }
  wireTabs();
  wireSearch('#from-input', '#from-suggest', (id) => { state.fromId = id; renderRoute(); });
  wireSearch('#to-input', '#to-suggest', (id) => { state.toId = id; pushRecent(id); renderRoute(); });
  wireSearch('#nearby-input', '#nearby-suggest', (id) => { state.nearbyRef = id; renderNearby(); });
  wireModePills();
  wireSwap();
  wireNearbyCats();
  wireA11y();
  renderFromChips();
}

function applyPrefs(p) {
  document.documentElement.dataset.contrast = p.contrast === 'high' ? 'high' : '';
  document.documentElement.dataset.text = p.text === 'large' ? 'large' : '';
}

function wireTabs() {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      document.querySelectorAll('.tab-panel').forEach((s) => { s.hidden = s.id !== `tab-${tab}`; });
      if (tab === 'nearby') renderNearby();
    });
  });
}

function wireSearch(inputSel, suggestSel, onPick) {
  const input = $(inputSel);
  const box = $(suggestSel);
  input.addEventListener('input', () => {
    const matches = searchNodes(nodes, input.value).slice(0, 6);
    if (!matches.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = matches.map((n) => `<li role="option" data-id="${esc(n.id)}">${esc(n.label)}</li>`).join('');
    box.hidden = false;
  });
  box.addEventListener('click', (ev) => {
    const li = ev.target.closest('li[data-id]');
    if (!li) return;
    const node = nodeIndex.get(li.dataset.id);
    input.value = node.label;
    box.hidden = true;
    onPick(node.id);
  });
}

function wireModePills() {
  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      renderRoute();
    });
  });
}

function wireSwap() {
  $('#swap').addEventListener('click', () => {
    [state.fromId, state.toId] = [state.toId, state.fromId];
    $('#from-input').value = state.fromId ? nodeIndex.get(state.fromId).label : '';
    $('#to-input').value = state.toId ? nodeIndex.get(state.toId).label : '';
    renderRoute();
  });
}

function renderFromChips() {
  const presets = [
    { id: 'outram-mrt-exit', label: 'Outram MRT' },
    { id: 'nhcs-l1-entrance', label: 'Main entrance' },
  ].filter((c) => nodeIndex.has(c.id));
  const recents = getRecent().map((id) => nodeIndex.get(id)).filter(Boolean).slice(0, 3);
  const box = $('#from-chips');
  box.innerHTML = presets.map((c) => `<button class="chip" data-id="${esc(c.id)}">${esc(c.label)}</button>`).join('')
    + recents.map((n) => `<button class="chip" data-id="${esc(n.id)}">${esc(n.label)}</button>`).join('')
    + '<button class="chip" disabled>Scan QR (soon)</button>';
  box.querySelectorAll('button[data-id]').forEach((b) => b.addEventListener('click', () => {
    state.fromId = b.dataset.id;
    $('#from-input').value = nodeIndex.get(b.dataset.id).label;
    renderRoute();
  }));
}

function renderRoute() {
  const out = $('#route-result');
  if (!state.fromId || !state.toId) { out.innerHTML = ''; lastRoute = null; return; }
  if (state.fromId === state.toId) { out.innerHTML = '<p class="msg">You are already there.</p>'; lastRoute = null; return; }
  const result = findRoute(graph, state.fromId, state.toId, modeToOpts(state.mode));
  if (!result) { out.innerHTML = '<p class="msg">No route found — the map may be incomplete here. Try a nearby landmark.</p>'; lastRoute = null; return; }
  const summary = summarizeRoute(result);
  lastRoute = {
    result,
    summary,
    rows: routeToRows(graph, result),
    map: routeByLevel(graph, result),
    activeLevel: null,
  };
  out.innerHTML = `
    <div class="banner">${esc(summary.text)}</div>
    <div class="comfort" aria-hidden="true">${comfortSegments(summary).map((s) => `<span style="width:${s.pct}%;background:${s.color}"></span>`).join('')}</div>
    <div class="chips viewtoggle">
      <button class="chip" data-view="map" aria-pressed="${state.routeView !== 'steps'}">Map</button>
      <button class="chip" data-view="steps" aria-pressed="${state.routeView === 'steps'}">Steps</button>
    </div>
    <div id="route-view"></div>`;
  out.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    state.routeView = b.dataset.view;
    renderRouteView(state.routeView);
  }));
  renderRouteView(state.routeView);
}

function renderRouteView(view) {
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  const host = $('#route-view');
  if (view === 'steps') {
    host.innerHTML = `<ol class="steps">${lastRoute.rows.map(stepRowHTML).join('')}</ol>`;
    return;
  }
  const levels = levelsPresent(nodes);
  if (lastRoute.activeLevel == null) {
    const startNode = nodeIndex.get(state.fromId);
    lastRoute.activeLevel = startNode ? startNode.level : levels[0];
  }
  const switcher = levels.map((lvl) =>
    `<button class="chip lvl" data-level="${lvl}" aria-pressed="${lvl === lastRoute.activeLevel}">${esc(levelLabel(lvl))}</button>`
  ).join('');
  host.innerHTML = `<div class="chips levels">${switcher}</div><div class="mapwrap">${mapSVG(lastRoute.activeLevel)}</div>`;
  host.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => {
    lastRoute.activeLevel = Number(b.dataset.level);
    renderRouteView('map');
  }));
}

// An edge-aware text label: flips to the left of its anchor near the right edge
// so it never overflows the viewBox. White halo keeps it legible over lines.
function mapLabel(p, text, color) {
  const right = p.x > MAP_W * 0.6;
  const tx = right ? p.x - 12 : p.x + 12;
  const anchor = right ? 'end' : 'start';
  return `<text x="${tx.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" font-size="11" fill="${color}" text-anchor="${anchor}" paint-order="stroke" stroke="var(--surface)" stroke-width="3">${esc(text)}</text>`;
}

function mapSVG(level) {
  const levelNodes = nodesOnLevel(nodes, level);
  if (!levelNodes.length) return '<p class="msg">No map for this level.</p>';
  const t = fitTransform(levelNodes, MAP_W, MAP_H, MAP_PAD);
  const P = (p) => project(p, t);

  // Only draw zones for buildings that span an area (2+ nodes); single-node
  // buildings would be tiny boxes that just add clutter.
  const zones = buildingZones(levelNodes).filter((z) => z.maxX > z.minX || z.maxY > z.minY).map((z) => {
    const a = P({ x: z.minX, y: z.minY });
    const b = P({ x: z.maxX, y: z.maxY });
    const x = Math.min(a.x, b.x) - 12;
    const y = Math.min(a.y, b.y) - 12;
    const w = Math.abs(b.x - a.x) + 24;
    const h = Math.abs(b.y - a.y) + 24;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="12" fill="var(--primary-tint)" stroke="var(--border)"/><text x="${(x + 8).toFixed(1)}" y="${(y + 15).toFixed(1)}" font-size="10" fill="var(--muted)">${esc(z.building)}</text>`;
  }).join('');

  const corridors = edgesOnLevel(edges, level, nodeIndex).map((e) => {
    const a = P(nodeIndex.get(e.from));
    const b = P(nodeIndex.get(e.to));
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="var(--border)" stroke-width="2"/>`;
  }).join('');

  const lvlRoute = lastRoute.map.byLevel[level] || { segments: [], nodes: [] };
  const routeSegs = lvlRoute.segments.map((s) => {
    const a = P({ x: s.x1, y: s.y1 });
    const b = P({ x: s.x2, y: s.y2 });
    const color = (PATH_TYPE_META[s.pathType] || {}).color || '#5b727c';
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${color}" stroke-width="6" stroke-linecap="round"/>`;
  }).join('');

  // Departures only — never draws on top of an arrival/destination pin.
  const handoffList = handoffsForLevel(lastRoute.map.changes, level);
  const handoffIds = new Set(handoffList.map((h) => h.atNodeId));

  const pins = lvlRoute.nodes.map((n) => {
    const p = P(n);
    if (n.role === 'start') return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="8" fill="var(--primary)"/>${mapLabel(p, 'You are here', 'var(--text)')}`;
    if (n.role === 'end') return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="8" fill="#d4543e"/>${mapLabel(p, 'Destination', 'var(--text)')}`;
    if (handoffIds.has(n.id)) return ''; // a handoff marker is drawn at this node instead
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="var(--muted)"/>`;
  }).join('');

  const handoffs = handoffList.map((h) => {
    const node = nodeIndex.get(h.atNodeId);
    if (!node || typeof node.x !== 'number') return '';
    const p = P(node);
    const arrow = h.direction === 'down' ? '↓' : '↑';
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="10" fill="#7c3aed"/><text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" font-size="12" fill="#fff" text-anchor="middle">${arrow}</text>${mapLabel(p, `to ${levelLabel(h.toLevel)}`, '#7c3aed')}`;
  }).join('');

  const summary = lastRoute.summary ? lastRoute.summary.text : '';
  return `<svg viewBox="0 0 ${MAP_W} ${MAP_H}" width="100%" role="img" aria-label="${esc(summary)}">${zones}${corridors}${routeSegs}${pins}${handoffs}</svg>`;
}

function stepRowHTML(row) {
  if (row.kind === 'start') {
    return `<li class="step"><span class="dot dot-start"></span><div><strong>${esc(row.label)}</strong><br><span class="sub">Start</span></div></li>`;
  }
  const meta = PATH_TYPE_META[row.pathType] || { color: 'var(--muted)', label: row.pathType };
  const arrive = row.kind === 'end' ? ' (arrive)' : '';
  const note = row.notes ? ` · ${esc(row.notes)}` : '';
  return `<li class="step"><span class="dot" style="background:${meta.color}"></span><div><strong>${esc(row.label)}${arrive}</strong><br><span class="sub">${esc(meta.label)} · ${row.minutes} min${note}</span></div></li>`;
}

function wireNearbyCats() {
  const cats = ['all', ...Object.keys(CATEGORY_META)];
  const box = $('#nearby-cats');
  box.innerHTML = cats.map((c) => {
    const label = c === 'all' ? 'All' : CATEGORY_META[c].label;
    return `<button class="chip" data-cat="${esc(c)}" aria-pressed="${c === 'all'}">${esc(label)}</button>`;
  }).join('');
  box.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    state.nearbyCat = b.dataset.cat;
    box.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderNearby();
  }));
}

function renderNearby() {
  const out = $('#nearby-result');
  const refId = state.nearbyRef || state.toId;
  if (!refId || !nodeIndex.has(refId)) { out.innerHTML = '<p class="msg">Search a location to find what is nearby.</p>'; return; }
  let list = poisNearNode(graph, pois, refId, { mode: 'sheltered' });
  if (state.nearbyCat !== 'all') list = list.filter((r) => r.poi.category === state.nearbyCat);
  if (!list.length) { out.innerHTML = '<p class="msg">Nothing found nearby in this category.</p>'; return; }
  out.innerHTML = `<p class="ref">Near: <strong>${esc(nodeIndex.get(refId).label)}</strong></p>`
    + list.map((r) => {
      const row = poiRow(r.poi, r.minutes);
      const badges = row.badges.map((b) => `<span class="badge">${esc(b)}</span>`).join('');
      return `<div class="poi"><div class="poi-main"><span class="tag">${esc(row.category)}</span> <strong>${esc(row.name)}</strong>${badges}<br><span class="sub">${row.minutes} min walk</span></div><button class="route-here" data-id="${esc(r.poi.node)}">Route here</button></div>`;
    }).join('');
  out.querySelectorAll('.route-here').forEach((b) => b.addEventListener('click', () => {
    state.toId = b.dataset.id;
    pushRecent(b.dataset.id);
    $('#to-input').value = nodeIndex.get(b.dataset.id).label;
    document.querySelector('[data-tab="route"]').click();
    renderRoute();
  }));
}

function wireA11y() {
  const panel = $('#a11y-panel');
  $('#a11y-toggle').addEventListener('click', () => { panel.hidden = !panel.hidden; });
  const prefs = getPrefs();
  $('#pref-text').checked = prefs.text === 'large';
  $('#pref-contrast').checked = prefs.contrast === 'high';
  const update = () => {
    const p = { text: $('#pref-text').checked ? 'large' : 'normal', contrast: $('#pref-contrast').checked ? 'high' : 'normal' };
    savePrefs(p);
    applyPrefs(p);
  };
  $('#pref-text').addEventListener('change', update);
  $('#pref-contrast').addEventListener('change', update);
}

init();

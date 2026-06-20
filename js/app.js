import { buildGraph, findRoute, summarizeRoute } from './wayfinding.js';
import { indexById, searchNodes } from './mapData.js';
import { poisNearNode } from './places.js';
import { PATH_TYPE_META, CATEGORY_META, modeToOpts, routeToRows, comfortSegments, poiRow } from './render.js';
import { getPrefs, savePrefs, getRecent, pushRecent } from './platform.js';
import './pwa.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { fromId: null, toId: null, mode: 'sheltered', nearbyRef: null, nearbyCat: 'all' };
let graph = null;
let nodes = [];
let pois = [];
let nodeIndex = new Map();

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
  if (!state.fromId || !state.toId) { out.innerHTML = ''; return; }
  if (state.fromId === state.toId) { out.innerHTML = '<p class="msg">You are already there.</p>'; return; }
  const result = findRoute(graph, state.fromId, state.toId, modeToOpts(state.mode));
  if (!result) { out.innerHTML = '<p class="msg">No route found — the map may be incomplete here. Try a nearby landmark.</p>'; return; }
  const summary = summarizeRoute(result);
  const segs = comfortSegments(summary);
  const rows = routeToRows(graph, result);
  out.innerHTML = `
    <div class="banner">${esc(summary.text)}</div>
    <div class="comfort" aria-hidden="true">${segs.map((s) => `<span style="width:${s.pct}%;background:${s.color}"></span>`).join('')}</div>
    <ol class="steps">${rows.map(stepRowHTML).join('')}</ol>`;
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

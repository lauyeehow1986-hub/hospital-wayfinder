import { nodesOnLevel, buildingZones, fitTransform, project, unproject } from '../js/mapView.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAP_W = 320;
const MAP_H = 240;
const MAP_PAD = 22;

let nodes = [];
let placed = null;
let timerStart = null;

async function init() {
  nodes = await fetch('/data/nodes.json').then((r) => r.json());
  $('#nodelist').innerHTML = nodes.map((n) => `<option value="${esc(n.label)}">`).join('');
  $('#buildinglist').innerHTML = [...new Set(nodes.map((n) => n.building))].map((b) => `<option value="${esc(b)}">`).join('');
  $('#level').addEventListener('input', renderMap);
  $('#grab-gps').addEventListener('click', grabGps);
  $('#add-edge').addEventListener('click', addEdgeRow);
  $('#timer-start').addEventListener('click', () => { timerStart = Date.now(); $('#timer-out').textContent = 'timing…'; });
  $('#timer-stop').addEventListener('click', stopTimer);
  $('#save').addEventListener('click', save);
  addEdgeRow();
  renderMap();
}

function levelValue() { return Number($('#level').value || 1); }

function renderMap() {
  const level = levelValue();
  const coordNodes = nodes.filter((n) => typeof n.x === 'number' && typeof n.y === 'number');
  const t = fitTransform(coordNodes.length ? coordNodes : [{ x: 0, y: 0 }, { x: 100, y: 100 }], MAP_W, MAP_H, MAP_PAD);
  const P = (p) => project(p, t);
  const lvl = nodesOnLevel(nodes, level);
  const zones = buildingZones(lvl).filter((z) => z.maxX > z.minX || z.maxY > z.minY).map((z) => {
    const a = P({ x: z.minX, y: z.minY });
    const b = P({ x: z.maxX, y: z.maxY });
    const x = Math.min(a.x, b.x) - 10;
    const y = Math.min(a.y, b.y) - 10;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(Math.abs(b.x - a.x) + 20).toFixed(1)}" height="${(Math.abs(b.y - a.y) + 20).toFixed(1)}" rx="10" fill="#e6f4f2" stroke="#dce5e7"/>`;
  }).join('');
  const dots = lvl.map((n) => {
    const p = P(n);
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#5b727c"/><text x="${(p.x + 6).toFixed(1)}" y="${(p.y + 3).toFixed(1)}" font-size="9" fill="#5b727c">${esc(n.label)}</text>`;
  }).join('');
  const pin = placed ? (() => { const p = P(placed); return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="#0f9488" stroke="#fff" stroke-width="2"/>`; })() : '';
  $('#map').innerHTML = `<svg viewBox="0 0 ${MAP_W} ${MAP_H}" width="100%">${zones}${dots}${pin}</svg>`;
  const svg = $('#map svg');
  svg.addEventListener('click', (ev) => {
    const r = svg.getBoundingClientRect();
    const sx = (ev.clientX - r.left) * (MAP_W / r.width);
    const sy = (ev.clientY - r.top) * (MAP_H / r.height);
    const g = unproject({ x: sx, y: sy }, t);
    placed = { x: Math.round(g.x * 10) / 10, y: Math.round(g.y * 10) / 10 };
    renderMap();
  });
}

function stopTimer() {
  if (!timerStart) return;
  const mins = Math.max(1, Math.round((Date.now() - timerStart) / 60000));
  $('#timer-out').textContent = `${mins} min`;
  const walks = document.querySelectorAll('.edgerow [data-k="walk"]');
  if (walks.length) walks[walks.length - 1].value = mins;
  timerStart = null;
}

function grabGps() {
  const set = (lat, lng) => { $('#lat').value = lat; $('#lng').value = lng; $('#gps-out').textContent = `lat ${(+lat).toFixed(5)}, lng ${(+lng).toFixed(5)}`; };
  const viaServer = async () => {
    try { const g = await fetch('/gps').then((r) => r.json()); if (g.latitude) set(g.latitude, g.longitude); else $('#gps-out').textContent = 'no GPS fix'; } catch { $('#gps-out').textContent = 'no GPS'; }
  };
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => set(pos.coords.latitude, pos.coords.longitude), viaServer, { enableHighAccuracy: true, timeout: 15000 });
  } else { viaServer(); }
}

function addEdgeRow() {
  const div = document.createElement('div');
  div.className = 'edgerow';
  div.innerHTML = `
    <input list="nodelist" placeholder="connects to…" data-k="to">
    <select data-k="path_type"><option>indoor</option><option>sheltered</option><option>underground</option><option>outdoor</option></select>
    <input type="number" min="1" placeholder="walk min" data-k="walk">
    <label style="display:flex;align-items:center;gap:6px;color:#1a2b32"><input type="checkbox" data-k="acc" checked> accessible</label>
    <input placeholder="notes" data-k="notes" style="grid-column:1/3">`;
  $('#edges').appendChild(div);
}

async function save() {
  const node = {
    label: $('#label').value.trim(),
    building: $('#building').value.trim(),
    level: levelValue(),
    type: $('#type').value,
    aliases: $('#aliases').value.split(',').map((s) => s.trim()).filter(Boolean),
    lat: $('#lat').value ? Number($('#lat').value) : null,
    lng: $('#lng').value ? Number($('#lng').value) : null,
  };
  if (placed) { node.x = placed.x; node.y = placed.y; }
  if (!node.label || !node.building) { $('#status').textContent = 'Label and building are required.'; return; }
  const labelToId = new Map(nodes.map((n) => [n.label, n.id]));
  const edges = [...document.querySelectorAll('.edgerow')].map((row) => {
    const g = (k) => row.querySelector(`[data-k="${k}"]`);
    const toRaw = g('to').value.trim();
    return { to: labelToId.get(toRaw) || toRaw, path_type: g('path_type').value, walk_time_minutes: Number(g('walk').value) || 1, accessible: g('acc').checked, notes: g('notes').value.trim() };
  }).filter((e) => e.to);
  const res = await fetch('/waypoint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ node, edges }) }).then((r) => r.json()).catch(() => ({ error: 'network' }));
  if (res.ok) {
    $('#status').textContent = `Saved ✓ (${res.count} this session)`;
    nodes.push({ ...node, id: node.label });
    $('#nodelist').innerHTML = nodes.map((n) => `<option value="${esc(n.label)}">`).join('');
    $('#label').value = ''; $('#aliases').value = ''; $('#lat').value = ''; $('#lng').value = ''; $('#gps-out').textContent = ''; $('#timer-out').textContent = '';
    placed = null; $('#edges').innerHTML = ''; addEdgeRow(); renderMap();
  } else {
    $('#status').textContent = `Save failed: ${res.error || '?'}`;
  }
}

init();

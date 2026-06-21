# Feedback Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users report a wrong/closed route (and general problems) via prefilled GitHub issue, email, or Telegram — offline, no backend.

**Architecture:** A pure, unit-tested `js/feedback.js` builds the report text + channel URLs; `app.js` shows a "Report a problem" panel on the route result and in About, rendering only the configured channels.

**Tech Stack:** Vanilla JS (ES modules), Node 18+ test runner. No deps.

**Spec:** `docs/superpowers/specs/2026-06-21-feedback-module-design.md`

---

## File structure

| File | Change |
|---|---|
| `js/feedback.js` | new — `FEEDBACK` config + `routeReport`, `generalReport`, `buildIssueUrl`, `buildMailtoUrl`, `buildTelegramUrl` |
| `js/app.js` | import feedback; `reportPanelHTML`; report button/panel on route result + About |
| `index.html` | About: report button/panel + version bump |
| `css/styles.css` | report panel + button styles |
| `test/feedback.test.js` | new |
| `sw.js` | cache `js/feedback.js`; bump to `hw-v0.6` |
| `docs/changelog/v0.6.md` | changelog |

---

## Task 1: feedback.js (pure builders)

**Files:**
- Create: `js/feedback.js`
- Test: `test/feedback.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/feedback.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeReport, generalReport, buildIssueUrl, buildMailtoUrl, buildTelegramUrl } from '../js/feedback.js';

test('buildIssueUrl builds a prefilled GitHub issue URL', () => {
  const u = new URL(buildIssueUrl('o/r', 'My Title', 'Body here', 'route-report'));
  assert.equal(u.pathname, '/o/r/issues/new');
  assert.equal(u.searchParams.get('title'), 'My Title');
  assert.equal(u.searchParams.get('body'), 'Body here');
  assert.equal(u.searchParams.get('labels'), 'route-report');
});

test('buildMailtoUrl builds a prefilled mailto', () => {
  const m = buildMailtoUrl('a@b.com', 'Sub ject', 'Bo dy');
  assert.ok(m.startsWith('mailto:a@b.com?'));
  assert.ok(m.includes('subject=Sub%20ject'));
  assert.ok(m.includes('body=Bo%20dy'));
});

test('buildTelegramUrl strips a leading @', () => {
  assert.equal(buildTelegramUrl('@MyBot'), 'https://t.me/MyBot');
  assert.equal(buildTelegramUrl('MyBot'), 'https://t.me/MyBot');
});

test('routeReport includes from/to in title and mode/steps/version in body', () => {
  const { title, body } = routeReport({ fromLabel: 'A lobby', toLabel: 'B clinic', mode: 'sheltered', stepLabels: ['A lobby', 'mid', 'B clinic'], summaryText: '12 min', version: 'v0.6' });
  assert.ok(title.includes('A lobby → B clinic'));
  assert.ok(body.includes('Mode: sheltered'));
  assert.ok(body.includes('- mid'));
  assert.ok(body.includes('v0.6'));
});

test('generalReport returns a titled prompt with version', () => {
  const { title, body } = generalReport('v0.6');
  assert.equal(title, 'Feedback / suggestion');
  assert.ok(body.includes('v0.6'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/feedback.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `js/feedback.js`:

```js
// Pure feedback helpers — build report text + channel URLs. No DOM.

export const FEEDBACK = {
  repo: 'lauyeehow1986-hub/hospital-wayfinder',
  email: 'yhbot86@gmail.com',
  telegram: '', // bot username (e.g. 'OutramWayfinderBot'); set once the Plan 6 bot exists
};

const today = () => new Date().toISOString().slice(0, 10);

export function routeReport(ctx) {
  const { fromLabel, toLabel, mode, stepLabels = [], summaryText = '', version = '' } = ctx;
  const title = `Route issue: ${fromLabel} → ${toLabel}`;
  const body = [
    `From: ${fromLabel}`,
    `To: ${toLabel}`,
    `Mode: ${mode}`,
    `Summary: ${summaryText}`,
    'Steps:',
    ...stepLabels.map((s) => `- ${s}`),
    '',
    `App: ${version}`,
    `Date: ${today()}`,
    '',
    "What's wrong? (closed / wrong directions / other):",
    '',
  ].join('\n');
  return { title, body };
}

export function generalReport(version = '') {
  const title = 'Feedback / suggestion';
  const body = [
    `App: ${version}`,
    `Date: ${today()}`,
    '',
    'Your feedback (a problem, a missing place, a suggestion):',
    '',
  ].join('\n');
  return { title, body };
}

export function buildIssueUrl(repo, title, body, label = 'route-report') {
  const q = new URLSearchParams({ title, body, labels: label });
  return `https://github.com/${repo}/issues/new?${q.toString()}`;
}

export function buildMailtoUrl(email, subject, body) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildTelegramUrl(username) {
  return `https://t.me/${String(username).replace(/^@/, '')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/feedback.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add js/feedback.js test/feedback.test.js
git commit -m "feat(feedback): pure report + channel URL builders"
```

---

## Task 2: Wire the report panel into app.js + About

**Files:**
- Modify: `js/app.js`, `index.html`

- [ ] **Step 1: Import feedback + add a version constant**

In `js/app.js`, add the import after the platform import and an app-version constant near the other module-level consts:

```js
import { getPrefs, savePrefs, getRecent, pushRecent } from './platform.js';
import { FEEDBACK, routeReport, generalReport, buildIssueUrl, buildMailtoUrl, buildTelegramUrl } from './feedback.js';
import './pwa.js';
```

and, next to `const MAP_W = 340;` etc.:

```js
const APP_VERSION = 'v0.6';
```

- [ ] **Step 2: Add the report-panel builder**

In `js/app.js`, add this function (e.g. just after `stepRowHTML`):

```js
function reportPanelHTML(report) {
  const buttons = [];
  if (FEEDBACK.email) buttons.push(`<a class="rep-btn" href="${esc(buildMailtoUrl(FEEDBACK.email, report.title, report.body))}">Email</a>`);
  buttons.push(`<a class="rep-btn" href="${esc(buildIssueUrl(FEEDBACK.repo, report.title, report.body))}" target="_blank" rel="noopener">GitHub issue</a>`);
  if (FEEDBACK.telegram) buttons.push(`<a class="rep-btn" href="${esc(buildTelegramUrl(FEEDBACK.telegram))}" target="_blank" rel="noopener">Telegram</a>`);
  return `<p class="sub">Something wrong? (closed, wrong directions…)</p><div class="rep-btns">${buttons.join('')}</div>`;
}
```

- [ ] **Step 3: Add the report button to the route result**

In `js/app.js`, in `renderRoute`, replace this tail:

```js
    <div id="route-view"></div>`;
  out.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    state.routeView = b.dataset.view;
    renderRouteView(state.routeView);
  }));
  renderRouteView(state.routeView);
}
```

with:

```js
    <div id="route-view"></div>
    <button class="link-btn" id="report-route" type="button">⚠ Report a problem</button>
    <div class="report-panel" id="report-panel" hidden></div>`;
  out.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    state.routeView = b.dataset.view;
    renderRouteView(state.routeView);
  }));
  $('#report-route').addEventListener('click', () => {
    const panel = $('#report-panel');
    if (panel.hidden) {
      panel.innerHTML = reportPanelHTML(routeReport({
        fromLabel: nodeIndex.get(state.fromId).label,
        toLabel: nodeIndex.get(state.toId).label,
        mode: state.mode,
        stepLabels: lastRoute.rows.map((r) => r.label),
        summaryText: lastRoute.summary.text,
        version: APP_VERSION,
      }));
    }
    panel.hidden = !panel.hidden;
  });
  renderRouteView(state.routeView);
}
```

- [ ] **Step 4: Wire the About report + add markup**

In `index.html`, replace the About version line:

```html
      <p>Version 0.2</p>
```

with:

```html
      <p>Version 0.6</p>
      <button class="link-btn" id="report-general" type="button">⚠ Report a problem / suggest a place</button>
      <div class="report-panel" id="report-general-panel" hidden></div>
```

In `js/app.js`, add a `wireAbout` function and call it from `init()` (after `wireA11y();`):

```js
function wireAbout() {
  const btn = $('#report-general');
  if (!btn) return;
  const panel = $('#report-general-panel');
  btn.addEventListener('click', () => {
    if (panel.hidden) panel.innerHTML = reportPanelHTML(generalReport(APP_VERSION));
    panel.hidden = !panel.hidden;
  });
}
```

Add `wireAbout();` in `init()` right after the `wireA11y();` line.

- [ ] **Step 5: Commit**

```bash
git add js/app.js index.html
git commit -m "feat(feedback): report panel on route result and About"
```

---

## Task 3: CSS for the report panel

**Files:**
- Modify: `css/styles.css`

- [ ] **Step 1: Append styles**

Append to `css/styles.css`:

```css
.link-btn { background: transparent; border: 0; color: var(--primary); text-decoration: underline; padding: 10px 0; min-height: 44px; font-size: 14px; }
.report-panel { background: var(--surface); border: var(--bw) solid var(--border); border-radius: var(--radius); padding: 12px; margin: 4px 0 12px; }
.report-panel .sub { color: var(--muted); font-size: 14px; margin-bottom: 8px; }
.rep-btns { display: flex; flex-wrap: wrap; gap: 8px; }
.rep-btn { min-height: 44px; display: inline-flex; align-items: center; padding: 8px 14px; border: var(--bw) solid var(--primary); color: var(--primary-deep); background: var(--surface); border-radius: var(--radius); text-decoration: none; font-size: 14px; }
```

- [ ] **Step 2: Commit**

```bash
git add css/styles.css
git commit -m "feat(feedback): report panel styles"
```

---

## Task 4: SW cache, changelog, verify

**Files:**
- Modify: `sw.js`
- Create: `docs/changelog/v0.6.md`

- [ ] **Step 1: Cache feedback.js and bump the cache**

In `sw.js`, bump the name and add the module:

```js
const CACHE = 'hw-v0.6';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/styles.css',
  './js/app.js', './js/wayfinding.js', './js/mapData.js', './js/places.js',
  './js/render.js', './js/platform.js', './js/mapView.js', './js/feedback.js', './js/pwa.js',
  './data/nodes.json', './data/edges.json', './data/pois.json', './data/meta.json',
  './icon-192.svg', './icon-512.svg',
];
```

- [ ] **Step 2: Run the full unit suite**

Run: `npm test`
Expected: all pass (53 prior + 5 feedback = 58), fail = 0.

- [ ] **Step 3: Verify in the browser**

Run: `python -m http.server 8080` → open `http://localhost:8080` (unregister the old service worker first, then reload).
- Make a route → click "⚠ Report a problem" → a panel shows **Email** + **GitHub issue** buttons (no Telegram, since `FEEDBACK.telegram` is empty).
- The GitHub button opens `github.com/…/issues/new` with the title/body prefilled (From → To, mode, steps); the Email button opens a `mailto:` to `yhbot86@gmail.com` prefilled.
- About tab → "Report a problem / suggest a place" → same panel without route context.

- [ ] **Step 4: Create `docs/changelog/v0.6.md`**

```markdown
# v0.6 — Feedback

- "Report a problem" on the route result and in About, with prefilled GitHub-issue
  and email channels (offline, no backend). Route reports carry From → To, mode, and
  the step list so issues are reproducible.
- A Telegram channel button is wired but hidden until `FEEDBACK.telegram` is set
  (the Plan 6 bot).
- Pure builders (`js/feedback.js`) unit-tested. 58 tests total.
```

- [ ] **Step 5: Commit**

```bash
git add sw.js docs/changelog/v0.6.md
git commit -m "feat(feedback): cache feedback.js, v0.6 changelog"
```

---

## Done criteria

- `npm test` green (58 tests).
- Route result + About show a "Report a problem" panel; Email + GitHub buttons open
  correctly prefilled targets; Telegram button hidden until configured.
- `js/feedback.js` is pure and unit-tested; `app.js` only wires the DOM.

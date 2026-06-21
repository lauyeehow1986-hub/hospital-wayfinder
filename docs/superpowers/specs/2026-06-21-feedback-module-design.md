# Hospital Wayfinder — Feedback Module Design (Plan 5)

**Date:** 2026-06-21
**Status:** Approved (design), pending spec review
**Builds on:** Plans 1–4. Realizes the brief's step 7 / v1 design §4 **feedback** module.

## 1. Goal

Let users flag **"this route is wrong/closed"** (and report general problems / suggest
a place) with **zero backend, offline-first**. Critical because the route graph is
hand-mapped and will have gaps. No data is stored by the app — feedback opens a
prefilled link the user sends from their own GitHub/email.

## 2. Mechanism

Two channels, user chooses (per decision): a **prefilled GitHub issue** and a
**prefilled `mailto:`**. Config lives at the top of `js/feedback.js`:

```js
export const FEEDBACK = { repo: 'lauyeehow1986-hub/hospital-wayfinder', email: 'yhbot86@gmail.com' };
```

- `repo` → GitHub issues (no personal email exposed; structured/trackable).
- `email` → a throwaway address (public-repo-safe). **The Email button renders only
  when `email` is a non-empty value**, so clearing it cleanly disables that channel.

## 3. `js/feedback.js` (pure, unit-tested)

- `routeReport(ctx)` → `{ title, body }` from `ctx = { fromLabel, toLabel, mode,
  stepLabels: string[], summaryText, version }`. Title: `Route issue: <from> → <to>`.
  Body: from/to/mode, the step labels, the summary, app version + date, and a
  `What's wrong? (closed / wrong directions / …):` prompt line for the user to fill.
- `generalReport(version)` → `{ title, body }` for non-route feedback (title
  `Feedback / suggestion`, body with version + date + a prompt line).
- `buildIssueUrl(repo, title, body, label)` →
  `https://github.com/<repo>/issues/new?title=…&body=…&labels=<label>` (all
  `encodeURIComponent`-encoded; `label` default `route-report`).
- `buildMailtoUrl(email, subject, body)` → `mailto:<email>?subject=…&body=…`.

## 4. UI (`js/app.js`)

- **Route result:** a "Report a problem" text button beneath the Map/Steps view.
  Click → an inline panel (normal flow, no `position: fixed`): a short prompt + two
  buttons — **Email** (only if `FEEDBACK.email` set) and **GitHub issue** — each
  opening the prefilled URL built from the current route (`lastRoute`).
- **About tab:** a "Report a problem / suggest a place" button → the same two
  channels via `generalReport` (no route context).
- Opening: `window.open(url, '_blank', 'noopener')` for the `https` GitHub link;
  `location.href = url` for `mailto:`.

## 5. Data flow & edge cases

- Pure URL construction; no network or storage. The route report uses the
  already-computed `lastRoute`; the About report needs no route.
- Keep the body concise (step **labels** only) so prefilled URLs stay well within
  practical length limits for long routes.

## 6. Testing

- **Node `--test`:** `buildIssueUrl` (contains `issues/new`, encoded title, label),
  `buildMailtoUrl` (`mailto:` prefix, encoded subject/body), `routeReport` (title has
  from→to; body includes mode + step labels + version), `generalReport`.
- **Live:** route → Report → Email/GitHub open the correct prefilled targets; About
  report works; Email button hidden when `FEEDBACK.email` is empty.

## 7. Files

| File | Change |
|---|---|
| `js/feedback.js` | new — config + pure report/URL builders |
| `js/app.js` | route report panel + About report wiring |
| `css/styles.css` | report panel styles |
| `test/feedback.test.js` | new |
| `sw.js` | cache `js/feedback.js`; bump to `hw-v0.6` |
| `docs/changelog/v0.6.md` | changelog |

## 8. Deferred

In-app structured feedback storage / backend, per-POI reporting, analytics.

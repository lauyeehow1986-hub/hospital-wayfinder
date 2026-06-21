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

Three channels, user chooses: a **prefilled GitHub issue**, a **prefilled `mailto:`**,
and a **Telegram** link to the bot (Plan 6). Config lives at the top of
`js/feedback.js`:

```js
export const FEEDBACK = {
  repo: 'lauyeehow1986-hub/hospital-wayfinder',
  email: 'yhbot86@gmail.com',
  telegram: '', // bot username (e.g. 'OutramWayfinderBot'); set once Plan 6 bot exists
};
```

- `repo` → GitHub issues (no personal email exposed; structured/trackable).
- `email` → a throwaway address (public-repo-safe).
- `telegram` → opens `https://t.me/<username>` (the Plan 6 bot). Telegram deep links
  can't prefill a long route message, so this channel is free-text (the bot
  understands questions + feedback); GitHub/email carry the full route context.
- **Each button renders only when its config value is non-empty**, so unset channels
  (e.g. `telegram` until the bot is deployed) are cleanly hidden.

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
- `buildTelegramUrl(username)` → `https://t.me/<username>` (strips a leading `@`).

## 4. UI (`js/app.js`)

- **Route result:** a "Report a problem" text button beneath the Map/Steps view.
  Click → an inline panel (normal flow, no `position: fixed`): a short prompt + up to
  three buttons — **Email**, **GitHub issue**, **Telegram** — each rendered only if
  its config is set, opening the prefilled URL built from the current route
  (`lastRoute`). (Telegram opens the bot chat; route context isn't prefilled there.)
- **About tab:** a "Report a problem / suggest a place" button → the same channels via
  `generalReport` (no route context).
- Opening: `window.open(url, '_blank', 'noopener')` for the `https` GitHub link;
  `location.href = url` for `mailto:`.

## 5. Data flow & edge cases

- Pure URL construction; no network or storage. The route report uses the
  already-computed `lastRoute`; the About report needs no route.
- Keep the body concise (step **labels** only) so prefilled URLs stay well within
  practical length limits for long routes.

## 6. Testing

- **Node `--test`:** `buildIssueUrl` (contains `issues/new`, encoded title, label),
  `buildMailtoUrl` (`mailto:` prefix, encoded subject/body), `buildTelegramUrl`
  (strips `@`, `https://t.me/...`), `routeReport` (title has from→to; body includes
  mode + step labels + version), `generalReport`.
- **Live:** route → Report → buttons open the correct prefilled targets; About report
  works; a channel's button is hidden when its config value is empty.

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

# Hospital Wayfinder — Telegram → Claude Bot (Plan 6)

**Date:** 2026-06-21
**Status:** Approved (design), pending spec review
**Builds on:** Plans 1–5. Separate **backend** subsystem; the static PWA only links to
it (Plan 5's Telegram button).

## 1. Goal

A Telegram bot that **answers wayfinding questions** ("how do I get from Outram MRT to
NHCS?", "nearest toilet to Block 7?") using the route graph, **and triages feedback**
("the basement linkway is closed") — powered by Claude with the routing modules as
tools. Always-on, near-zero cost, no servers to manage.

## 2. Architecture

A **Cloudflare Worker** exposes a Telegram **webhook**. Per inbound message:
1. Verify Telegram's `X-Telegram-Bot-Api-Secret-Token`; ignore non-message updates.
2. **Rate-limit** (Workers KV): per-user (e.g. 20/min, 60/day) + a **global daily cap**
   (200/day). Over-limit → polite "busy, try later" (no Claude call).
3. Load the route graph (raw GitHub `data/*.json`, cached in KV with a short TTL) and
   build it with `buildGraph`.
4. Run **Claude** (Anthropic Messages API) in a **tool-use loop** with a wayfinding
   system prompt + the tools below, plus the last ~6 turns of this chat (KV, TTL'd).
5. Send Claude's reply via Telegram `sendMessage`.
6. If `record_feedback` was called, DM **you** (`OWNER_CHAT_ID`) the structured summary
   and (if `GITHUB_TOKEN` set) open a GitHub issue (`label: route-report`).

The Worker **bundles the pure modules** (`js/wayfinding.js`, `mapData.js`, `places.js`)
— no routing logic is duplicated.

## 3. Claude tools

Read-only routing + one constrained write:
- `search_nodes(query)` → `mapData.searchNodes` (resolve a name to node id/label).
- `find_route(fromId, toId, mode)` → `wayfinding.findRoute` + `summarizeRoute`
  (returns summary text + step labels).
- `nearest_place(fromId, category)` → `places.nearestPoi`.
- `places_near(nodeId, maxMinutes)` → `places.poisNearNode`.
- `record_feedback(category, location, detail, severity)` → the only write: notifies
  the owner (Telegram DM) + optional GitHub issue. No destructive capability exists,
  so prompt-injection from strangers is low-risk.

**Model:** `claude-haiku-4-5` (cost-effective for a public bot), swappable to Sonnet.
Exact model id + pricing confirmed from the **claude-api** reference at build time.

## 4. State & data

- **Per-chat history:** last ~6 turns in KV keyed by chat id, TTL ~30 min; `/start`
  clears it. Enables follow-ups ("from there, nearest pharmacy?").
- **Graph data:** fetched from raw GitHub and cached (KV, short TTL) so graph edits go
  live without redeploying the Worker.

## 5. Security & cost control

- Webhook secret-token check (only Telegram can invoke).
- Per-user + global daily caps in KV → hard bound on Claude spend; over-cap short-
  circuits before any API call.
- Tools read-only except `record_feedback` (server-shaped, rate-limited).
- Secrets (Worker env, never committed): `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `OWNER_CHAT_ID`, optional
  `GITHUB_TOKEN`.
- Cost: Haiku + caps → typically a few cents/day, bounded by the daily cap; Workers
  free tier covers requests.

## 6. Repo layout & testing

- New `bot/` folder (same repo): `wrangler.toml`, `src/index.js` (fetch handler),
  `src/claude.js` (Anthropic loop), `src/tools.js` (tool schema + dispatch to the
  routing modules), `src/telegram.js` (send/parse), `src/ratelimit.js`. Imports
  `../js/*` pure modules. `bot/SETUP.md` for deploy.
- **Unit-tested (Node `--test`):** the deterministic glue — `tools.js` dispatch
  (tool name + args → routing fn → result shape), `ratelimit.js` (under/over limit),
  Telegram update parsing. The LLM wording and live webhook are **not** unit-tested.
- **Live:** `wrangler dev` + a real test message; verify a routing answer, a feedback
  DM to the owner, and the rate-limit cap.

## 7. What I build vs what you do

- **I build:** all Worker code, tool wiring, tests, `wrangler.toml`, and `bot/SETUP.md`.
- **You do (needs your accounts/keys):** create the bot via **BotFather** (token +
  username), make a **Cloudflare** account + `wrangler login`, set the Worker
  **secrets** (incl. your paid **Anthropic API key**), `wrangler deploy`, and register
  the Telegram webhook (with the secret). Then set `FEEDBACK.telegram` (Plan 5) to the
  bot username so the in-app Telegram button appears.

## 8. Deferred

Voice/image messages, multi-language, richer long-term memory, auto-applying feedback
to the graph (stays human-reviewed via Plan 3's merge).

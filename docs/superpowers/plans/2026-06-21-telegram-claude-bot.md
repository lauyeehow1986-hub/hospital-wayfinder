# Telegram → Claude Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Cloudflare Worker Telegram bot that answers wayfinding questions (Claude + the routing modules as tools) and triages feedback (owner DM + optional GitHub issue).

**Architecture:** A Worker webhook verifies Telegram's secret, rate-limits via KV, loads the route graph from raw GitHub, runs Claude (`@anthropic-ai/sdk`) in a manual tool-use loop over read-only routing tools + one `record_feedback` write, and replies. Pure glue is unit-tested at the repo root; the Worker/Claude/Telegram I/O is verified live with `wrangler dev`.

**Tech Stack:** Cloudflare Workers (`wrangler`), `@anthropic-ai/sdk`, Workers KV, vanilla JS ES modules reusing `js/wayfinding.js` / `mapData.js` / `places.js` / `render.js`.

**Spec:** `docs/superpowers/specs/2026-06-21-telegram-claude-bot-design.md`

**Model note:** the claude-api reference defaults to `claude-opus-4-8`; this bot uses **`claude-haiku-4-5`** per the approved design (cost for a public bot) — set via the `CLAUDE_MODEL` env var, swappable to Sonnet/Opus. Haiku doesn't support `effort`/adaptive-thinking, so the request omits them.

---

## File structure (all new, under `bot/` unless noted)

| File | Responsibility | Unit-tested? |
|---|---|---|
| `bot/package.json`, `bot/wrangler.toml` | Worker deps + config | no |
| `bot/src/tools.js` | `TOOL_DEFS` + pure `dispatchTool` over the routing modules | **yes** |
| `bot/src/ratelimit.js` | pure `decideLimit` + `LIMITS` | **yes** |
| `bot/src/telegram.js` | pure `parseUpdate` + `sendMessage` (fetch) | `parseUpdate` **yes** |
| `bot/src/graph.js` | load + cache the graph from raw GitHub | no |
| `bot/src/claude.js` | Anthropic manual tool-use loop | no (live) |
| `bot/src/index.js` | Worker fetch handler (webhook) | no (live) |
| `bot/SETUP.md` | deploy guide | — |
| `test/bot-tools.test.js`, `test/bot-ratelimit.test.js`, `test/bot-telegram.test.js` | root unit tests | — |
| `.gitignore` (root) | ignore `.wrangler/` | — |
| `docs/changelog/v0.7.md` | changelog | — |

---

## Task 1: Scaffold the bot

**Files:**
- Create: `bot/package.json`, `bot/wrangler.toml`
- Modify: `.gitignore`

- [ ] **Step 1: Create `bot/package.json`**

```json
{
  "name": "hospital-wayfinder-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Telegram + Claude wayfinding bot (Cloudflare Worker).",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.69.0"
  },
  "devDependencies": {
    "wrangler": "^3.90.0"
  },
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  }
}
```

- [ ] **Step 2: Create `bot/wrangler.toml`**

```toml
name = "hospital-wayfinder-bot"
main = "src/index.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

# Create with: wrangler kv namespace create HW_KV  → paste the id below
[[kv_namespaces]]
binding = "HW_KV"
id = "REPLACE_WITH_KV_NAMESPACE_ID"

[vars]
CLAUDE_MODEL = "claude-haiku-4-5"
# Secrets (set with `wrangler secret put NAME`), not vars:
#   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, ANTHROPIC_API_KEY,
#   OWNER_CHAT_ID, GITHUB_TOKEN (optional)
```

- [ ] **Step 3: Ignore the wrangler build cache**

In `.gitignore`, under the `# Node` section, add:

```
.wrangler/
```

- [ ] **Step 4: Commit**

```bash
git add bot/package.json bot/wrangler.toml .gitignore
git commit -m "chore(bot): scaffold Cloudflare Worker (package.json, wrangler.toml)"
```

---

## Task 2: tools.js — Claude tool defs + dispatch

**Files:**
- Create: `bot/src/tools.js`
- Test: `test/bot-tools.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/bot-tools.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../js/wayfinding.js';
import { indexById } from '../js/mapData.js';
import { TOOL_DEFS, dispatchTool } from '../bot/src/tools.js';

const nodes = [
  { id: 'a', label: 'A lobby', building: 'X', level: 1, x: 0, y: 0 },
  { id: 'b', label: 'B clinic', building: 'X', level: 1, x: 10, y: 0 },
];
const edges = [{ id: 'e1', from: 'a', to: 'b', path_type: 'indoor', walk_time_minutes: 3, accessible: true }];
const pois = [{ id: 'p1', name: 'Toilet near B', category: 'toilet', node: 'b' }];
const ctx = { graph: buildGraph(nodes, edges), nodes, pois, nodeIndex: indexById(nodes) };

test('TOOL_DEFS lists the expected tools', () => {
  const names = TOOL_DEFS.map((t) => t.name);
  for (const n of ['search_nodes', 'find_route', 'nearest_place', 'places_near', 'record_feedback']) {
    assert.ok(names.includes(n), `missing ${n}`);
  }
});

test('search_nodes resolves a name to nodes', () => {
  const out = dispatchTool('search_nodes', { query: 'A lobby' }, ctx);
  assert.equal(JSON.parse(out.content)[0].id, 'a');
});

test('find_route returns a summary and steps', () => {
  const out = dispatchTool('find_route', { from: 'a', to: 'b', mode: 'fastest' }, ctx);
  const parsed = JSON.parse(out.content);
  assert.match(parsed.summary, /min/);
  assert.equal(parsed.steps.length, 1);
});

test('nearest_place finds a category', () => {
  const out = dispatchTool('nearest_place', { from: 'a', category: 'toilet' }, ctx);
  assert.equal(JSON.parse(out.content).name, 'Toilet near B');
});

test('record_feedback returns a feedback object', () => {
  const out = dispatchTool('record_feedback', { detail: 'linkway closed', severity: 'high' }, ctx);
  assert.ok(out.feedback);
  assert.equal(out.feedback.detail, 'linkway closed');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bot-tools.test.js`
Expected: FAIL — `../bot/src/tools.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `bot/src/tools.js`:

```js
// Claude tool definitions + pure dispatch over the routing modules. No SDK import,
// so this is unit-testable at the repo root without bot dependencies installed.
import { findRoute, summarizeRoute } from '../../js/wayfinding.js';
import { searchNodes } from '../../js/mapData.js';
import { nearestPoi, poisNearNode } from '../../js/places.js';
import { modeToOpts } from '../../js/render.js';

export const TOOL_DEFS = [
  {
    name: 'search_nodes',
    description: 'Find hospital landmarks/locations by name. Returns matching node ids + labels. Call this first to turn a place name into a node id.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Place name, e.g. "NHCS lobby"' } }, required: ['query'] },
  },
  {
    name: 'find_route',
    description: 'Walking route between two node ids. mode: "fastest", "sheltered" (prefers indoor/sheltered), or "step-free" (wheelchair accessible). Returns a summary + steps.',
    input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, mode: { type: 'string', enum: ['fastest', 'sheltered', 'step-free'] } }, required: ['from', 'to'] },
  },
  {
    name: 'nearest_place',
    description: 'Nearest place of interest of a category from a node id. category: food, toilet, charging, rest_area, convenience, atm, pharmacy, water, info.',
    input_schema: { type: 'object', properties: { from: { type: 'string' }, category: { type: 'string' } }, required: ['from', 'category'] },
  },
  {
    name: 'places_near',
    description: 'List places of interest within walking distance (minutes) of a node id.',
    input_schema: { type: 'object', properties: { node: { type: 'string' }, maxMinutes: { type: 'number' } }, required: ['node'] },
  },
  {
    name: 'record_feedback',
    description: 'Record a user-reported problem (a route is wrong/closed, a place moved/closed). Use when the user reports an issue rather than asks a question.',
    input_schema: { type: 'object', properties: { category: { type: 'string' }, location: { type: 'string' }, detail: { type: 'string' }, severity: { type: 'string', enum: ['low', 'medium', 'high'] } }, required: ['detail'] },
  },
];

const labelOf = (nodeIndex, id) => (nodeIndex.get(id) ? nodeIndex.get(id).label : id);

// Returns { content: string, feedback?: object }. record_feedback surfaces a
// feedback object for the Worker to act on; everything else is read-only.
export function dispatchTool(name, input, ctx) {
  const { graph, nodes, pois, nodeIndex } = ctx;
  if (name === 'search_nodes') {
    const matches = searchNodes(nodes, input.query || '').slice(0, 5)
      .map((n) => ({ id: n.id, label: n.label, building: n.building, level: n.level }));
    return { content: JSON.stringify(matches) };
  }
  if (name === 'find_route') {
    const result = findRoute(graph, input.from, input.to, modeToOpts(input.mode || 'sheltered'));
    if (!result) return { content: 'No route found between those nodes.' };
    const summary = summarizeRoute(result);
    const steps = result.edges.map((e, i) => `${i + 1}. ${e.path_type} to ${labelOf(nodeIndex, result.path[i + 1])} (${e.walk_time_minutes} min)`);
    return { content: JSON.stringify({ summary: summary.text, from: labelOf(nodeIndex, result.path[0]), to: labelOf(nodeIndex, result.path[result.path.length - 1]), steps }) };
  }
  if (name === 'nearest_place') {
    const best = nearestPoi(graph, pois, input.from, { category: input.category, mode: 'sheltered' });
    if (!best) return { content: 'Nothing of that category is reachable from there.' };
    return { content: JSON.stringify({ name: best.poi.name, minutes: best.route.totalMinutes, node: best.poi.node }) };
  }
  if (name === 'places_near') {
    const list = poisNearNode(graph, pois, input.node, { maxMinutes: input.maxMinutes ?? 10 })
      .map((r) => ({ name: r.poi.name, category: r.poi.category, minutes: r.minutes }));
    return { content: JSON.stringify(list) };
  }
  if (name === 'record_feedback') {
    return {
      content: 'Thanks — your report has been recorded and passed to the maintainer.',
      feedback: { category: input.category || 'general', location: input.location || '', detail: input.detail || '', severity: input.severity || 'medium' },
    };
  }
  return { content: `Unknown tool: ${name}` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/bot-tools.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add bot/src/tools.js test/bot-tools.test.js
git commit -m "feat(bot): Claude tool defs + pure dispatch over routing modules"
```

---

## Task 3: ratelimit.js

**Files:**
- Create: `bot/src/ratelimit.js`
- Test: `test/bot-ratelimit.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/bot-ratelimit.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideLimit, LIMITS } from '../bot/src/ratelimit.js';

test('decideLimit allows under the limits', () => {
  assert.equal(decideLimit({ userCount: 0, globalCount: 0 }, LIMITS).allowed, true);
});

test('decideLimit blocks at the per-user cap', () => {
  const d = decideLimit({ userCount: LIMITS.perUserDaily, globalCount: 0 }, LIMITS);
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'user');
});

test('decideLimit blocks at the global cap first', () => {
  const d = decideLimit({ userCount: 0, globalCount: LIMITS.globalDaily }, LIMITS);
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'global');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bot-ratelimit.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `bot/src/ratelimit.js`:

```js
// Pure rate-limit decision. The Worker supplies counts read from KV.
export const LIMITS = { perUserDaily: 60, globalDaily: 200 };

export function decideLimit({ userCount, globalCount }, limits = LIMITS) {
  if (globalCount >= limits.globalDaily) return { allowed: false, reason: 'global' };
  if (userCount >= limits.perUserDaily) return { allowed: false, reason: 'user' };
  return { allowed: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/bot-ratelimit.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add bot/src/ratelimit.js test/bot-ratelimit.test.js
git commit -m "feat(bot): pure rate-limit decision"
```

---

## Task 4: telegram.js

**Files:**
- Create: `bot/src/telegram.js`
- Test: `test/bot-telegram.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/bot-telegram.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUpdate } from '../bot/src/telegram.js';

test('parseUpdate extracts chatId, text, from a message', () => {
  const u = { message: { chat: { id: 42 }, from: { id: 7 }, text: 'hi' } };
  assert.deepEqual(parseUpdate(u), { chatId: 42, text: 'hi', from: 7 });
});

test('parseUpdate returns null for non-text updates', () => {
  assert.equal(parseUpdate({ edited_message: {} }), null);
  assert.equal(parseUpdate({ message: { chat: { id: 1 } } }), null);
  assert.equal(parseUpdate({}), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bot-telegram.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `bot/src/telegram.js`:

```js
// Telegram helpers. parseUpdate is pure (unit-tested); sendMessage uses fetch.
export function parseUpdate(update) {
  const msg = update && update.message;
  if (!msg || typeof msg.text !== 'string' || !msg.chat) return null;
  return { chatId: msg.chat.id, text: msg.text, from: msg.from ? msg.from.id : msg.chat.id };
}

export async function sendMessage(token, chatId, text) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/bot-telegram.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add bot/src/telegram.js test/bot-telegram.test.js
git commit -m "feat(bot): telegram parseUpdate + sendMessage"
```

---

## Task 5: graph.js + claude.js

**Files:**
- Create: `bot/src/graph.js`, `bot/src/claude.js`

- [ ] **Step 1: Create `bot/src/graph.js`**

```js
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
```

- [ ] **Step 2: Create `bot/src/claude.js`**

```js
import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFS, dispatchTool } from './tools.js';

const SYSTEM = `You are a wayfinding assistant for the Outram hospital cluster (SGH, NHCS, NCC and their linkways) in Singapore. Help patients and visitors find their way — indoor, underground, and sheltered routes between landmarks, plus nearby amenities (toilets, food, charging, pharmacy, etc.).

How to work:
- To answer a "how do I get to" or "where is" question, first call search_nodes to turn place names into node ids, then call find_route, nearest_place, or places_near with those ids.
- Prefer sheltered or step-free routes when the user implies mobility needs, a wheelchair, or bad weather.
- Keep replies short and clear for someone walking with a phone: give the total time and the key steps.
- If a place can't be found, say so plainly and suggest a nearby landmark.
- If the user reports a problem (a route is wrong or closed, a place has moved), call record_feedback.`;

// history: clean [{role,content:string}] turns. Returns { text, feedback }.
export async function runClaude({ apiKey, model, userText, history, ctx, onFeedback }) {
  const client = new Anthropic({ apiKey });
  const messages = [...history, { role: 'user', content: userText }];
  let feedback = null;
  for (let i = 0; i < 6; i += 1) {
    const resp = await client.messages.create({ model, max_tokens: 1024, system: SYSTEM, tools: TOOL_DEFS, messages });
    if (resp.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: resp.content });
      const toolResults = [];
      for (const block of resp.content) {
        if (block.type !== 'tool_use') continue;
        const out = dispatchTool(block.name, block.input, ctx);
        if (out.feedback) { feedback = out.feedback; if (onFeedback) await onFeedback(out.feedback); }
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: out.content });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }
    const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return { text: text || 'Sorry, I could not work that out.', feedback };
  }
  return { text: 'Sorry, that took too many steps — please rephrase.', feedback };
}
```

- [ ] **Step 3: Commit**

```bash
git add bot/src/graph.js bot/src/claude.js
git commit -m "feat(bot): graph loader + Claude tool-use loop"
```

---

## Task 6: index.js — Worker webhook handler

**Files:**
- Create: `bot/src/index.js`

- [ ] **Step 1: Create `bot/src/index.js`**

```js
import { parseUpdate, sendMessage } from './telegram.js';
import { decideLimit, LIMITS } from './ratelimit.js';
import { loadGraph } from './graph.js';
import { runClaude } from './claude.js';

const HIST_TTL = 1800; // 30 min
const DAY = 86400;
const REPO = 'lauyeehow1986-hub/hospital-wayfinder';

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') return new Response('ok');
    if (env.TELEGRAM_WEBHOOK_SECRET && request.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response('forbidden', { status: 403 });
    }
    let update;
    try { update = await request.json(); } catch { return new Response('bad request', { status: 400 }); }
    const msg = parseUpdate(update);
    if (msg) ctx.waitUntil(handle(env, msg).catch((e) => console.error('handle error', e)));
    return new Response('ok'); // ack Telegram immediately
  },
};

async function handle(env, msg) {
  const token = env.TELEGRAM_BOT_TOKEN;

  if (msg.text.trim() === '/start') {
    await env.HW_KV.delete(`hist:${msg.chatId}`);
    await sendMessage(token, msg.chatId, 'Hi! I help you get around the Outram hospital cluster (SGH, NHCS, NCC). Ask things like "How do I get from Outram MRT to NHCS lobby?" or "nearest toilet to Block 7?". You can also report a wrong or closed route.');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const userKey = `rl:${today}:${msg.from}`;
  const globalKey = `rl:${today}:global`;
  const userCount = Number(await env.HW_KV.get(userKey)) || 0;
  const globalCount = Number(await env.HW_KV.get(globalKey)) || 0;
  const decision = decideLimit({ userCount, globalCount }, LIMITS);
  if (!decision.allowed) {
    await sendMessage(token, msg.chatId, decision.reason === 'global'
      ? 'The assistant is busy right now — please try again later.'
      : "You've reached today's message limit. Please try again tomorrow.");
    return;
  }
  await env.HW_KV.put(userKey, String(userCount + 1), { expirationTtl: DAY });
  await env.HW_KV.put(globalKey, String(globalCount + 1), { expirationTtl: DAY });

  const ctxData = await loadGraph();
  const history = JSON.parse((await env.HW_KV.get(`hist:${msg.chatId}`)) || '[]');

  const onFeedback = async (fb) => {
    if (env.OWNER_CHAT_ID) {
      await sendMessage(token, env.OWNER_CHAT_ID, `Feedback (${fb.severity}) [${fb.category}]\nLocation: ${fb.location || '-'}\n${fb.detail}\n(from chat ${msg.chatId})`);
    }
    if (env.GITHUB_TOKEN) {
      await fetch(`https://api.github.com/repos/${REPO}/issues`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json', 'User-Agent': 'hw-bot' },
        body: JSON.stringify({ title: `Bot feedback: ${fb.category}`, body: `${fb.detail}\n\nLocation: ${fb.location || '-'}\nSeverity: ${fb.severity}\nVia Telegram bot.`, labels: ['route-report'] }),
      }).catch(() => {});
    }
  };

  let result;
  try {
    result = await runClaude({ apiKey: env.ANTHROPIC_API_KEY, model: env.CLAUDE_MODEL || 'claude-haiku-4-5', userText: msg.text, history, ctx: ctxData, onFeedback });
  } catch (e) {
    console.error('claude error', e);
    await sendMessage(token, msg.chatId, 'Sorry, something went wrong. Please try again.');
    return;
  }

  await sendMessage(token, msg.chatId, result.text);
  const newHistory = [...history, { role: 'user', content: msg.text }, { role: 'assistant', content: result.text }].slice(-6);
  await env.HW_KV.put(`hist:${msg.chatId}`, JSON.stringify(newHistory), { expirationTtl: HIST_TTL });
}
```

- [ ] **Step 2: Commit**

```bash
git add bot/src/index.js
git commit -m "feat(bot): Worker webhook handler (rate limit, KV history, owner notify)"
```

---

## Task 7: SETUP.md, changelog, full suite

**Files:**
- Create: `bot/SETUP.md`, `docs/changelog/v0.7.md`

- [ ] **Step 1: Run the full root unit suite**

Run: `npm test`
Expected: all pass (58 prior + bot-tools 5 + bot-ratelimit 3 + bot-telegram 2 = 68), fail = 0.

- [ ] **Step 2: Create `bot/SETUP.md`**

```markdown
# Telegram → Claude bot — setup & deploy

The bot is a Cloudflare Worker. The PWA stays static; this runs independently.

## Prerequisites
- A Telegram bot: message @BotFather → `/newbot` → save the **token** and the **@username**.
- A Cloudflare account (free) + Wrangler: `npm install` inside `bot/`, then `npx wrangler login`.
- An Anthropic API key (paid) from the Console.
- Your Telegram numeric chat id (message @userinfobot) for feedback DMs.

## One-time setup
1. `cd bot && npm install`
2. Create a KV namespace: `npx wrangler kv namespace create HW_KV` → paste the
   returned `id` into `wrangler.toml` (`REPLACE_WITH_KV_NAMESPACE_ID`).
3. Set secrets (each prompts for the value):
   ```
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any long random string you choose
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put OWNER_CHAT_ID             # your Telegram chat id
   npx wrangler secret put GITHUB_TOKEN              # optional: auto-file issues
   ```
4. Deploy: `npx wrangler deploy` → note the Worker URL (e.g. `https://hospital-wayfinder-bot.<you>.workers.dev`).
5. Register the Telegram webhook (use the same secret as step 3):
   ```
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://hospital-wayfinder-bot.<you>.workers.dev" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```
6. Point the PWA's Telegram button at the bot: set `telegram: '<your-bot-username>'`
   in `js/feedback.js`, bump the `sw.js` cache, commit, and redeploy the PWA.

## Local dev
`npx wrangler dev` runs the Worker locally; use a tunnel (e.g. `cloudflared`) or the
Cloudflare dashboard to point a test bot's webhook at it. Send the bot a message and
watch the logs.

## Cost & limits
Model is `claude-haiku-4-5` (set `CLAUDE_MODEL` to change). Rate limits: 60/user/day,
200/day total (in `bot/src/ratelimit.js`). The daily cap bounds Claude spend.
```

- [ ] **Step 3: Create `docs/changelog/v0.7.md`**

```markdown
# v0.7 — Telegram → Claude bot

- A Cloudflare Worker Telegram bot (`bot/`) that answers wayfinding questions using
  Claude with the routing modules as tools, and triages feedback (owner DM + optional
  GitHub issue).
- Reuses `js/wayfinding.js` / `mapData.js` / `places.js` / `render.js` as tools — no
  routing logic duplicated. Route data is fetched live from raw GitHub.
- KV-backed per-user + global daily rate limits; per-chat short history; webhook
  secret verification. Model `claude-haiku-4-5` (configurable).
- Pure glue (tool dispatch, rate limit, update parsing) unit-tested at the repo root;
  68 tests total. Deploy guide in `bot/SETUP.md`.
```

- [ ] **Step 4: Commit**

```bash
git add bot/SETUP.md docs/changelog/v0.7.md
git commit -m "docs(bot): setup guide + v0.7 changelog"
```

---

## Done criteria

- `npm test` green (68 tests) at the repo root, without bot dependencies installed
  (the tested modules don't import `@anthropic-ai/sdk`).
- `bot/` contains a deployable Worker: `tools.js`, `ratelimit.js`, `telegram.js`,
  `graph.js`, `claude.js`, `index.js`, `wrangler.toml`, `package.json`, `SETUP.md`.
- Routing logic is reused from `js/*` (not duplicated); only `record_feedback` writes.
- **User-run (not part of code verification):** `wrangler deploy` + webhook set →
  the bot answers a route question and DMs the owner on a feedback report.
```

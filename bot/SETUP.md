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
Model is `claude-haiku-4-5` (set the `CLAUDE_MODEL` var to change). Rate limits:
60/user/day, 200/day total (in `bot/src/ratelimit.js`). The daily cap bounds Claude
spend.

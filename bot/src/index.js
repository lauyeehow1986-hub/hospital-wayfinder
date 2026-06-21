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

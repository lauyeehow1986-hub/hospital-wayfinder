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

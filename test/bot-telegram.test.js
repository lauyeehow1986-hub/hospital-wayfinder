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

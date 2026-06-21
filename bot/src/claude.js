import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFS, dispatchTool } from './tools.js';

const SYSTEM = `You are a wayfinding assistant for the Outram hospital cluster (SGH, NHCS, NCC and their linkways) in Singapore. Help patients and visitors find their way — indoor, underground, and sheltered routes between landmarks, plus nearby amenities (toilets, food, charging, pharmacy, etc.).

How to work:
- To answer a "how do I get to" or "where is" question, first call search_nodes to turn place names into node ids, then call find_route, nearest_place, or places_near with those ids.
- Prefer sheltered or step-free routes when the user implies mobility needs, a wheelchair, or bad weather.
- Keep replies short and clear for someone walking with a phone: give the total time and the key steps.
- If a place can't be found, say so plainly and suggest a nearby landmark.
- If the user reports a problem (a route is wrong or closed, a place has moved), call record_feedback.`;

// history: clean [{ role, content: string }] turns. Returns { text, feedback }.
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

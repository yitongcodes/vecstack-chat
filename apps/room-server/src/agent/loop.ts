import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlock, Message } from '@vecstack/shared';
import type { Room } from '../room/hub.js';
import { getAgentsInRoom, insertMessage } from '../storage/repo.js';
import { buildContext, filterForAnthropic } from './context.js';
import { resolveTools, executeTool } from '../tools/index.js';

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;
const MAX_TOOL_ITERATIONS = 8;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');
  _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * Run one "turn" of the Claude agent in response to a trigger message.
 * Implements the tool-use loop:
 *   1. Call Anthropic with current context + tools
 *   2. If stop_reason is 'tool_use', execute tools and feed results back
 *   3. Otherwise, this is the final reply
 *
 * Every assistant turn (text or tool_use) is persisted and broadcast so the
 * room sees the agent's work as it happens.
 */
export async function runClaudeAgent(
  room: Room,
  agentId: string,
  triggerMessage: Message
): Promise<void> {
  // Load the agent's row to get its system prompt and enabled tools.
  const agents = await getAgentsInRoom(room.id);
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) {
    console.error('[loop] agent not found', agentId);
    return;
  }

  const messages = await buildContext(room.id, agent);
  const tools = resolveTools(agent.enabledTools);

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    let response: Anthropic.Message;
    try {
      response = await client().messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: agent.systemPrompt,
        messages,
        ...(tools.length > 0 ? { tools } : {}),
      });
    } catch (err: any) {
      console.error('[loop] anthropic error', err);
      const errMsg = await insertMessage({
        roomId: room.id,
        senderKind: 'agent',
        senderId: agentId,
        content: [{ type: 'text', text: `(error: ${err?.message ?? 'unknown'})` }],
        replyTo: triggerMessage.id,
      });
      room.broadcast({ type: 'message', message: errMsg });
      return;
    }

    // Persist and broadcast everything Claude produced this turn.
    const outContent = response.content as ContentBlock[];
    const persisted = await insertMessage({
      roomId: room.id,
      senderKind: 'agent',
      senderId: agentId,
      content: outContent,
      replyTo: iter === 0 ? triggerMessage.id : null,
    });
    room.broadcast({ type: 'message', message: persisted });

    // Add the assistant turn to local context for the next iteration.
    messages.push({ role: 'assistant', content: filterForAnthropic(outContent) });

    if (response.stop_reason !== 'tool_use') {
      // Final answer — done.
      return;
    }

    // Execute every tool_use block and collect tool_result blocks.
    const toolResults: ContentBlock[] = [];
    for (const block of outContent) {
      if (block.type !== 'tool_use') continue;
      try {
        const result = await executeTool(block.name, block.input, {
          roomId: room.id,
          agentId,
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      } catch (err: any) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Tool error: ${err?.message ?? 'unknown'}`,
          is_error: true,
        });
      }
    }

    // Persist & broadcast tool results as an agent message so the room sees
    // the agent's work (per AGENTS.md § "Tool results are public").
    const resultMsg = await insertMessage({
      roomId: room.id,
      senderKind: 'agent',
      senderId: agentId,
      content: toolResults,
    });
    room.broadcast({ type: 'message', message: resultMsg });

    // Feed results back to the model.
    messages.push({ role: 'user', content: filterForAnthropic(toolResults) });
  }

  // Hit iteration cap — surface to the room.
  const cap = await insertMessage({
    roomId: room.id,
    senderKind: 'agent',
    senderId: agentId,
    content: [{ type: 'text', text: '(hit tool iteration cap — stopping)' }],
  });
  room.broadcast({ type: 'message', message: cap });
}

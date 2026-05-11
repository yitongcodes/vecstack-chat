import type Anthropic from '@anthropic-ai/sdk';
import type { Agent, ContentBlock, Message } from '@vecstack/shared';
import { listParticipants, getRecentMessages } from '../storage/repo.js';

type AnthropicMessageParam = Anthropic.MessageParam;
// The SDK's MessageParam.content is `string | Array<...BlockParam>`. Extract the array form.
type AnthropicContentArray = Extract<Anthropic.MessageParam['content'], unknown[]>;

/**
 * Drop URL-source image blocks before passing content to Anthropic.
 * The SDK's ImageBlockParam only accepts base64 inline images; URL-source
 * images are a UI-only variant used for rendering tool results in the room.
 * TODO step 4: fetch and base64-encode URL images instead of dropping.
 */
export function filterForAnthropic(blocks: ContentBlock[]): AnthropicContentArray {
  return blocks.filter(
    (b) => !(b.type === 'image' && b.source.type === 'url')
  ) as AnthropicContentArray;
}

/**
 * Build the messages[] array passed to anthropic.messages.create.
 *
 * Design choices (see AGENTS.md):
 *  - Agents see the full public stream of the room.
 *  - Other participants' messages are flattened into "<Name>: <text>" within
 *    `user` turns, because Anthropic's chat schema only has user/assistant
 *    roles. The agent's own past messages are passed as `assistant` turns
 *    so its prior reasoning is in-character.
 *  - Tool-use and tool-result blocks from the agent's own past turns are
 *    preserved as-is (Claude needs to see its own tool history).
 */
export async function buildContext(
  roomId: string,
  agent: Agent,
  limit = 50
): Promise<AnthropicMessageParam[]> {
  const [history, participants] = await Promise.all([
    getRecentMessages(roomId, limit),
    listParticipants(roomId),
  ]);

  const nameById = new Map<string, string>();
  for (const p of participants) nameById.set(p.id, p.displayName);

  const out: AnthropicMessageParam[] = [];

  // Group consecutive non-self messages together as a single user turn so
  // we don't generate alternating empty turns. (Claude requires strict
  // user/assistant alternation.)
  let pendingUser: ContentBlock[] = [];

  const flushUser = () => {
    if (pendingUser.length > 0) {
      out.push({ role: 'user', content: filterForAnthropic(pendingUser) });
      pendingUser = [];
    }
  };

  for (const msg of history) {
    if (msg.senderId === agent.id && msg.senderKind === 'agent') {
      // The agent's own past message → assistant turn
      flushUser();
      out.push({ role: 'assistant', content: filterForAnthropic(msg.content) });
    } else {
      // Someone else's message → fold into the next user turn.
      // Prefix with the sender's display name so the agent knows who said what.
      const speaker = nameById.get(msg.senderId) ?? msg.senderKind;
      for (const block of msg.content) {
        if (block.type === 'text') {
          pendingUser.push({
            type: 'text',
            text: `${speaker}: ${block.text}`,
          });
        } else if (block.type === 'image') {
          // Pass through images as-is; they're visible to the agent.
          pendingUser.push(block);
        }
        // tool_use / tool_result from other agents are ignored — they are
        // not addressed to *this* agent's tool history.
      }
    }
  }

  flushUser();

  // The very last message must be a user turn for Anthropic to allow a
  // response. If history ends with the agent's own message (rare in
  // mention-only mode but defensive), append a stub.
  if (out.length === 0 || out[out.length - 1].role !== 'user') {
    out.push({ role: 'user', content: [{ type: 'text', text: '(continue)' }] });
  }

  return out;
}

// Helper kept here for symmetry with future per-message context needs.
export function isFromAgent(msg: Message, agentId: string): boolean {
  return msg.senderKind === 'agent' && msg.senderId === agentId;
}

import type { Message } from '@vecstack/shared';
import { contentToText } from '@vecstack/shared';
import type { Room } from '../room/hub.js';
import { insertMessage } from '../storage/repo.js';

/**
 * Hardcoded echo bot. When @-mentioned, it strips the mention and replies
 * with the remaining text. Exists to validate that an agent can be a
 * first-class room member with no LLM involved.
 */
export async function runEchoAgent(
  room: Room,
  agentId: string,
  triggerMessage: Message
): Promise<void> {
  const text = contentToText(triggerMessage.content);
  // Strip "@echo" and any leading whitespace
  const reply = text.replace(/@echo\b/gi, '').trim() || '(silence)';

  const out = await insertMessage({
    roomId: room.id,
    senderKind: 'agent',
    senderId: agentId,
    content: [{ type: 'text', text: reply }],
    replyTo: triggerMessage.id,
  });

  room.broadcast({ type: 'message', message: out });
}

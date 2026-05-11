/**
 * Shared types for VecStack Chat.
 *
 * Message.content uses the Anthropic ContentBlock shape directly so room
 * history can be passed straight to anthropic.messages.create without
 * any transformation.
 */

// ─── Anthropic ContentBlock (subset we use) ────────────────────────────────

export type TextBlock = {
  type: 'text';
  text: string;
};

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export type ImageBlock = {
  type: 'image';
  source:
    | { type: 'base64'; media_type: ImageMediaType; data: string }
    | { type: 'url'; url: string };
};

export type ToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
};

export type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock;

// ─── Domain types ──────────────────────────────────────────────────────────

export type SenderKind = 'human' | 'agent' | 'system';
export type Visibility = 'public' | 'private';

export interface Message {
  id: string;
  roomId: string;
  senderKind: SenderKind;
  senderId: string; // user_id or agent_id
  content: ContentBlock[];
  replyTo?: string | null;
  visibility: Visibility;
  recipientId?: string | null;
  createdAt: number; // unix ms
}

export interface User {
  id: string;
  displayName: string;
  email?: string | null;
}

export interface Agent {
  id: string;
  ownerId: string | null;
  name: string;          // the @handle, lowercase
  systemPrompt: string;
  enabledTools: string[];
  enabledSkills: string[];
}

export interface Room {
  id: string;
  name: string;
}

export interface Participant {
  kind: 'user' | 'agent';
  id: string;
  displayName: string;
}

// ─── WebSocket protocol ────────────────────────────────────────────────────
// All messages between browser and room-server use this envelope.

export type ClientToServer =
  | { type: 'join'; roomId: string; userId: string; displayName: string }
  | { type: 'send'; text: string; visibility?: Visibility; recipientId?: string }
  | { type: 'ping' };

export type ServerToClient =
  | { type: 'joined'; room: Room; participants: Participant[]; recent: Message[] }
  | { type: 'message'; message: Message }
  | { type: 'participant_joined'; participant: Participant }
  | { type: 'participant_left'; participantId: string }
  | { type: 'agent_thinking'; agentId: string; agentName: string }
  | { type: 'error'; code: string; detail?: string }
  | { type: 'pong' };

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Extract plain text from a ContentBlock[] for display / preview. */
export function contentToText(content: ContentBlock[]): string {
  return content
    .map((block) => {
      switch (block.type) {
        case 'text':
          return block.text;
        case 'image':
          return '[image]';
        case 'tool_use':
          return `[calling ${block.name}…]`;
        case 'tool_result':
          if (typeof block.content === 'string') return block.content;
          return contentToText(block.content);
        default:
          return '';
      }
    })
    .join('\n')
    .trim();
}

/** Parse `@name` mentions from a text string. Returns lowercased names. */
export function parseMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9_-]+)/g) ?? [];
  return matches.map((m) => m.slice(1).toLowerCase());
}

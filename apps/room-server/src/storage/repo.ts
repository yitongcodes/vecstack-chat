import { query } from './db.js';
import type {
  Agent,
  ContentBlock,
  Message,
  Participant,
  Room,
  SenderKind,
  Visibility,
} from '@vecstack/shared';

// ─── Rooms ─────────────────────────────────────────────────────────────────

export async function getOrCreateRoom(roomId: string, _name?: string): Promise<Room> {
  // rooms.id is TEXT, using the room name/slug directly as the primary key.
  const r = await query<{ id: string; name: string }>(
    `INSERT INTO rooms (id, name) VALUES ($1, $1)
       ON CONFLICT (id) DO UPDATE SET name = rooms.name
       RETURNING id, name`,
    [roomId]
  );
  // Auto-join the shared 'claude' and 'echo' agents to every room.
  await query(
    `INSERT INTO room_participants (room_id, agent_id)
       SELECT $1, a.id FROM agents a WHERE a.name IN ('claude', 'echo') AND a.owner_id IS NULL
       ON CONFLICT DO NOTHING`,
    [roomId]
  );
  return { id: r.rows[0].id, name: r.rows[0].name };
}

export async function ensureUserInRoom(roomId: string, userId: string): Promise<void> {
  await query(
    `INSERT INTO room_participants (room_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
    [roomId, userId]
  );
}

export async function listParticipants(roomId: string): Promise<Participant[]> {
  const users = await query<{ id: string; display_name: string }>(
    `SELECT u.id, u.display_name
       FROM room_participants rp
       JOIN users u ON u.id = rp.user_id
       WHERE rp.room_id = $1`,
    [roomId]
  );
  const agents = await query<{ id: string; name: string }>(
    `SELECT a.id, a.name
       FROM room_participants rp
       JOIN agents a ON a.id = rp.agent_id
       WHERE rp.room_id = $1`,
    [roomId]
  );
  return [
    ...users.rows.map((u): Participant => ({ kind: 'user', id: u.id, displayName: u.display_name })),
    ...agents.rows.map((a): Participant => ({ kind: 'agent', id: a.id, displayName: a.name })),
  ];
}

// ─── Users ─────────────────────────────────────────────────────────────────

export async function getOrCreateUser(userId: string, displayName: string): Promise<void> {
  await query(
    `INSERT INTO users (id, display_name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name`,
    [userId, displayName]
  );
}

// ─── Agents ────────────────────────────────────────────────────────────────

export async function getAgentsInRoom(roomId: string): Promise<Agent[]> {
  const r = await query<{
    id: string;
    owner_id: string | null;
    name: string;
    system_prompt: string;
    enabled_tools: string[];
    enabled_skills: string[];
  }>(
    `SELECT a.id, a.owner_id, a.name, a.system_prompt, a.enabled_tools, a.enabled_skills
       FROM room_participants rp
       JOIN agents a ON a.id = rp.agent_id
       WHERE rp.room_id = $1`,
    [roomId]
  );
  return r.rows.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    systemPrompt: row.system_prompt,
    enabledTools: row.enabled_tools,
    enabledSkills: row.enabled_skills,
  }));
}

// ─── Messages ──────────────────────────────────────────────────────────────

export async function insertMessage(args: {
  roomId: string;
  senderKind: SenderKind;
  senderId: string;
  content: ContentBlock[];
  replyTo?: string | null;
  visibility?: Visibility;
  recipientId?: string | null;
}): Promise<Message> {
  const r = await query<{
    id: string;
    room_id: string;
    sender_kind: SenderKind;
    sender_id: string;
    content: ContentBlock[];
    reply_to: string | null;
    visibility: Visibility;
    recipient_id: string | null;
    created_at: Date;
  }>(
    `INSERT INTO messages (room_id, sender_kind, sender_id, content, reply_to, visibility, recipient_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
       RETURNING id, room_id, sender_kind, sender_id, content, reply_to, visibility, recipient_id, created_at`,
    [
      args.roomId,
      args.senderKind,
      args.senderId,
      JSON.stringify(args.content),
      args.replyTo ?? null,
      args.visibility ?? 'public',
      args.recipientId ?? null,
    ]
  );
  const row = r.rows[0];
  return {
    id: row.id,
    roomId: row.room_id,
    senderKind: row.sender_kind,
    senderId: row.sender_id,
    content: row.content,
    replyTo: row.reply_to,
    visibility: row.visibility,
    recipientId: row.recipient_id,
    createdAt: row.created_at.getTime(),
  };
}

export async function getRecentMessages(roomId: string, limit = 50): Promise<Message[]> {
  const r = await query<{
    id: string;
    room_id: string;
    sender_kind: SenderKind;
    sender_id: string;
    content: ContentBlock[];
    reply_to: string | null;
    visibility: Visibility;
    recipient_id: string | null;
    created_at: Date;
  }>(
    `SELECT id, room_id, sender_kind, sender_id, content, reply_to, visibility, recipient_id, created_at
       FROM messages
       WHERE room_id = $1 AND visibility = 'public'
       ORDER BY created_at DESC
       LIMIT $2`,
    [roomId, limit]
  );
  return r.rows.reverse().map((row) => ({
    id: row.id,
    roomId: row.room_id,
    senderKind: row.sender_kind,
    senderId: row.sender_id,
    content: row.content,
    replyTo: row.reply_to,
    visibility: row.visibility,
    recipientId: row.recipient_id,
    createdAt: row.created_at.getTime(),
  }));
}

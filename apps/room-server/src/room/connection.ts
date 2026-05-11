import type { WebSocket } from 'ws';
import type { ClientToServer, Message, ServerToClient } from '@vecstack/shared';
import { contentToText, parseMentions } from '@vecstack/shared';
import { dropRoomIfEmpty, getRoom, type Room } from './hub.js';
import { dispatchToAgents } from './dispatcher.js';
import { ensureUserInRoom, getOrCreateUser, insertMessage } from '../storage/repo.js';

interface SessionState {
  ws: WebSocket;
  room?: Room;
  userId?: string;
  displayName?: string;
}

export function handleConnection(ws: WebSocket): void {
  const session: SessionState = { ws };

  ws.on('message', (raw) => {
    void handleClientMessage(session, raw.toString()).catch((err) => {
      console.error('[ws] error handling message', err);
      send(ws, { type: 'error', code: 'internal', detail: String(err?.message ?? err) });
    });
  });

  ws.on('close', () => {
    if (!session.room || !session.userId) return;
    const client = { ws, userId: session.userId, displayName: session.displayName ?? 'unknown' };
    const fullyLeft = session.room.removeClient(client);
    if (fullyLeft) {
      session.room.broadcast({ type: 'participant_left', participantId: session.userId });
    }
    dropRoomIfEmpty(session.room.id);
  });

  ws.on('error', (err) => {
    console.error('[ws] socket error', err);
  });
}

async function handleClientMessage(session: SessionState, raw: string): Promise<void> {
  let parsed: ClientToServer;
  try {
    parsed = JSON.parse(raw);
  } catch {
    send(session.ws, { type: 'error', code: 'bad_json' });
    return;
  }

  switch (parsed.type) {
    case 'ping':
      send(session.ws, { type: 'pong' });
      return;

    case 'join': {
      const { roomId, userId, displayName } = parsed;
      if (!roomId || !userId || !displayName) {
        send(session.ws, { type: 'error', code: 'bad_join' });
        return;
      }
      await getOrCreateUser(userId, displayName);
      await ensureUserInRoom(roomId, userId);

      const room = await getRoom(roomId);
      const client = { ws: session.ws, userId, displayName };
      room.addClient(client);
      session.room = room;
      session.userId = userId;
      session.displayName = displayName;

      const { participants, recent } = await room.getInitialState();
      send(session.ws, {
        type: 'joined',
        room: { id: room.id, name: room.name },
        participants,
        recent,
      });
      room.broadcast({
        type: 'participant_joined',
        participant: { kind: 'user', id: userId, displayName },
      });
      return;
    }

    case 'send': {
      if (!session.room || !session.userId) {
        send(session.ws, { type: 'error', code: 'not_joined' });
        return;
      }
      const text = parsed.text?.trim();
      if (!text) return;

      const message = await insertMessage({
        roomId: session.room.id,
        senderKind: 'human',
        senderId: session.userId,
        content: [{ type: 'text', text }],
        visibility: parsed.visibility ?? 'public',
        recipientId: parsed.recipientId ?? null,
      });

      // Broadcast public messages; route private ones to sender + recipient only.
      if (message.visibility === 'public') {
        session.room.broadcast({ type: 'message', message });
      } else {
        // Echo to sender so their UI shows it
        session.room.sendToUser(session.userId, { type: 'message', message });
        // (recipient routing for human-to-human DM is step 6+)
      }

      // Dispatch to any mentioned agents — fire and forget; the agent loop
      // will broadcast its own reply when ready.
      const mentions = parseMentions(contentToText(message.content));
      if (mentions.length > 0) {
        void dispatchToAgents(session.room, message, mentions).catch((err) => {
          console.error('[dispatch] error', err);
        });
      }
      return;
    }

    default:
      send(session.ws, { type: 'error', code: 'unknown_type' });
  }
}

function send(ws: WebSocket, msg: ServerToClient): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

// Make the unused-but-imported type explicit so tsc doesn't warn.
export type _Message = Message;

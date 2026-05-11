import type http from 'node:http';
import type { Visibility } from '@vecstack/shared';
import { contentToText, parseMentions } from '@vecstack/shared';
import { dropRoomIfEmpty, getRoom } from './hub.js';
import { dispatchToAgents } from './dispatcher.js';
import { ensureUserInRoom, getOrCreateUser, insertMessage } from '../storage/repo.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

/**
 * GET /api/room/events?roomId=X&userId=Y&displayName=Z
 * Opens an SSE stream; joins the room and pushes all future events.
 */
export async function handleSSEConnect(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost`);
  const roomId = url.searchParams.get('roomId') ?? '';
  const userId = url.searchParams.get('userId') ?? '';
  const displayName = url.searchParams.get('displayName') ?? '';

  if (!roomId || !userId || !displayName) {
    res.writeHead(400, { 'content-type': 'application/json', ...CORS });
    res.end(JSON.stringify({ error: 'roomId, userId, displayName required' }));
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
    ...CORS,
  });

  const send = (data: object) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch { /* closed */ }
  };

  try {
    await getOrCreateUser(userId, displayName);
    await ensureUserInRoom(roomId, userId);

    const room = await getRoom(roomId);
    const client = { res, userId, displayName };
    room.addClient(client);

    const { participants, recent } = await room.getInitialState();
    send({ type: 'joined', room: { id: room.id, name: room.name }, participants, recent });
    room.broadcast({ type: 'participant_joined', participant: { kind: 'user', id: userId, displayName } });

    // Keepalive comment every 25s (proxies drop idle SSE after ~30s)
    const heartbeat = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { clearInterval(heartbeat); }
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      const fullyLeft = room.removeClient(client);
      if (fullyLeft) room.broadcast({ type: 'participant_left', participantId: userId });
      dropRoomIfEmpty(room.id);
    });
  } catch (err: any) {
    console.error('[sse] join error', err);
    send({ type: 'error', code: 'internal', detail: String(err?.message ?? err) });
    res.end();
  }
}

/**
 * POST /api/room/send
 * Body: { roomId, userId, text, visibility?, recipientId? }
 */
export async function handleSendMessage(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;

  let parsed: { roomId?: string; userId?: string; text?: string; visibility?: string; recipientId?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'content-type': 'application/json', ...CORS });
    res.end(JSON.stringify({ error: 'invalid json' }));
    return;
  }

  const { roomId, userId, text, visibility = 'public', recipientId } = parsed;
  if (!roomId || !userId || !text?.trim()) {
    res.writeHead(400, { 'content-type': 'application/json', ...CORS });
    res.end(JSON.stringify({ error: 'roomId, userId, text required' }));
    return;
  }

  try {
    const room = await getRoom(roomId);
    const message = await insertMessage({
      roomId,
      senderKind: 'human',
      senderId: userId,
      content: [{ type: 'text', text: text.trim() }],
      visibility: visibility as Visibility,
      recipientId: recipientId ?? null,
    });

    if (message.visibility === 'public') {
      room.broadcast({ type: 'message', message });
    } else {
      room.sendToUser(userId, { type: 'message', message });
    }

    const mentions = parseMentions(contentToText(message.content));
    if (mentions.length > 0) {
      void dispatchToAgents(room, message, mentions).catch((err) => {
        console.error('[dispatch] error', err);
      });
    }

    res.writeHead(200, { 'content-type': 'application/json', ...CORS });
    res.end(JSON.stringify({ ok: true, messageId: message.id }));
  } catch (err: any) {
    console.error('[send] error', err);
    res.writeHead(500, { 'content-type': 'application/json', ...CORS });
    res.end(JSON.stringify({ error: err?.message ?? 'internal error' }));
  }
}

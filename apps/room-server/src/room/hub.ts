import type http from 'node:http';
import type { Agent, Message, Participant, ServerToClient } from '@vecstack/shared';
import {
  getAgentsInRoom,
  getOrCreateRoom,
  getRecentMessages,
  listParticipants,
} from '../storage/repo.js';

interface Client {
  res: http.ServerResponse;
  userId: string;
  displayName: string;
}

/**
 * A Room holds the in-memory state for an active chatroom: connected SSE
 * responses, cached agent list. Persistence is in Postgres; this is just
 * the live state for routing messages.
 */
export class Room {
  readonly id: string;
  readonly name: string;
  private clients = new Map<string, Set<Client>>(); // userId → set of SSE responses
  private agents: Agent[] = [];

  private constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  static async load(roomId: string): Promise<Room> {
    const r = await getOrCreateRoom(roomId);
    const room = new Room(r.id, r.name);
    room.agents = await getAgentsInRoom(roomId);
    return room;
  }

  async refreshAgents(): Promise<void> {
    this.agents = await getAgentsInRoom(this.id);
  }

  getAgents(): readonly Agent[] {
    return this.agents;
  }

  findAgentByName(name: string): Agent | undefined {
    const lower = name.toLowerCase();
    return this.agents.find((a) => a.name.toLowerCase() === lower);
  }

  addClient(client: Client): void {
    let set = this.clients.get(client.userId);
    if (!set) {
      set = new Set();
      this.clients.set(client.userId, set);
    }
    set.add(client);
  }

  removeClient(client: Client): boolean {
    const set = this.clients.get(client.userId);
    if (!set) return false;
    set.delete(client);
    if (set.size === 0) {
      this.clients.delete(client.userId);
      return true;
    }
    return false;
  }

  isEmpty(): boolean {
    return this.clients.size === 0;
  }

  broadcast(msg: ServerToClient): void {
    const payload = `data: ${JSON.stringify(msg)}\n\n`;
    for (const set of this.clients.values()) {
      for (const c of set) {
        try { c.res.write(payload); } catch { /* client disconnected */ }
      }
    }
  }

  sendToUser(userId: string, msg: ServerToClient): void {
    const set = this.clients.get(userId);
    if (!set) return;
    const payload = `data: ${JSON.stringify(msg)}\n\n`;
    for (const c of set) {
      try { c.res.write(payload); } catch { /* client disconnected */ }
    }
  }

  async getInitialState(): Promise<{ participants: Participant[]; recent: Message[] }> {
    const [participants, recent] = await Promise.all([
      listParticipants(this.id),
      getRecentMessages(this.id, 50),
    ]);
    return { participants, recent };
  }
}

// ─── Process-wide room registry ─────────────────────────────────────────────

const rooms = new Map<string, Room>();
const loading = new Map<string, Promise<Room>>();

export async function getRoom(roomId: string): Promise<Room> {
  const existing = rooms.get(roomId);
  if (existing) return existing;
  const inFlight = loading.get(roomId);
  if (inFlight) return inFlight;
  const p = Room.load(roomId).then((r) => {
    rooms.set(roomId, r);
    loading.delete(roomId);
    return r;
  });
  loading.set(roomId, p);
  return p;
}

export function dropRoomIfEmpty(roomId: string): void {
  const r = rooms.get(roomId);
  if (r && r.isEmpty()) rooms.delete(roomId);
}

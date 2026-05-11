import type { WebSocket } from 'ws';
import type { Agent, Message, Participant, ServerToClient } from '@vecstack/shared';
import {
  getAgentsInRoom,
  getOrCreateRoom,
  getRecentMessages,
  listParticipants,
} from '../storage/repo.js';

interface Client {
  ws: WebSocket;
  userId: string;
  displayName: string;
}

/**
 * A Room holds the in-memory state for an active chatroom: connected sockets,
 * cached agent list, and a small broadcast log. Persistence is in Postgres;
 * this is just the live state for routing messages.
 */
export class Room {
  readonly id: string;
  readonly name: string;
  private clients = new Map<string, Set<Client>>(); // userId -> set of sockets (a user can have multiple tabs open)
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

  /** Re-fetch agents from DB (call after a new agent joins). */
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
      return true; // user fully disconnected
    }
    return false;
  }

  isEmpty(): boolean {
    return this.clients.size === 0;
  }

  /** Broadcast a server→client envelope to every connected socket in the room. */
  broadcast(msg: ServerToClient): void {
    const json = JSON.stringify(msg);
    for (const set of this.clients.values()) {
      for (const c of set) {
        if (c.ws.readyState === c.ws.OPEN) {
          c.ws.send(json);
        }
      }
    }
  }

  /** Send only to a specific user's connections (used for private replies). */
  sendToUser(userId: string, msg: ServerToClient): void {
    const set = this.clients.get(userId);
    if (!set) return;
    const json = JSON.stringify(msg);
    for (const c of set) {
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(json);
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
// Rooms are loaded on first connection and dropped when the last client leaves.
// On Fly this single process is the authority for any room it has loaded.
// (Multi-process scale-out is step 8+: route by room_id to a specific machine.)

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

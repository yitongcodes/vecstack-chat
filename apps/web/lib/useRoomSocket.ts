'use client';

import { useEffect, useRef, useState } from 'react';
import type { ServerToClient } from '@vecstack/shared';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export interface UseRoomSocketArgs {
  roomId: string;
  userId: string;
  displayName: string;
}

// In local dev the room-server runs on a different port from Next.js.
// In production both are on the same origin, so we use window.location.origin.
function apiBase(): string {
  if (typeof window === 'undefined') return 'http://localhost:8080';
  return process.env.NEXT_PUBLIC_API_URL ?? window.location.origin;
}

export function useRoomSocket({ roomId, userId, displayName }: UseRoomSocketArgs) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [events, setEvents] = useState<ServerToClient[]>([]);
  // Keep stable refs so the send closure always has the latest values
  const roomIdRef = useRef(roomId);
  const userIdRef = useRef(userId);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  useEffect(() => {
    const base = apiBase();
    const params = new URLSearchParams({ roomId, userId, displayName });
    const es = new EventSource(`${base}/api/room/events?${params}`);

    es.onopen = () => setStatus('open');

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as ServerToClient;
        setEvents((prev) => [...prev, msg]);
      } catch (err) {
        console.error('[sse] bad payload', err);
      }
    };

    es.onerror = () => {
      setStatus('closed');
      // EventSource auto-reconnects; reflect that in the status briefly
      setTimeout(() => setStatus('connecting'), 0);
    };

    return () => {
      es.close();
      setStatus('closed');
    };
  }, [roomId, userId, displayName]);

  function send(text: string) {
    const base = apiBase();
    fetch(`${base}/api/room/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId: roomIdRef.current, userId: userIdRef.current, text }),
    }).catch((err) => console.error('[send]', err));
  }

  return { status, events, send };
}

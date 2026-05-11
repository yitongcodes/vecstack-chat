'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClientToServer, ServerToClient } from '@vecstack/shared';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export interface UseRoomSocketArgs {
  roomId: string;
  userId: string;
  displayName: string;
}

export function useRoomSocket({ roomId, userId, displayName }: UseRoomSocketArgs) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [events, setEvents] = useState<ServerToClient[]>([]);

  useEffect(() => {
    // In production the WS server is on the same host as the page.
    // In local dev, fall back to localhost:8080.
    const url =
      process.env.NEXT_PUBLIC_WS_URL ??
      (typeof window !== 'undefined'
        ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
        : 'ws://localhost:8080');
    const ws = new WebSocket(`${url}/ws`);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      setStatus('open');
      const join: ClientToServer = { type: 'join', roomId, userId, displayName };
      ws.send(JSON.stringify(join));
    });

    ws.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data) as ServerToClient;
        setEvents((prev) => [...prev, msg]);
      } catch (err) {
        console.error('bad WS payload', err);
      }
    });

    ws.addEventListener('close', () => setStatus('closed'));
    ws.addEventListener('error', () => setStatus('closed'));

    // Simple keepalive ping every 30s
    const ping = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, 30_000);

    return () => {
      clearInterval(ping);
      ws.close();
    };
  }, [roomId, userId, displayName]);

  function send(text: string) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== ws.OPEN) return;
    const out: ClientToServer = { type: 'send', text };
    ws.send(JSON.stringify(out));
  }

  return { status, events, send };
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'u-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [room, setRoom] = useState('main');

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('vc.name') : null;
    if (stored) setName(stored);
  }, []);

  function enter() {
    if (!name.trim()) return;
    localStorage.setItem('vc.name', name.trim());
    let userId = localStorage.getItem('vc.userId');
    if (!userId) {
      userId = uuid();
      localStorage.setItem('vc.userId', userId);
    }
    router.push(`/room/${encodeURIComponent(room.trim() || 'main')}`);
  }

  return (
    <main className="page">
      <h1 className="title">VecStack Chat</h1>
      <p className="subtitle">A chatroom where you and your agent are both in the room.</p>

      <div className="col" style={{ maxWidth: 400 }}>
        <label className="col">
          <span>Your name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Yitong"
            autoFocus
          />
        </label>
        <label className="col">
          <span>Room</span>
          <input
            className="input"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="main"
          />
        </label>
        <button className="btn" onClick={enter} disabled={!name.trim()}>
          Enter room
        </button>
        <p className="status">
          Try typing <code>@claude hello</code> in the room, or <code>@echo test</code> for the
          hardcoded bot.
        </p>
      </div>
    </main>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Message, Participant } from '@vecstack/shared';
import { useRoomSocket } from '../../../lib/useRoomSocket';
import { MessageBubble } from '../../../components/MessageBubble';
import { QrModal } from '../../../components/QrModal';

export default function RoomClient() {
  const params = useParams<{ id: string }>();
  const roomId = decodeURIComponent(params.id);

  const [identity, setIdentity] = useState<{ userId: string; displayName: string } | null>(null);

  useEffect(() => {
    const displayName = localStorage.getItem('vc.name');
    let userId = localStorage.getItem('vc.userId');
    if (!displayName) {
      window.location.href = '/';
      return;
    }
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem('vc.userId', userId);
    }
    setIdentity({ userId, displayName });
  }, []);

  if (!identity) return <main className="page">Loading…</main>;

  return <Chat roomId={roomId} userId={identity.userId} displayName={identity.displayName} />;
}

function Chat({
  roomId,
  userId,
  displayName,
}: {
  roomId: string;
  userId: string;
  displayName: string;
}) {
  const { status, events, send } = useRoomSocket({ roomId, userId, displayName });
  const [text, setText] = useState('');
  const [showQr, setShowQr] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, participants, thinkingAgents } = useMemo(() => {
    const msgs: Message[] = [];
    let parts: Participant[] = [];
    const thinking = new Set<string>();
    for (const e of events) {
      if (e.type === 'joined') {
        parts = e.participants;
        msgs.push(...e.recent);
      } else if (e.type === 'message') {
        msgs.push(e.message);
        if (e.message.senderKind === 'agent') thinking.delete(e.message.senderId);
      } else if (e.type === 'participant_joined') {
        if (!parts.find((p) => p.id === e.participant.id)) parts = [...parts, e.participant];
      } else if (e.type === 'participant_left') {
        parts = parts.filter((p) => p.id !== e.participantId);
      } else if (e.type === 'agent_thinking') {
        thinking.add(e.agentId);
      }
    }
    return { messages: msgs, participants: parts, thinkingAgents: thinking };
  }, [events]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of participants) m.set(p.id, p.displayName);
    return m;
  }, [participants]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, thinkingAgents.size]);

  function onSend() {
    if (!text.trim()) return;
    send(text);
    setText('');
  }

  const thinkingNames = [...thinkingAgents]
    .map((id) => nameById.get(id) ?? 'agent')
    .filter(Boolean);

  return (
    <main className="page">
      {showQr && (
        <QrModal
          url={typeof window !== 'undefined' ? window.location.href : ''}
          onClose={() => setShowQr(false)}
        />
      )}

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 className="title" style={{ margin: 0 }}>
          # {roomId}
        </h1>
        <div className="row" style={{ gap: 12 }}>
          <button
            className="btn"
            style={{ padding: '6px 12px', fontSize: 13 }}
            onClick={() => setShowQr(true)}
          >
            Share QR
          </button>
          <span className="status">
            {status === 'open' ? '● connected' : status === 'connecting' ? '○ connecting' : '✕ disconnected'}
            {' · '}you are <strong>{displayName}</strong>
          </span>
        </div>
      </div>

      <div className="chat">
        <aside className="sidebar">
          <h3>In this room</h3>
          {participants.map((p) => (
            <div key={p.id} className={`participant ${p.kind}`}>
              <span className="dot" />
              {p.displayName}
              {p.kind === 'agent' && <span style={{ color: '#888' }}>(agent)</span>}
            </div>
          ))}
        </aside>

        <section className="main">
          <div className="messages">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                who={nameById.get(m.senderId) ?? (m.senderKind === 'agent' ? 'agent' : 'unknown')}
                isAgent={m.senderKind === 'agent'}
                content={m.content}
              />
            ))}
            {thinkingNames.length > 0 && (
              <div className="thinking">{thinkingNames.join(', ')} is thinking…</div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="composer">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="Message — try @claude or @echo"
              autoFocus
            />
            <button className="btn" onClick={onSend} disabled={!text.trim()}>
              Send
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

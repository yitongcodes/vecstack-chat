'use client';

import { useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';

interface Props {
  url: string;
  onClose: () => void;
}

export function QrModal({ url, onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: '28px 32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        maxWidth: 320,
        width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Join this room</h2>
        <p style={{ margin: 0, fontSize: 13, color: '#6f6f68', textAlign: 'center' }}>
          Scan to open in a browser, or copy the link below.
        </p>
        <div style={{ padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #e6e4dc' }}>
          <QRCode value={url} size={200} />
        </div>
        <input
          readOnly
          value={url}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          style={{
            width: '100%',
            padding: '8px 10px',
            border: '1px solid #e6e4dc',
            borderRadius: 8,
            fontSize: 12,
            color: '#444',
            background: '#fafaf7',
            cursor: 'pointer',
          }}
        />
        <button
          onClick={onClose}
          style={{
            padding: '8px 20px',
            background: '#7b5cd6',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontWeight: 500,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

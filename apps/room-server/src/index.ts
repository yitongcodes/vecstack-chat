import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initPool } from './storage/db.js';
import { handleSSEConnect, handleSendMessage } from './room/connection.js';

const PORT = Number(process.env.PORT ?? 8080);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.resolve(__dirname, '../../web/out');
const HAS_STATIC = fs.existsSync(STATIC_DIR);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  // Decode %5B → [ etc. so Next.js chunks in [id] directories resolve correctly.
  let urlPath: string;
  try { urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]); }
  catch { urlPath = (req.url ?? '/').split('?')[0]; }
  const candidates = [
    path.join(STATIC_DIR, urlPath),
    path.join(STATIC_DIR, urlPath, 'index.html'),
    path.join(STATIC_DIR, urlPath + '.html'),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }
  // SPA fallback — let the client-side router handle unknown paths
  const index = path.join(STATIC_DIR, 'index.html');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(index).pipe(res);
}

async function main() {
  await initPool();
  console.log('[boot] db pool initialized');
  if (HAS_STATIC) console.log(`[boot] serving static files from ${STATIC_DIR}`);

  const server = http.createServer((req, res) => {
    const pathname = (req.url ?? '/').split('?')[0];

    if (pathname === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }

    // SSE stream — client subscribes here to receive all room events
    if (pathname === '/api/room/events' && req.method === 'GET') {
      void handleSSEConnect(req, res).catch((err) => {
        console.error('[sse] unhandled error', err);
        if (!res.headersSent) { res.writeHead(500); res.end(); }
      });
      return;
    }

    // POST — client sends messages here
    if (pathname === '/api/room/send' && (req.method === 'POST' || req.method === 'OPTIONS')) {
      void handleSendMessage(req, res).catch((err) => {
        console.error('[send] unhandled error', err);
        if (!res.headersSent) { res.writeHead(500); res.end(); }
      });
      return;
    }

    if (HAS_STATIC) {
      serveStatic(req, res);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[boot] room-server listening on :${PORT}`);
  });

  const shutdown = () => {
    console.log('[shutdown] closing server');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 9000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});

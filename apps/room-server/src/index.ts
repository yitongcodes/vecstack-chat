import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { handleConnection } from './room/connection.js';
import { initPool } from './storage/db.js';

const PORT = Number(process.env.PORT ?? 8080);

// In production the Next.js static export lives two directories up from dist/.
// In local dev this path won't exist, and we simply skip static serving
// (Next.js dev server handles it on its own port).
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
  const urlPath = (req.url ?? '/').split('?')[0];
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
  // SPA fallback: serve index.html so client-side router handles the path.
  const index = path.join(STATIC_DIR, 'index.html');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(index).pipe(res);
}

async function main() {
  // Verify DB connectivity early — fail loudly if misconfigured.
  await initPool();
  console.log('[boot] db pool initialized');
  if (HAS_STATIC) console.log(`[boot] serving static files from ${STATIC_DIR}`);

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (HAS_STATIC) {
      serveStatic(req, res);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', handleConnection);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[boot] room-server listening on :${PORT}`);
  });

  // Graceful shutdown — Fly sends SIGTERM on deploys
  const shutdown = () => {
    console.log('[shutdown] closing server');
    wss.close();
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

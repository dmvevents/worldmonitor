#!/usr/bin/env node
/**
 * Production front door for the self-hosted hub: serves the built SPA from dist/
 * and reverse-proxies /api/* to the local API server (src-tauri/sidecar/
 * local-api-server.mjs running in docker mode). Mirrors docker/nginx.conf.template
 * (index dashboard.html, SPA fallback, long-cache assets, /api proxy) with only
 * node:http so the hub needs neither Docker nor nginx on this Mac.
 *
 *   node scripts/tt-hub-server.mjs                 # :3100 → dist/, API on 127.0.0.1:46123
 *   HUB_PORT=3200 SIDECAR_PORT=46123 DIST_DIR=dist node scripts/tt-hub-server.mjs
 */
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(process.env.DIST_DIR || path.join(ROOT, 'dist'));
const PORT = Number(process.env.HUB_PORT || 3100);
const HOST = process.env.HUB_HOST || '127.0.0.1';
const SIDECAR_PORT = Number(process.env.SIDECAR_PORT || process.env.LOCAL_API_PORT || 46123);
const SIDECAR_TOKEN = process.env.LOCAL_API_TOKEN || ''; // sidecar default-denies without it (docker nginx injects the same header)
const OPERATOR_KEY = process.env.WM_LOCAL_OPERATOR_KEY || ''; // enterprise key for this instance: unlocks Pro-gated routes for the local user

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
  '.map': 'application/json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.xml': 'application/xml',
  '.geojson': 'application/geo+json', '.pbf': 'application/x-protobuf', '.onnx': 'application/octet-stream', '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm',
};
const LONG_CACHE = /^\/(assets|pro\/assets|map-styles|textures|favico)\//;
const NO_CACHE = new Set(['/sw.js', '/manifest.webmanifest', '/offline.html', '/dashboard.html', '/index.html']);

function sendFile(res, filePath, reqPath, head = false) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = statSync(filePath);
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': LONG_CACHE.test(reqPath) ? 'public, max-age=31536000, immutable' : NO_CACHE.has(reqPath) || ext === '.html' ? 'no-cache' : 'public, max-age=300',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
  };
  if (ext === '.html' && OPERATOR_KEY) {
    // Unlock the Pro-tier panels for the local user: the SPA treats a readable
    // `wm-pro-key` cookie as a legacy Pro key, flips its Pro state, exchanges it
    // for an HttpOnly session via POST /api/wm-session (validated against
    // WORLDMONITOR_VALID_KEYS) and clears this cookie. Same key the proxy sends.
    headers['set-cookie'] = `wm-pro-key=${encodeURIComponent(OPERATOR_KEY)}; Path=/; Max-Age=600; SameSite=Lax`;
  }
  res.writeHead(200, headers);
  if (head) return res.end();
  createReadStream(filePath).pipe(res);
}

function resolveStatic(pathname) {
  const decoded = decodeURIComponent(pathname.split('?')[0]);
  if (decoded.includes('\0')) return null;
  const rel = decoded.replace(/^\/+/, '');
  if (decoded === '/' ) return path.join(DIST, 'dashboard.html');
  if (decoded === '/embed') return path.join(DIST, 'embed.html');
  if (decoded === '/pro' || decoded === '/pro/') return path.join(DIST, 'pro', 'index.html');
  const candidate = path.resolve(DIST, rel);
  if (!candidate.startsWith(DIST + path.sep) && candidate !== DIST) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    const idx = path.join(candidate, 'index.html');
    if (existsSync(idx)) return idx;
  }
  if (decoded.startsWith('/pro/')) return path.join(DIST, 'pro', 'index.html');
  if (LONG_CACHE.test(decoded) || path.extname(decoded)) return null; // real 404 for missing assets
  return path.join(DIST, 'dashboard.html'); // SPA fallback (nginx: try_files $uri $uri/ /dashboard.html)
}

function proxyApi(req, res) {
  const clientIp = req.socket?.remoteAddress || '127.0.0.1';
  const headers = { ...req.headers, host: `127.0.0.1:${SIDECAR_PORT}`, 'x-forwarded-host': req.headers.host || `${HOST}:${PORT}`, 'x-forwarded-proto': 'http', 'x-forwarded-for': clientIp, 'x-real-ip': clientIp };
  if (SIDECAR_TOKEN) headers.authorization = `Bearer ${SIDECAR_TOKEN}`;
  if (OPERATOR_KEY && !headers['x-worldmonitor-key']) headers['x-worldmonitor-key'] = OPERATOR_KEY;
  const upstream = http.request({ host: '127.0.0.1', port: SIDECAR_PORT, method: req.method, path: req.url, headers }, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  upstream.on('error', (err) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'local API unavailable', detail: err.message }));
  });
  req.pipe(upstream);
}

// The sidecar only knows /api/youtube/live as a cloud-relay route (503 in self-hosted mode), so the
// front door runs the edge handler itself: api/youtube/live.js resolves @handle → live videoId /
// hlsUrl / latestVideoId straight from youtube.com, which is what the Live News panel needs.
let youtubeLiveHandler = null;
async function serveYoutubeLive(req, res, url) {
  try {
    if (!youtubeLiveHandler) youtubeLiveHandler = (await import(path.join(ROOT, 'api', 'youtube', 'live.js'))).default;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const request = new Request(`http://${HOST}:${PORT}${url.pathname}${url.search}`, { method: 'GET', headers });
    const response = await youtubeLiveHandler(request);
    const out = {};
    response.headers.forEach((v, k) => { if (k !== 'content-encoding' && k !== 'transfer-encoding') out[k] = v; });
    res.writeHead(response.status, out);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'youtube live resolver failed', detail: String(err?.message || err).slice(0, 200) }));
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/youtube/live') return void serveYoutubeLive(req, res, url);
  if (url.pathname.startsWith('/api/')) return proxyApi(req, res);
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, dist: existsSync(path.join(DIST, 'dashboard.html')), sidecarPort: SIDECAR_PORT })); }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let filePath;
  try { filePath = resolveStatic(url.pathname); } catch { filePath = null; }
  if (!filePath || !existsSync(filePath)) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
  sendFile(res, filePath, url.pathname, req.method === 'HEAD');
});

if (!existsSync(path.join(DIST, 'dashboard.html'))) {
  console.error(`[hub-server] ${DIST}/dashboard.html missing — run \`npm run build:full\` first`);
  process.exit(1);
}
server.listen(PORT, HOST, () => console.error(`[hub-server] http://${HOST}:${PORT}/dashboard → ${DIST}; /api/* → 127.0.0.1:${SIDECAR_PORT}`));

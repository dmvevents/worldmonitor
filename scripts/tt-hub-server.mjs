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
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
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
// Same-origin HLS proxy for directory entries flagged needsProxy (manifest reachable but no CORS
// header). Closed allowlist: only hostnames present in public/data/iptv-directory.json, https only,
// no header spoofing — it changes the fetching origin, not the network location (geo-blocks stay).
let iptvHosts = null;
let iptvHostsLoadedAt = 0;
function loadIptvHosts() {
  if (iptvHosts && Date.now() - iptvHostsLoadedAt < 60_000) return iptvHosts;
  try {
    const dir = JSON.parse(readFileSync(path.join(DIST, 'data', 'iptv-directory.json'), 'utf8'));
    iptvHosts = new Set((dir.channels || []).map((c) => { try { return new URL(c.hlsUrl).hostname; } catch { return null; } }).filter(Boolean));
  } catch { iptvHosts = iptvHosts || new Set(); }
  iptvHostsLoadedAt = Date.now();
  return iptvHosts;
}
const IPTV_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
function proxiedUrl(absolute) { return `/api/iptv-proxy?url=${encodeURIComponent(absolute)}`; }
async function serveIptvProxy(res, url) {
  const target = url.searchParams.get('url') || '';
  let upstream;
  try { upstream = new URL(target); } catch { res.writeHead(400); return res.end('bad url'); }
  if (upstream.protocol !== 'https:' || !loadIptvHosts().has(upstream.hostname)) { res.writeHead(403, { 'content-type': 'text/plain' }); return res.end('host not in IPTV directory'); }
  try {
    const r = await fetch(upstream, { headers: { 'User-Agent': IPTV_UA, Accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    const ct = r.headers.get('content-type') || '';
    const isManifest = /mpegurl/i.test(ct) || /\.m3u8(\?|$)/i.test(upstream.pathname);
    if (!r.ok) { res.writeHead(r.status, { 'content-type': 'text/plain' }); return res.end(`upstream ${r.status}`); }
    if (isManifest) {
      const text = await r.text();
      const base = new URL(r.url || upstream);
      const rewritten = text.split('\n').map((line) => {
        const l = line.trim();
        if (!l) return line;
        if (l.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${proxiedUrl(new URL(u, base).toString())}"`);
        try { return proxiedUrl(new URL(l, base).toString()); } catch { return line; }
      }).join('\n');
      res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-store' });
      return res.end(rewritten);
    }
    const headers = { 'content-type': ct || 'application/octet-stream', 'cache-control': 'no-store' };
    const len = r.headers.get('content-length'); if (len) headers['content-length'] = len;
    res.writeHead(200, headers);
    const { Readable } = await import('node:stream');
    const body = Readable.fromWeb(r.body);
    // An upstream stall or the 20 s abort must end this response, never the process:
    // an unhandled 'error' on the Readable took the front door down once (launchd restarted it).
    body.on('error', () => { if (!res.destroyed) res.destroy(); });
    res.on('close', () => body.destroy());
    body.pipe(res);
  } catch (err) {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`iptv proxy error: ${String(err?.message || err).slice(0, 160)}`);
  }
}

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
  if (url.pathname === '/api/iptv-proxy') return void serveIptvProxy(res, url);
  if (url.pathname.startsWith('/api/')) return proxyApi(req, res);
  if (url.pathname === '/healthz') { let egress = null; try { if (process.env.NODE_USE_ENV_PROXY === '1' && process.env.HTTPS_PROXY) egress = new URL(process.env.HTTPS_PROXY).host; } catch {} res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, dist: existsSync(path.join(DIST, 'dashboard.html')), sidecarPort: SIDECAR_PORT, iptvEgress: egress })); }
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

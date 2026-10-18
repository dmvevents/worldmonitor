#!/usr/bin/env node
/**
 * Minimal HTTP forward proxy (CONNECT for https, plain forwarding for http) for the hub's
 * IPTV egress. Run it on a machine whose network exit is in the broadcaster's licensed region
 * (your own VPS, a box at a relative's home) and reach it over an SSH tunnel:
 *
 *   remote$ node tt-egress-proxy.mjs                     # 127.0.0.1:8888, loopback only
 *   local$  ssh -N -L 8888:127.0.0.1:8888 user@remote    # or scripts/tt-install-egress-tunnel.sh
 *   keys.env: IPTV_EGRESS_PROXY=http://127.0.0.1:8888    # then restart the hub service
 *
 * Node ≥ 18, no dependencies. Binds loopback by default so only the tunnel can use it; set
 * EGRESS_BIND=0.0.0.0 only behind a firewall you control. EGRESS_ALLOW=host1,host2 limits the
 * destinations (suffix match), e.g. the stream hosts you actually need. Logs host:port only.
 */
import http from 'node:http';
import net from 'node:net';

const PORT = Number(process.env.EGRESS_PORT || 8888);
const BIND = process.env.EGRESS_BIND || '127.0.0.1';
const ALLOW = (process.env.EGRESS_ALLOW || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const allowed = (host) => !ALLOW.length || ALLOW.some((a) => host === a || host.endsWith(`.${a}`));
const log = (msg) => console.error(`[egress ${new Date().toISOString()}] ${msg}`);

const server = http.createServer((req, res) => {
  let target;
  try { target = new URL(req.url); } catch { res.writeHead(400); return res.end('absolute http URL required'); }
  if (target.protocol !== 'http:' || !allowed(target.hostname.toLowerCase())) { res.writeHead(403); return res.end('forbidden'); }
  const headers = { ...req.headers, host: target.host };
  delete headers['proxy-connection']; delete headers['proxy-authorization'];
  const up = http.request({ host: target.hostname, port: target.port || 80, path: `${target.pathname}${target.search}`, method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode || 502, r.headers);
    r.pipe(res);
  });
  up.on('error', (err) => { log(`http ${target.host} error ${err.code || err.message}`); if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(up);
  log(`GET ${target.host}`);
});

server.on('connect', (req, socket, head) => {
  const idx = req.url.lastIndexOf(':');
  const host = (idx > 0 ? req.url.slice(0, idx) : req.url).replace(/^\[|\]$/g, '').toLowerCase();
  const port = Number(idx > 0 ? req.url.slice(idx + 1) : 443) || 443;
  if (!allowed(host)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  const up = net.connect(port, host, () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head?.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  const drop = () => { up.destroy(); socket.destroy(); };
  up.on('error', (err) => { log(`CONNECT ${host}:${port} error ${err.code || err.message}`); drop(); });
  socket.on('error', drop);
  up.on('close', () => socket.destroy());
  socket.on('close', () => up.destroy());
  up.setTimeout(120_000, drop);
  log(`CONNECT ${host}:${port}`);
});

server.on('clientError', (_err, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); });
server.listen(PORT, BIND, () => log(`listening on http://${BIND}:${PORT} (allow: ${ALLOW.length ? ALLOW.join(', ') : 'any host'})`));

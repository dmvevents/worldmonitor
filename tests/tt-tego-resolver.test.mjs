import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTegoStream, listTegoChannels, tokenExpiryMs, getGuestToken, _resetTegoCaches } from '../scripts/tt-tego-resolver.mjs';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (exp) => `${b64({ alg: 'none' })}.${b64({ exp, name: 'guestuser' })}.sig`;
const nowSec = () => Math.floor(Date.now() / 1000);
const streamUrl = (id, expSec) => `https://tego-cdn1a.sibercdn.com/Live_TV-X-${id}/index.m3u8?token=abc-${expSec}-${nowSec()}`;

function fakeFetch(log, { tokenExp = nowSec() + 86_400, streamExp = nowSec() + 86_400, fail = false } = {}) {
  return async (url, init) => {
    log.push({ url: String(url), auth: init?.headers?.Authorization });
    const u = new URL(url);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (u.hostname === 'api.siberapi.com') return json({ status: 200, access_token: jwt(tokenExp) });
    if (!init?.headers?.Authorization?.startsWith('Bearer ')) return json({ response: { account: { status: 401 } } });
    if (fail) return json({}, 502);
    const m = /\/Channels\/(\d+)$/.exec(u.pathname);
    if (m) return json({ response: { account: { status: 200 }, tv_channel: [{ id: m[1], caption: `Station ${m[1]}`, channel_status: true, streaming_url: streamUrl(m[1], streamExp) }] } });
    const c = /\/Channels\/Category\/(\d+)$/.exec(u.pathname);
    if (c) return json({ response: { account: { status: 200 }, tv_channel: c[1] === '36' ? [{ id: '1', caption: 'TTT' }] : [{ id: '1', caption: 'TTT' }, { id: '2', caption: 'Synergy TV' }] } });
    return json({}, 404);
  };
}

describe('tt-tego-resolver', () => {
  beforeEach(() => _resetTegoCaches());

  it('parses the Flussonic token expiry', () => {
    assert.equal(tokenExpiryMs('https://x/index.m3u8?token=abc-1792430980-1792344580'), 1792430980 * 1000);
    assert.equal(tokenExpiryMs('https://x/index.m3u8'), 0);
  });

  it('resolves a channel through guest token → middleware and caches the result', async () => {
    const log = [];
    const f = fakeFetch(log);
    const a = await resolveTegoStream(1, { fetchImpl: f });
    assert.match(a.url, /^https:\/\/tego-cdn1a\.sibercdn\.com\/.*token=/);
    assert.equal(a.name, 'Station 1');
    assert.ok(a.exp > Date.now());
    assert.equal(log.length, 2, 'one SSO call + one Channels call');
    const b = await resolveTegoStream('1', { fetchImpl: f });
    assert.equal(b.url, a.url);
    assert.equal(log.length, 2, 'second resolve served from cache');
    await resolveTegoStream(1, { fetchImpl: f, force: true });
    assert.equal(log.length, 3, 'force re-resolves without a new token');
  });

  it('re-resolves when the stream token is close to expiry', async () => {
    const log = [];
    await resolveTegoStream(2, { fetchImpl: fakeFetch(log, { streamExp: nowSec() + 60 }) });
    await resolveTegoStream(2, { fetchImpl: fakeFetch(log) });
    assert.equal(log.filter((l) => l.url.includes('/Channels/2')).length, 2);
  });

  it('rejects bad channel ids and non-sibercdn stream hosts', async () => {
    await assert.rejects(resolveTegoStream('1; drop', { fetchImpl: fakeFetch([]) }), /bad channel id/);
    const evil = async (url, init) => new URL(url).hostname === 'api.siberapi.com'
      ? new Response(JSON.stringify({ access_token: jwt(nowSec() + 3600) }))
      : new Response(JSON.stringify({ response: { tv_channel: [{ id: '5', streaming_url: 'https://evil.example/x.m3u8' }] } }));
    await assert.rejects(resolveTegoStream(5, { fetchImpl: evil }), /no stream/);
  });

  it('propagates middleware failures and shares in-flight requests', async () => {
    const log = [];
    const f = fakeFetch(log, { fail: true });
    const results = await Promise.allSettled([resolveTegoStream(3, { fetchImpl: f }), resolveTegoStream(3, { fetchImpl: f })]);
    assert.ok(results.every((r) => r.status === 'rejected'));
    assert.equal(log.filter((l) => l.url.includes('/Channels/3')).length, 1, 'concurrent callers coalesced');
  });

  it('reuses the guest token until near expiry', async () => {
    const log = [];
    const f = fakeFetch(log);
    const t1 = await getGuestToken(f);
    const t2 = await getGuestToken(f);
    assert.equal(t1, t2);
    assert.equal(log.length, 1);
  });

  it('lists the T&T categories without duplicates and without stream urls', async () => {
    const list = await listTegoChannels({ fetchImpl: fakeFetch([]) });
    assert.deepEqual(list.map((c) => c.id), ['1', '2']);
    assert.equal(list[0].streamingUrl, undefined);
  });
});

#!/usr/bin/env node
/**
 * Record the "World Monitor over Trinidad" demo segment from a fresh browser profile.
 *
 *   node scripts/tt-demo-segc.mjs [--out ~/sessions/2026-10-19/demo] [--url http://127.0.0.1:3100/dashboard]
 *
 * Choreography (≈75 s): load → Trinidad & Tobago tab → live TV strip (TegoTV) → scroll the
 * T&T lenses → ask the WM Analyst about today's top T&T story → back to the map, time filter.
 * Writes <out>/raw/*.webm (Playwright recordVideo), <out>/shots/segC_*.png and a JSON log of
 * what was on screen; the caller converts to MP4 with ffmpeg. Read-only against the hub.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, renameSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const OUT = opt('--out', path.join(os.homedir(), 'sessions/2026-10-19/demo')).replace(/^~/, os.homedir());
const URL = opt('--url', 'http://127.0.0.1:3100/dashboard');
const QUESTION = opt('--question', "What is the most significant Trinidad and Tobago story today, and why does it matter?");
const RAW = path.join(OUT, 'raw');
const SHOTS = path.join(OUT, 'shots');
for (const d of [RAW, SHOTS]) mkdirSync(d, { recursive: true });

const log = [];
const t0 = Date.now();
const note = (step, data = {}) => { const e = { t: +((Date.now() - t0) / 1000).toFixed(1), step, ...data }; log.push(e); console.log(JSON.stringify(e)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--enable-unsafe-swiftshader', '--mute-audio'],
});
// Warm pass (not recorded): load the T&T tab once and scroll every lens so the hub's RSS
// proxy and digest caches are hot before the recorded take.
if (!args.includes('--no-warm')) {
  const warm = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const wp = await warm.newPage();
  await wp.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(6000);
  await wp.evaluate(() => Array.from(document.querySelectorAll('.dashboard-tab-label')).find((b) => /trinidad/i.test(b.textContent || ''))?.click());
  await sleep(5000);
  const keys = await wp.evaluate(() => Array.from(document.querySelectorAll('[data-panel]')).map((e) => e.getAttribute('data-panel')));
  for (const k of keys) { await wp.evaluate((key) => document.querySelector(`[data-panel="${key}"]`)?.scrollIntoView({ block: 'start' }), k); await sleep(700); }
  await sleep(4000);
  note('warm_done', { panels: keys.length });
  await warm.close();
}

// Chrome's headless screencast drops an ~87 px window inset and pads the frame grey, so a 1080 px
// viewport records as 993 rows of page + band. A 1167 px viewport fills the 1920x1080 frame
// (measured 2026-10-19 with a pixel-column probe; see docs/tt/WORKLOG.md round 19).
const context = await browser.newContext({
  viewport: { width: 1920, height: 1167 },
  deviceScaleFactor: 1,
  recordVideo: { dir: RAW, size: { width: 1920, height: 1080 } },
  locale: 'en-US',
  timezoneId: 'America/Port_of_Spain',
});
const page = await context.newPage();
note('record_start');
page.on('pageerror', (e) => note('pageerror', { message: String(e.message).slice(0, 200) }));

const shot = async (name) => { await page.screenshot({ path: path.join(SHOTS, `segC_${name}.png`) }); };
const count = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
const waitFor = async (fn, label, timeoutMs = 20_000, every = 500) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { const v = await fn(); if (v) return v; await sleep(every); }
  note('timeout', { label }); return null;
};
const scrollTo = async (panelKey) => page.evaluate((key) => {
  const el = document.querySelector(`[data-panel="${key}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}, panelKey);
const itemsIn = (panelKey) => count(`[data-panel="${panelKey}"] .item, [data-panel="${panelKey}"] .news-item, [data-panel="${panelKey}"] li`);

// 1. Load the hub from a clean profile.
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await waitFor(async () => (await count('[data-panel]')) > 5, 'panels mounted', 30_000);
note('loaded', { panels: await count('[data-panel]') });
await sleep(3000);
// Dismiss the community toast so it does not sit in the frame.
const toastClosed = await page.evaluate(() => {
  const node = document.evaluate('//*[contains(text(),"Join the Discord")]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  const box = node?.parentElement?.closest('div');
  const btn = box?.querySelector('button, [role="button"], [aria-label*="lose" i], .close');
  if (btn) { btn.click(); return true; }
  if (box) { box.remove(); return 'removed'; }
  return false;
});
const missionClosed = await page.evaluate(() => { const b = document.querySelector('.mission-preset-close'); if (!b) return false; b.click(); return true; });
note('toast', { toastClosed, missionClosed });
await sleep(1000);
await shot('01_main');

// 2. Trinidad & Tobago tab (DOM click: the breaking-news banner can intercept locator clicks).
const clicked = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('.dashboard-tab-label')).find((b) => /trinidad/i.test(b.textContent || ''));
  if (!btn) return false; btn.click(); return true;
});
note('tab_tt', { clicked });
await waitFor(async () => (await itemsIn('tt-news')) > 0, 'tt-news items', 30_000);
await sleep(2500);
const lensCounts = {};
for (const k of ['tt-news', 'tt-gov', 'tt-energy', 'tt-safety', 'tt-social', 'caribbean', 'live-news', 'chat-analyst']) lensCounts[k] = await itemsIn(k);
note('tt_lenses', lensCounts);
await shot('02_tt_tab');

// 3. Live TV strip: wait for a playing video (TegoTV HLS), hold on it.
await scrollTo('live-news');
await sleep(1500);
const playClicked = await page.evaluate(() => {
  const btn = document.querySelector('[data-panel="live-news"] .offline-retry') || document.querySelector('[data-panel="live-news"] .live-mute-btn');
  if (!btn) return null; btn.click(); return btn.className;
});
note('live_play_click', { playClicked });
const isPlaying = () => page.evaluate(() => {
  const v = document.querySelector('[data-panel="live-news"] video');
  if (!v) return null;
  return v.readyState >= 2 && !v.paused ? { readyState: v.readyState, w: v.videoWidth, h: v.videoHeight, src: (v.currentSrc || '').slice(0, 60) } : null;
});
let live = await waitFor(isPlaying, 'live video playing', 12_000);
// A transient manifest/token error shows the off-air card: Retry once on the same station, then
// move to the next live station in the strip (the strip is all T&T stations).
for (let attempt = 0; !live && attempt < 3; attempt++) {
  const action = await page.evaluate((first) => {
    const retry = document.querySelector('[data-panel="live-news"] .live-retry');
    const next = document.querySelector('[data-panel="live-news"] .live-next-live');
    const btn = first && retry ? retry : (next || retry);
    if (!btn) return null; btn.click(); return btn.className;
  }, attempt === 0);
  note('live_recover', { attempt, action });
  if (!action) break;
  live = await waitFor(isPlaying, `live video playing (recover ${attempt})`, 12_000);
}
const channel = await page.evaluate(() => document.querySelector('[data-panel="live-news"] .live-news-switcher .active, [data-panel="live-news"] .live-channel-name')?.textContent?.trim() ?? null);
note('live_tv', { playing: !!live, ...(live || {}), channel });
await sleep(7000);
await shot('03_live_tv');

// 4. Walk the T&T lenses.
for (const key of ['tt-news', 'tt-gov', 'tt-energy', 'tt-social']) {
  const ok = await scrollTo(key);
  await waitFor(async () => (await itemsIn(key)) > 0, `${key} items`, 10_000);
  note('lens', { key, ok, items: await itemsIn(key) });
  await sleep(3000);
}
await shot('04_lenses');

// 5. Ask the WM Analyst (answers from the T&T digest when this tab is active).
const hasAnalyst = await scrollTo('chat-analyst');
note('analyst_panel', { present: hasAnalyst });
if (hasAnalyst) {
  await waitFor(async () => (await count('[data-panel="chat-analyst"] .chat-analyst-input')) > 0, 'analyst input mounted', 20_000);
  await sleep(800);
  const input = page.locator('[data-panel="chat-analyst"] .chat-analyst-input');
  await input.click({ force: true });
  let text = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    // fill() is atomic: a deferred-panel re-render during per-key typing detached the textarea once.
    await input.fill(QUESTION, { timeout: 10_000 });
    await sleep(1200);
    await input.press('Enter');
    note('analyst_sent', { attempt });
    // Wait for the streaming bubble to appear and then be finalised (class chat-msg-streaming removed).
    await waitFor(async () => (await count('[data-panel="chat-analyst"] .chat-msg-streaming')) > 0, 'analyst streaming started', 15_000);
    await waitFor(async () => (await count('[data-panel="chat-analyst"] .chat-msg-streaming')) === 0, 'analyst streaming finished', 60_000);
    text = await page.evaluate(() => document.querySelector('[data-panel="chat-analyst"] .chat-msg-assistant:last-child')?.textContent ?? '');
    // Retry only on a failed answer. The '⚠ partial' chip is the context-degraded marker (a few
    // core Redis sources empty on this hub) and still comes with a full answer.
    if (!/Analyst unavailable|Stream unavailable/.test(text)) break;
    note('analyst_retry', { attempt, preview: text.slice(0, 120) });
    // Hide the failed exchange so the retry reads cleanly on camera.
    await page.evaluate(() => { document.querySelectorAll('[data-panel="chat-analyst"] .chat-msg').forEach((m) => { if (/unavailable|YOU/.test(m.textContent || '')) m.remove(); }); });
    await sleep(1500);
  }
  note('analyst_answer', { chars: text.length, preview: text.replace(/\s+/g, ' ').slice(0, 220) });
  await sleep(9000);
  await shot('05_analyst');
}

// 6. Back to the map: time-range filter.
await page.evaluate(() => { document.querySelector('#panelsGrid')?.scrollTo({ top: 0, behavior: 'smooth' }); window.scrollTo({ top: 0, behavior: 'smooth' }); });
await sleep(1500);
for (const range of ['48h', '7d']) {
  const ok = await page.evaluate((r) => { const b = document.querySelector(`.time-btn[data-range="${r}"]`); if (!b) return false; b.click(); return true; }, range);
  note('time_filter', { range, ok });
  await sleep(3000);
}
await shot('06_map_time');
await sleep(1500);
note('end');

await context.close();
await browser.close();
// Newest Playwright recording by mtime (earlier takes may still sit in raw/).
const webm = readdirSync(RAW).filter((f) => f.endsWith('.webm') && !f.startsWith('segC_')).map((f) => path.join(RAW, f)).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs).pop();
const target = path.join(RAW, `segC_worldmonitor_tt_${new Date(t0).toISOString().replace(/[:.]/g, '-')}.webm`);
if (webm) renameSync(webm, target);
const tAt = (step) => log.find((e) => e.step === step)?.t ?? 0;
const trimStartSec = Math.max(0, tAt('tab_tt') - tAt('record_start') - 1.0);
writeFileSync(path.join(OUT, 'segC_recording_log.json'), JSON.stringify({ url: URL, startedAt: new Date(t0).toISOString(), video: target, trimStartSec, events: log }, null, 2));
console.log(`trim_start_sec: ${trimStartSec.toFixed(1)}`);
console.log(`video: ${target}`);

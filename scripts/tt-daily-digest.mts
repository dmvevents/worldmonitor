#!/usr/bin/env -S node --import tsx/esm
/**
 * Trinidad & Tobago daily digest (tt variant).
 *
 * Builds a Markdown digest from the same feed catalog the dashboard's `tt`
 * digest variant uses (server/worldmonitor/news/v1/_feeds.ts → VARIANT_FEEDS.tt),
 * grouped by topic lens, with timestamps rendered in America/Port_of_Spain.
 *
 * Scope: public news and official sources only, aggregate/topic level — the
 * digest is headlines + links, nothing about private individuals.
 *
 * Usage (from repo root):
 *   ./node_modules/.bin/tsx scripts/tt-daily-digest.mts                 # writes ~/Documents/tt-digest/tt-digest-YYYY-MM-DD.md
 *   ./node_modules/.bin/tsx scripts/tt-daily-digest.mts --hours 48 --per-category 15 --out /tmp/tt
 *   ./node_modules/.bin/tsx scripts/tt-daily-digest.mts --stdout        # print instead of writing
 *
 * Optional local LLM summary (no cloud key needed): set OLLAMA_URL or OLLAMA_API_URL (default
 * http://localhost:11434) and OLLAMA_MODEL (default llama3.1). If Ollama is not
 * reachable the digest is written without the summary and says so.
 *
 * Schedule daily with launchd: see scripts/tt-daily-digest.launchd.plist.example
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { VARIANT_FEEDS, type ServerFeed } from '../server/worldmonitor/news/v1/_feeds';
import { TT_TIMEZONE } from '../src/config/variants/tt';

const UA = 'WorldMonitor-TT-Digest/1.0 (+https://github.com/koala73/worldmonitor; local self-host)';
const FETCH_TIMEOUT_MS = 15_000;
const CONCURRENCY = 8;

const CATEGORY_TITLES: Record<string, string> = {
  'tt-news': 'T&T News',
  'tt-gov': 'Government & Official Sources',
  'tt-energy': 'Energy & LNG',
  'tt-education': 'Education & Student Laptop Programme',
  'tt-telecoms': 'Telecoms (TSTT, Digicel, TATT)',
  'tt-public-it': 'Public-Sector IT & Procurement',
  'tt-safety': 'Crime & Public Safety (aggregate)',
  'tt-weather': 'Weather, Hurricanes & Outages',
  caribbean: 'Caribbean Geopolitics (Venezuela, Guyana, CARICOM)',
};

interface Item {
  title: string;
  link: string;
  source: string;
  publishedMs: number | null;
}

interface Options {
  hours: number;
  perCategory: number;
  outDir: string;
  stdout: boolean;
  includeUndated: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    hours: 24,
    perCategory: 12,
    outDir: join(homedir(), 'Documents', 'tt-digest'),
    stdout: false,
    includeUndated: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--hours') opts.hours = Number(next());
    else if (a === '--per-category') opts.perCategory = Number(next());
    else if (a === '--out') opts.outDir = String(next());
    else if (a === '--stdout') opts.stdout = true;
    else if (a === '--no-undated') opts.includeUndated = false;
    else if (a === '--help' || a === '-h') {
      console.log('usage: tt-daily-digest.mts [--hours N] [--per-category N] [--out DIR] [--stdout] [--no-undated]');
      process.exit(0);
    }
  }
  if (!Number.isFinite(opts.hours) || opts.hours <= 0) throw new Error('--hours must be a positive number');
  if (!Number.isFinite(opts.perCategory) || opts.perCategory <= 0) throw new Error('--per-category must be a positive number');
  return opts;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('#text' in o) return text(o['#text']);
    if ('@_href' in o) return text(o['@_href']);
  }
  return '';
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(s: string): number | null {
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

function parseFeed(xml: string, source: string): Item[] {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const items: Item[] = [];
  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const rssItems = channel?.item;
  const atom = doc.feed as Record<string, unknown> | undefined;
  const entries = atom?.entry;
  const list: unknown[] = Array.isArray(rssItems) ? rssItems : rssItems ? [rssItems]
    : Array.isArray(entries) ? entries : entries ? [entries] : [];
  for (const raw of list) {
    const it = raw as Record<string, unknown>;
    const title = decodeEntities(text(it.title));
    if (!title) continue;
    let link = text(it.link);
    if (!link && Array.isArray(it.link)) {
      const alt = (it.link as Array<Record<string, unknown>>).find(l => l['@_rel'] === 'alternate' || !l['@_rel']);
      link = text(alt?.['@_href']);
    }
    const publishedMs = parseDate(text(it.pubDate) || text(it['dc:date']) || text(it.published) || text(it.updated));
    items.push({ title, link: decodeEntities(link).replace(/\s+/g, ''), source, publishedMs });
  }
  return items;
}

async function fetchFeed(feed: ServerFeed): Promise<{ items: Item[]; error?: string }> {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!res.ok) return { items: [], error: `HTTP ${res.status}` };
    const xml = await res.text();
    return { items: parseFeed(xml, feed.name) };
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}

async function mapLimit<T, R>(arr: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(arr.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (next < arr.length) {
      const i = next++;
      out[i] = await fn(arr[i]!);
    }
  }));
  return out;
}

function normTitle(t: string): string {
  return t.toLowerCase().replace(/\s*[-–—|]\s*[^-–—|]{2,40}$/, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function safeLink(link: string): string | null {
  try {
    const u = new URL(link);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function mdText(s: string): string {
  return s.replace(/[[\]]/g, '\\$&');
}

function fmtTT(ms: number | null): string {
  if (ms == null) return 'undated';
  return new Intl.DateTimeFormat('en-GB', { timeZone: TT_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));
}

function ttDateStamp(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function ollamaSummary(bulletLines: string[]): Promise<string | null> {
  const base = (process.env.OLLAMA_URL || process.env.OLLAMA_API_URL || 'http://localhost:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.1';
  try {
    const ping = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2_000) });
    if (!ping.ok) return null;
  } catch {
    return null;
  }
  const prompt = [
    'You are preparing a neutral daily situational-awareness brief for Trinidad and Tobago from public headlines only.',
    'Write 5-8 bullet points covering: energy/LNG, education and the student laptop programme, telecoms, public-sector IT/procurement, public safety at an aggregate level, weather/hurricane alerts, and Caribbean geopolitics (Venezuela, Guyana, CARICOM).',
    'Only use facts present in the headlines. Do not name or characterise private individuals. Be concise.',
    '',
    'Headlines:',
    ...bulletLines,
  ].join('\n');
  try {
    const res = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.2 } }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string };
    return data.response?.trim() || null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const catalog = VARIANT_FEEDS.tt;
  if (!catalog) throw new Error('VARIANT_FEEDS.tt missing — the tt digest variant is not registered');

  const now = new Date();
  const cutoff = now.getTime() - opts.hours * 3_600_000;
  const entries = Object.entries(catalog).flatMap(([category, feeds]) => feeds.map(feed => ({ category, feed })));
  const results = await mapLimit(entries, CONCURRENCY, async e => ({ ...e, ...(await fetchFeed(e.feed)) }));

  const byCategory = new Map<string, Item[]>();
  const feedNotes: string[] = [];
  const seenGlobal = new Set<string>();
  for (const r of results) {
    if (r.error) feedNotes.push(`${r.feed.name}: ${r.error}`);
    else if (r.items.length === 0) feedNotes.push(`${r.feed.name}: no items`);
    const bucket = byCategory.get(r.category) ?? [];
    for (const it of r.items) {
      if (it.publishedMs != null && it.publishedMs < cutoff) continue;
      if (it.publishedMs == null && !opts.includeUndated) continue;
      const key = normTitle(it.title);
      if (!key || seenGlobal.has(key)) continue;
      seenGlobal.add(key);
      bucket.push(it);
    }
    byCategory.set(r.category, bucket);
  }

  const lines: string[] = [];
  const stamp = ttDateStamp(now);
  lines.push(`# Trinidad & Tobago Daily Digest — ${stamp}`);
  lines.push('');
  lines.push(`Generated ${fmtTT(now.getTime())} (${TT_TIMEZONE}). Window: last ${opts.hours}h. Sources: public news and official feeds only (tt variant catalog).`);
  lines.push('');

  const allBullets: string[] = [];
  let total = 0;
  for (const category of Object.keys(catalog)) {
    const items = (byCategory.get(category) ?? [])
      .sort((a, b) => (b.publishedMs ?? 0) - (a.publishedMs ?? 0))
      .slice(0, opts.perCategory);
    lines.push(`## ${CATEGORY_TITLES[category] ?? category} (${items.length})`);
    lines.push('');
    if (items.length === 0) lines.push('_No items in window._');
    for (const it of items) {
      total++;
      const link = it.link ? safeLink(it.link) : null;
      const line = `- ${link ? `[${mdText(it.title)}](${link.replace(/\)/g, '%29')})` : mdText(it.title)} — ${it.source}, ${fmtTT(it.publishedMs)}`;
      lines.push(line);
      allBullets.push(`[${CATEGORY_TITLES[category] ?? category}] ${it.title} (${it.source})`);
    }
    lines.push('');
  }

  const summary = allBullets.length ? await ollamaSummary(allBullets.slice(0, 120)) : null;
  const header: string[] = [];
  header.push('## Executive summary');
  header.push('');
  header.push(summary ?? '_Not generated: no local LLM reachable (set OLLAMA_URL / OLLAMA_MODEL to enable). Headlines below are unsummarised._');
  header.push('');
  lines.splice(4, 0, ...header);

  if (feedNotes.length) {
    lines.push('## Feed notes');
    lines.push('');
    for (const n of feedNotes) lines.push(`- ${n}`);
    lines.push('');
  }
  lines.push(`_${total} items across ${Object.keys(catalog).length} lenses from ${entries.length} feeds._`);
  const md = `${lines.join('\n')}\n`;

  if (opts.stdout) {
    process.stdout.write(md);
    return;
  }
  mkdirSync(opts.outDir, { recursive: true });
  const dated = join(opts.outDir, `tt-digest-${stamp}.md`);
  writeFileSync(dated, md);
  writeFileSync(join(opts.outDir, 'latest.md'), md);
  console.log(`[tt-digest] wrote ${dated} (${total} items, ${feedNotes.length} feed notes${summary ? ', with LLM summary' : ', no LLM summary'})`);
}

main().catch(err => {
  console.error('[tt-digest] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

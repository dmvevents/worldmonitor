/**
 * Compiles per-domain RPC handlers (api/{domain}/v1/[rpc].ts) into bundled
 * ESM .js files so the Tauri sidecar's buildRouteTable() can load them.
 *
 * Run: node scripts/build-sidecar-handlers.mjs
 */

import { build } from 'esbuild';
import { readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const apiDir = path.join(ROOT, 'api');

// Skip the catch-all [domain] directory (handled by build-sidecar-sebuf.mjs)
const SKIP_DIRS = new Set(['[domain]', '[[...path]]']);

// Discover all api/{domain}/v1/[rpc].ts entry points
const entries = [];
const dirs = await readdir(apiDir, { withFileTypes: true });
for (const d of dirs) {
  if (!d.isDirectory() || SKIP_DIRS.has(d.name)) continue;
  const tsFile = path.join(apiDir, d.name, 'v1', '[rpc].ts');
  if (existsSync(tsFile)) {
    entries.push(tsFile);
  }
}

if (entries.length === 0) {
  console.log('build:sidecar-handlers  no domain handlers found, skipping');
  process.exit(0);
}

try {
  await build({
    entryPoints: entries,
    outdir: ROOT,
    outbase: ROOT,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    treeShaking: true,
    // Resolve @/ alias to src/
    alias: { '@': path.join(ROOT, 'src') },
  });

  // Hub front door (scripts/tt-hub-server.mjs) serves the WM Analyst chat locally: bundle the edge
  // function the same way, into dist/ (ignored, rebuilt with the handlers) rather than next to its
  // source so the edge-function test and the sebuf contract lint never see it.
  const chatAnalystEntry = path.join(apiDir, 'chat-analyst.ts');
  if (existsSync(chatAnalystEntry)) {
    await build({
      entryPoints: [chatAnalystEntry],
      outfile: path.join(ROOT, 'dist', 'hub', 'chat-analyst.js'),
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      treeShaking: true,
      alias: { '@': path.join(ROOT, 'src') },
    });
    console.log('build:sidecar-handlers  hub chat-analyst → dist/hub/chat-analyst.js');
  }

  // Report results
  let totalKB = 0;
  for (const entry of entries) {
    const jsFile = entry.replace(/\.ts$/, '.js');
    if (existsSync(jsFile)) {
      const { size } = await stat(jsFile);
      totalKB += size / 1024;
    }
  }
  console.log(`build:sidecar-handlers  ${entries.length} domains  ${totalKB.toFixed(0)} KB total`);
} catch (err) {
  console.error('build:sidecar-handlers failed:', err.message);
  process.exit(1);
}

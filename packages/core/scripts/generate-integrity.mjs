#!/usr/bin/env node
// AIDEV-NOTE: W15 (SRI-01) — regenerate `packages/core/dist/integrity.json`,
// the committed SRI content-hash table for the two SRI-pinnable `@beacio/core`
// browser bundles (`auto.mjs`, `browser-auto.global.js`).
//
// This file is REGENERATED at build + publish time — the committed copy in the
// repo is the LATEST deterministic build's hashes. It is drift-detectable:
// `tests/sri-integrity-table.test.ts` re-hashes the freshly-built bundles and
// asserts the committed table matches. tsup minified output is byte-reproducible
// for a given source + esbuild version, so a rebuild reproduces these exact
// bytes; the committed copy only goes stale when the bundles genuinely change —
// at which point you re-run this script and commit the updated table.
//
// The integrity.json file is TRACKED under the otherwise-ignored `dist/` dir via
// a `.gitignore` negation that re-includes the integrity.json filename; the
// bundles themselves stay gitignored. Operators pin SRI on a CDN/self-hosted
// <script> load by reading the `sha384` digest here and assembling
// `integrity="sha384-<digest>"`.
//
// Wired into:
//   - packages/core `build`  (so `build:packages` keeps the table synced live)
//   - packages/core `prepublishOnly` (belt-and-suspenders: always fresh on publish)
//   - packages/core `integrity` (manual: `npm run integrity -w packages/core`)

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname_self = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname_self, '..');
const DIST = path.join(ROOT, 'dist');
const PKG_JSON = path.join(ROOT, 'package.json');

const ENTRIES = ['auto.mjs', 'browser-auto.global.js'];

const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf8'));

const table = {
  version: pkg.version,
  generatedAt: new Date().toISOString(),
  entries: {},
};

for (const name of ENTRIES) {
  const file = path.join(DIST, name);
  if (!existsSync(file)) {
    console.error(`[generate-integrity] missing build artifact ${file} — run \`npm run build -w packages/core\` first.`);
    process.exit(1);
  }
  const bytes = readFileSync(file);
  const sha384 = createHash('sha384').update(bytes).digest('base64');
  table.entries[name] = { sha384, size: bytes.length };
}

const out = path.join(DIST, 'integrity.json');
writeFileSync(out, JSON.stringify(table, null, 2) + '\n', 'utf8');

console.log(`[generate-integrity] wrote ${path.relative(ROOT, out)} (version ${table.version})`);
for (const name of ENTRIES) {
  const e = table.entries[name];
  console.log(`  ${name}: size=${e.size} sha384=${e.sha384}`);
}
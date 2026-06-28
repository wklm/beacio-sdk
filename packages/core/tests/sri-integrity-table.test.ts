/**
 * W15 (SRI-01) — committed SRI integrity-table drift guard for the two
 * SRI-pinnable `@beacio/core` browser bundles.
 *
 * The cdn worker serves `cdn.beacio.com/self-host/...` (SRI-pinnable beacio-owned
 * bytes), and operators who pin Subresource Integrity on a `<script>` load need a
 * repo-tracked content-hash (`sha384`) table for the exact bytes they pin —
 * `@beacio/core@1.0.0/dist/auto.mjs` and `dist/browser-auto.global.js`. Until W15
 * no such table shipped: an operator had to compute the digest out-of-band, and
 * the PR's "SRI was regenerated consistently" claim had no committed evidence.
 *
 * THE GREEN ARTIFACT is `packages/core/dist/integrity.json`. It is:
 *   - REGENERATED at build + publish time by `scripts/generate-integrity.mjs`
 *     (wired into packages/core `build` and `prepublishOnly`), and
 *   - TRACKED in git via a `.gitignore` negation that re-includes the
 *     `integrity.json` filename under each package dist dir — the dist bundles
 *     themselves stay ignored, only the hash table is committed; the negation
 *     requires the dir to be non-excluded, hence the repo-root-anchored /dist/
 *     rule plus a per-package dist content-ignore (replacing the old directory-
 *     exclusion form) in .gitignore.
 *
 * tsup's minified output is byte-reproducible for the same source + esbuild
 * version (verified: two back-to-back `npm run build -w packages/core` runs
 * produce identical sha384 for both bundles), so a fresh `build:packages` in CI
 * reproduces the exact bytes the committed integrity.json was generated from —
 * the drift check below does NOT spuriously fail across rebuilds. It FAILS iff
 * the committed integrity.json is stale (bundles changed, table not regenerated)
 * OR tampered (a bundle byte or the table's digest was hand-edited).
 *
 * THIS TEST BINDS THREE INVARIANTS
 *   (a) `dist/integrity.json` EXISTS and is the committed artifact (not a stray).
 *   (b) The table carries a `sha384` entry for each of `auto.mjs` and
 *       `browser-auto.global.js`, plus the `version` it was generated against.
 *   (c) Each committed digest EXACTLY matches `sha384(<freshly built bundle>)`.
 *       A mismatch is either drift (regenerate via `npm run build -w packages/core`)
 *       or tamper (restore the bundle from git) — both are S&B-SRI-critical: a
 *       wrong digest ships a pin the browser will reject against the real bytes.
 *
 * RED-arms (adversarial): flipping one byte of `dist/auto.mjs`, OR editing the
 * committed `integrity.json`'s `auto.mjs.sha384` to a wrong value, MUST turn this
 * suite RED — proving the test binds on the real hash, not a tautology.
 *
 * jsdom; @jest/globals import style (project_jest_globals_import_gotcha).
 * @beacio/core's tsconfig does NOT pull in '@types/node' (see tests/setup.ts), so
 * Node builtins are reached via a locally-declared `require` (ts-jest emits
 * CommonJS) instead of `import … from 'node:*'` — mirrors tests/browser-auto.test.ts.
 *
 * Run via
 *   npm --prefix packages/core test -- sri-integrity-table
 * The gate runs build:packages before test:packages, so the dist bundles (and the
 * freshly-regenerated integrity.json) exist by the time this runs.
 */
import { beforeAll, describe, expect, it } from '@jest/globals';

declare const require: (id: string) => any;
declare const __dirname: string;

const { existsSync, readFileSync } = require('fs');
const { createHash } = require('crypto');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const INTEGRITY_JSON = path.join(DIST, 'integrity.json');
const PKG_JSON = path.join(ROOT, 'package.json');

const ENTRIES = ['auto.mjs', 'browser-auto.global.js'] as const;
type EntryName = (typeof ENTRIES)[number];

function sha384(bytes: any): string {
  return createHash('sha384').update(bytes).digest('base64');
}

function readBundle(name: EntryName) {
  const file = path.join(DIST, name);
  if (!existsSync(file)) {
    throw new Error(
      `Missing build artifact ${file} — run \`npm run build -w packages/core\` first.`,
    );
  }
  return readFileSync(file);
}

describe('W15 SRI-01 — @beacio/core dist/integrity.json drift guard', () => {
  let table: any;
  let tableVersion: string;
  let pkgVersion: string;

  beforeAll(() => {
    // (a) the table file itself exists.
    if (!existsSync(INTEGRITY_JSON)) {
      throw new Error(
        `Missing committed SRI table ${INTEGRITY_JSON} — run \`npm run build -w packages/core\` (regenerates it via scripts/generate-integrity.mjs) and commit the file.`,
      );
    }
    // Fail loudly if the build barrier was skipped (bundles must exist too).
    for (const name of ENTRIES) readBundle(name);

    table = JSON.parse(readFileSync(INTEGRITY_JSON, 'utf8'));
    const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf8'));
    pkgVersion = pkg.version;
    tableVersion = table.version;
  });

  it('the integrity table ships a version field matching packages/core/package.json', () => {
    expect(typeof tableVersion).toBe('string');
    expect(tableVersion).toBe(pkgVersion);
  });

  it('the integrity table carries a sha384 entry for each pinned bundle', () => {
    expect(typeof table.entries).toBe('object');
    expect(table.entries).not.toBeNull();
    for (const name of ENTRIES) {
      const entry = table.entries[name];
      expect(entry).toBeTruthy();
      expect(typeof entry.sha384).toBe('string');
      // SRI digest surface: base64 of the raw sha384, prefixed at use time with
      // "sha384-". The stored value is the bare base64 (the `integrity=` attr
      // assembles `sha384-<this>`); assert the bare base64 shape.
      expect(entry.sha384.length).toBeGreaterThan(0);
      expect(entry.sha384.startsWith('sha384')).toBe(false);
      // base64 alphabet only.
      expect(entry.sha384).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(typeof entry.size).toBe('number');
      expect(entry.size).toBeGreaterThan(0);
    }
  });

  it.each(ENTRIES)(
    'the committed %s sha384 matches the freshly-built bundle (no drift / no tamper)',
    (name) => {
      const bundle = readBundle(name);
      const expected = sha384(bundle);
      const committed = table.entries[name].sha384;
      if (committed !== expected) {
        throw new Error(
          `integrity.json drift for ${name}: committed sha384 "${committed}" != freshly-built "${expected}". ` +
            `Either regenerate the table (\`npm run build -w packages/core\` writes dist/integrity.json) and commit it, ` +
            `or restore the bundle from git if it was tampered.`,
        );
      }
      expect(committed).toBe(expected);
      // Belt-and-suspenders: the size recorded in the table must also match.
      expect(table.entries[name].size).toBe(bundle.length);
    },
  );
});
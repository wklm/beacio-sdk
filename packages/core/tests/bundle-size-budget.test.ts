/**
 * W15 (SIZE-01) — per-package gzip budget tripwire for the two SRI-pinnable
 * `@beacio/core` browser bundles.
 *
 * The repo already has the loose outer cap `check:bundle-size`
 * (scripts/ci/check-package-bundles.mjs, run in the gate-js parallel pool) over
 * the whole SDK bundle surface — auto.mjs <= 10 KiB gzip, browser-auto.global.js
 * <= 22 KiB gzip. That outer cap is the LAST line of defense. THIS test is a
 * TIGHTER package-level tripwire that sits between the current output size and
 * that outer cap, so a regression is caught EARLY (at `test:packages`) with the
 * offending change's exact bundle and gzip delta in the failure message, long
 * before the loose outer gate reddens a whole CI run with no culprit.
 *
 * WHY THE SIZES ARE WHAT THEY ARE
 * --------------------------------
 * The bundles stay small by real, audited mechanism — not by luck:
 *   - `tsup.browser-auto.config.ts` aliases `@beacio/core` to the minimal
 *     `src/_auto-core.ts` shim, so a vanilla <script> drop-in folds in ONLY the
 *     surface detect's lazy core import touches (detectPlatform + erased type
 *     pins), dropping ~9 KiB gzip of dead BLE wrapper machinery the classic
 *     script path never instantiates (see that config's alias note + the
 *     `_auto-core.ts` source).
 *   - `tsup.config.ts` runs an esbuild `mangleProps` regex over a precisely-
 *     audited set of PRIVATE instance-field names (…Cache/Registry/Listeners/…)
 *     with a `reserveProps` allowlist that pins the public API + the W3C/standard
 *     surface (requestDevice/gatt/server/characteristic/…), so private state is
 *     mangled to short identifiers at build time WITHOUT touching any name a
 *     consumer or the browser ever reads. Each pair (deps object literals +
 *     readers) is built and read inside the same build, so esbuild mangles both
 *     ends consistently.
 *   - lazy `await import('@beacio/core')` for i18n/banner keeps the cold bundle
 *     off the hot path; opt-in themeable + tree-shake on the published barrel.
 *
 * The budgets below are UPPER BOUNDS — the current gzip output + a headroom that
 * is generous enough not to noise-trip on a trivial edit but tight enough that a
 * real bloat (e.g. a new dependency dragged into the auto shim, the mangleProps
 * regex widening past the allowlist, the alias shim abandoned) trips WELL before
 * the loose outer cap. If a budget is ever CROSSED, the fix is NOT to raise it:
 * re-audit the mechanism above (did the _auto-core shim grow? did mangleProps
 * stop applying? did a new export leak into the auto path?) and only then, with
 * evidence, raise the budget by the audited delta.
 *
 * RED-arms (adversarial): temporarily lowering a budget from a passing state
 * (e.g. MAX_AUTO_GZIP = 100) MUST turn this suite RED — proving the tripwire
 * binds on the real gzip size, not a tautology.
 *
 * jsdom; @jest/globals import style (project_jest_globals_import_gotcha).
 * Node builtins via require() (ts-jest emits CommonJS), typed by @types/node
 * through tests/tsconfig.json. Mirrors tests/browser-auto.test.ts.
 *
 * Run via
 *   npm --prefix packages/core test -- bundle-size-budget
 * The gate builds packages (build:packages) before test:packages, so the dist
 * bundles exist by the time this runs; a missing artifact fails LOUDLY here
 * (same posture as tests/browser-auto.test.ts).
 */
import { beforeAll, describe, expect, it } from '@jest/globals';

const { existsSync, readFileSync } = require('fs');
const { gzipSync } = require('zlib');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AUTO = path.join(ROOT, 'dist', 'auto.mjs');
const BROWSER_AUTO = path.join(ROOT, 'dist', 'browser-auto.global.js');

// Budgets — UPPER BOUNDS, not aspirations. See file header for the mechanism +
// rationale; do NOT raise without re-auditing the _auto-core shim + mangleProps.
// Current gzip (2026-06-27 build): auto.mjs ~2.20 KiB, browser-auto.global.js ~17.2 KiB.
// Outer repo cap (check-package-bundles.mjs): auto 10 KiB, browser-auto 22 KiB.
// These tripwires sit ~36% / ~10% above current and well below the outer caps.
const MAX_AUTO_GZIP = 3072; // 3.0 KiB — catches a >=0.8 KiB auto.mjs bloat early.
const MAX_BROWSER_AUTO_GZIP = 19456; // 19.0 KiB — catches a >=1.8 KiB browser-auto bloat.

function requireBuiltArtifact(file: string, label: string) {
  if (!existsSync(file)) {
    throw new Error(
      `Missing build artifact ${file} — run \`npm run build -w packages/core\` first. (${label})`,
    );
  }
  return readFileSync(file);
}

function gzipBytes(file: string, label: string): number {
  const buf = requireBuiltArtifact(file, label);
  return gzipSync(buf, { level: 9 }).length;
}

describe('W15 SIZE-01 — @beacio/core gzip budget tripwire', () => {
  beforeAll(() => {
    // Fail loudly up-front if the build barrier was skipped — same posture as
    // tests/browser-auto.test.ts (the gate runs build:packages before tests).
    requireBuiltArtifact(AUTO, 'auto.mjs gzip budget');
    requireBuiltArtifact(BROWSER_AUTO, 'browser-auto.global.js gzip budget');
  });

  it('dist/auto.mjs gzip size stays under its package-level budget', () => {
    const size = gzipBytes(AUTO, 'auto.mjs');
    // Report the exact delta whether passing or failing — the failure message is
    // the fast culpability signal the outer cap lacks.
    const delta = size - MAX_AUTO_GZIP;
    expect(size).toBeLessThanOrEqual(MAX_AUTO_GZIP);
    if (delta > 0) {
      throw new Error(
        `auto.mjs gzip ${size} B exceeds budget ${MAX_AUTO_GZIP} B by ${delta} B — re-audit the _auto-core shim + mangleProps (see test header).`,
      );
    }
  });

  it('dist/browser-auto.global.js gzip size stays under its package-level budget', () => {
    const size = gzipBytes(BROWSER_AUTO, 'browser-auto.global.js');
    const delta = size - MAX_BROWSER_AUTO_GZIP;
    expect(size).toBeLessThanOrEqual(MAX_BROWSER_AUTO_GZIP);
    if (delta > 0) {
      throw new Error(
        `browser-auto.global.js gzip ${size} B exceeds budget ${MAX_BROWSER_AUTO_GZIP} B by ${delta} B — re-audit the _auto-core shim + mangleProps (see test header).`,
      );
    }
  });
});
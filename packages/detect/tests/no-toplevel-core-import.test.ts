/**
 * Durable static guard for SB-SDK-02 (Part B), AC#6.
 *
 * `@beacio/core` is an OPTIONAL peer of @beacio/detect. It may ONLY be reached
 * behind the documented lazy `await import('@beacio/core')` (detect.ts) so a
 * standalone `npm i @beacio/detect` (no core) loads without throwing. A
 * top-level `import { … } from '@beacio/core'` (or a top-level
 * `require('@beacio/core')`) re-introduces the regression this issue fixed:
 * merely loading detect when core is absent throws at module-evaluation time.
 *
 * optional-core.test.ts proves the SOURCE loads with core absent, but the
 * SHIPPED artifact is what an npm consumer actually evaluates. tsup re-emits the
 * import graph into dist chunks, so a future refactor (or a re-merge of the
 * event-namespace rebrand) could silently put a static core import back into the
 * build even while the source-level test still passes. This guard scans the
 * BUILT dist and fails if any non-lazy `@beacio/core` specifier appears — the
 * only allowed reference is the lazy dynamic import.
 *
 * Run via:
 *   npx jest --config packages/detect/jest.config.js --rootDir packages/detect no-toplevel-core
 * (gate:js builds packages before test:packages, so dist exists in the gate.)
 */
import { describe, expect, it } from '@jest/globals';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DIST_DIR = path.resolve(__dirname, '..', 'dist');

/**
 * Strip the SOLE legitimate reference: the lazy dynamic import of '@beacio/core'.
 * tsup emits it as one of:
 *   - ESM:  await import("@beacio/core")
 *   - CJS:  Promise.resolve().then(() => _interopRequireWildcard(require("@beacio/core")))
 *           (the `await import()` lowered to a deferred require thunk)
 * Both are deferred (run only when detect.ts's getExtensionInstallState() is
 * called, inside a try/catch), so they do NOT throw at load when core is absent.
 * Everything left after removing these must be free of any '@beacio/core'
 * specifier — a leftover is a top-level/static import and a regression.
 */
const CORE_SPECIFIER = /@beacio\/core/;
/** An ES dynamic import of core — always lazy/deferred (never throws at load). */
const ESM_DYNAMIC_IMPORT = /\bimport\(\s*["']@beacio\/core["']\s*\)/;
/**
 * The CJS form a lowered `await import('@beacio/core')` compiles to. tsup emits
 * it on ONE line and it is ALWAYS wrapped in a deferred `Promise.resolve().then(
 * () => … require("@beacio/core") … )` thunk (possibly via an interop helper).
 * A line carrying BOTH the deferred thunk marker and the require is therefore the
 * lazy form, not a static top-level `var x = require("@beacio/core")`.
 */
const CJS_DEFERRED_REQUIRE = /Promise\.resolve\(\)\.then\(.*require\(\s*["']@beacio\/core["']\s*\)/;

/** True when this line's only @beacio/core reference is a lazy/deferred import. */
function isLazyOnly(line: string): boolean {
  return ESM_DYNAMIC_IMPORT.test(line) || CJS_DEFERRED_REQUIRE.test(line);
}

function distBundles(): string[] {
  return readdirSync(DIST_DIR).filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));
}

describe('SB-SDK-02: built @beacio/detect dist never statically imports @beacio/core (AC#6)', () => {
  it('has a built dist to scan (run `tsup` / the gate builds packages first)', () => {
    expect(existsSync(DIST_DIR)).toBe(true);
  });

  it('contains no top-level/static @beacio/core import — only the lazy dynamic import', () => {
    const offenders: Array<{ file: string; line: number; text: string }> = [];

    for (const file of distBundles()) {
      const raw = readFileSync(path.join(DIST_DIR, file), 'utf8');
      raw.split('\n').forEach((text, i) => {
        // Flag any @beacio/core reference UNLESS the only reference on the line is
        // the allowed lazy/deferred dynamic import.
        if (CORE_SPECIFIER.test(text) && !isLazyOnly(text)) {
          offenders.push({ file, line: i + 1, text: text.trim().slice(0, 120) });
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});

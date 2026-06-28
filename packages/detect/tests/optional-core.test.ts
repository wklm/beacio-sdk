/**
 * Optional-peer load guard for @beacio/detect (SB-SDK-02, Part B).
 *
 * `@beacio/core` is declared an OPTIONAL peer (package.json
 * peerDependenciesMeta.@beacio/core.optional = true) and is documented
 * runtime-optional (core.d.ts; the lazy `try { await import('@beacio/core') }`
 * in detect.ts:51). A standalone `npm i @beacio/detect` (no core) MUST therefore
 * load without throwing — core may only be touched behind that guarded lazy
 * import.
 *
 * Regression (PR-introduced by the event-namespace rebrand): src/index.ts and
 * src/banner.ts added TOP-LEVEL `import { … } from '@beacio/core'` statements, so
 * merely loading detect when core is absent throws at module-evaluation time.
 *
 * This test makes `@beacio/core` UNRESOLVABLE (jest.mock factory throws a
 * MODULE_NOT_FOUND error — the same failure Node raises for an absent optional
 * peer), deliberately overriding the jest.config moduleNameMapper that otherwise
 * maps `^@beacio/core$` to core's SOURCE and masks the throw. It then asserts the
 * entrypoints load and their public API is callable. RED while the top-level
 * imports exist; GREEN once core is reached only via the lazy try/catch.
 *
 * Run via:
 *   npx jest --config packages/detect/jest.config.js --rootDir packages/detect optional-core
 *
 * Sibling control: events.test.ts loads the SAME entrypoints WITH core present
 * and pins the shared `beacio:*` constants — so the fix must keep the shared
 * BEACIO_EVENTS / SETUP_URL pinning, not inline-duplicate the constants.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// Simulate an absent optional peer: every attempt to resolve '@beacio/core'
// (the top-level static imports in index.ts/banner.ts AND the lazy await import
// in detect.ts) throws MODULE_NOT_FOUND. jest.mock is hoisted above the imports
// of the modules under test, and overrides the moduleNameMapper for this file.
jest.mock('@beacio/core', () => {
  throw Object.assign(new Error("Cannot find module '@beacio/core'"), {
    code: 'MODULE_NOT_FOUND',
  });
});

const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  delete document.documentElement.dataset.beacioExtension;
});

describe('@beacio/detect loads with the optional @beacio/core peer ABSENT (SB-SDK-02)', () => {
  it('imports src/index without a module-load throw and exposes a callable initBeacio', async () => {
    const mod = await import('../src/index');

    expect(typeof mod.initBeacio).toBe('function');
    expect(typeof mod.showInstallBanner).toBe('function');
  });

  it('imports src/banner without a module-load throw and exposes a callable showInstallBanner', async () => {
    const mod = await import('../src/banner');

    expect(typeof mod.showInstallBanner).toBe('function');
    expect(typeof mod.removeInstallBanner).toBe('function');
    expect(Array.isArray(mod.SETUP_STEPS)).toBe(true);
  });

  it('initBeacio runs to completion on iOS Safari without core (lazy import swallowed)', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => IOS_SAFARI_UA,
    });
    // Active marker → getExtensionInstallState resolves synchronously, so the
    // call exercises the dispatch path (which reads BEACIO_EVENTS) without the
    // 2s injection poll. With core absent, none of this may throw.
    document.documentElement.dataset.beacioExtension = 'true';

    const { initBeacio } = await import('../src/index');

    await expect(initBeacio({ banner: false })).resolves.toBeUndefined();
  });
});

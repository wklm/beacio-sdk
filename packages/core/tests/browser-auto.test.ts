/**
 * SB-SDK-02 (Part A): the consolidated CLASSIC browser-auto build.
 *
 * `@beacio/core/browser-auto` ships ONE classic IIFE (no import/export, runs
 * under a plain non-module <script src=...>) that, on load:
 *   1. patches navigator.bluetooth SYNCHRONOUSLY (so it is defined before a
 *      vanilla site's parse-time `if (navigator.bluetooth)` gate runs), and
 *      NO-OPs when a working navigator.bluetooth already exists (Chrome/Android), and
 *   2. self-attaches window.beacioDetect with a callable showInstallBanner /
 *      initBeacio (the published @beacio/detect dist sets no global — the gap
 *      that forced the demo to hand-patch a vendored file), and
 *   3. on DOMContentLoaded auto-shows the install banner ONLY when
 *      navigator.bluetooth is absent, honoring a data-operator-name attribute.
 *
 * This test EVALUATES THE BUILT ARTIFACT (not the TS source) in a jsdom global,
 * exactly as a <script src=...> would, so it also guards that the build emits a
 * classic, side-effectful, global-attaching bundle — AC#2/AC#6. It is skipped
 * with a clear message until the artifact is built (the gate builds packages
 * before test:packages); a present-but-wrong build FAILS.
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

// Node builtins via require() (ts-jest emits CommonJS); typed by @types/node
// through tests/tsconfig.json.
const { existsSync, readFileSync } = require('fs');
const path = require('path');
const vm = require('vm');

const ARTIFACT = path.resolve(__dirname, '..', 'dist', 'browser-auto.global.js');

/** Evaluate the built IIFE against a fresh window/navigator, as a classic <script> would. */
const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/** window.beacioDetect as attached by the IIFE's globalName (the src/browser-auto.ts re-exports). */
interface BeacioDetectGlobal {
  initBeacio: (options?: { operatorName?: string }) => Promise<void>;
  showInstallBanner: (options?: { operatorName?: string }) => unknown;
}

/** The element shape the mock document.createElement hands to the IIFE. */
interface BrowserAutoMockElement {
  style: Record<string, unknown>;
  dataset: Record<string, string>;
  setAttribute: () => void;
  appendChild: () => void;
  querySelector: () => null;
  addEventListener: () => void;
  remove: () => void;
}

/** The mock document the IIFE touches (currentScript dataset, body.appendChild capture). */
interface BrowserAutoDocument {
  title: string;
  readyState: string;
  currentScript: object;
  documentElement: { dataset: Record<string, string> };
  addEventListener: (t: string, cb: () => void) => void;
  removeEventListener: () => void;
  querySelector: () => null;
  createElement: () => BrowserAutoMockElement;
  body: { appendChild: (el: Node) => void };
}

/**
 * The vm realm's global object IS the window (a classic <script>'s scope), so it
 * also carries primitives (isSecureContext, location.href), the pass-through
 * globals, and members attached AFTER the literal is created — beacioDetect by
 * the IIFE, __fireDOMContentLoaded by the test hook.
 */
type BrowserAutoWindow = Record<string, unknown> & {
  beacioDetect?: BeacioDetectGlobal;
  __fireDOMContentLoaded?: () => void;
};

function runBrowserAuto(opts: {
  /** Pre-existing navigator.bluetooth (Chrome/Android path) when provided. */
  existingBluetooth?: unknown;
  /** data-operator-name on the loading <script>, surfaced via document.currentScript. */
  operatorName?: string;
  /** Override navigator.userAgent (default a desktop/jsdom UA — not iOS Safari). */
  userAgent?: string;
  /** documentElement dataset markers (e.g. beacioInstalled / beacioExtension). */
  documentMarkers?: Record<string, string>;
}): { window: BrowserAutoWindow; navigator: Record<string, unknown>; document: BrowserAutoDocument } {
  const src = readFileSync(ARTIFACT, 'utf8');

  // Minimal DOM the IIFE touches: a secure-context window, a navigator (optionally
  // already carrying a native bluetooth), and a document whose currentScript
  // exposes the operator-name dataset + a DOMContentLoaded dispatch hook.
  const listeners: Record<string, Array<() => void>> = {};
  const navigator: Record<string, unknown> = { userAgent: opts.userAgent ?? 'jsdom', permissions: undefined };
  if (opts.existingBluetooth !== undefined) navigator.bluetooth = opts.existingBluetooth;

  const currentScript = {
    dataset: opts.operatorName ? { operatorName: opts.operatorName } : {},
    getAttribute: (k: string) =>
      k === 'data-operator-name' ? opts.operatorName ?? null : null,
  };

  const localStorageStore: Record<string, string> = {};
  const win: BrowserAutoWindow = {
    isSecureContext: true,
    location: { href: 'https://app.example.com/' },
    localStorage: {
      getItem: (k: string) => localStorageStore[k] ?? null,
      setItem: (k: string, v: string) => {
        localStorageStore[k] = v;
      },
      removeItem: (k: string) => {
        delete localStorageStore[k];
      },
    },
    addEventListener: (t: string, cb: () => void) => {
      (listeners[t] ||= []).push(cb);
    },
    removeEventListener: () => {},
    dispatchEvent: () => true,
    requestAnimationFrame: (cb: () => void) => {
      cb();
      return 0;
    },
    navigator,
  };
  win.window = win;

  const doc: BrowserAutoDocument = {
    title: 'StockSite',
    readyState: 'loading',
    currentScript,
    documentElement: { dataset: { ...(opts.documentMarkers ?? {}) } },
    addEventListener: (t: string, cb: () => void) => {
      (listeners[t] ||= []).push(cb);
    },
    removeEventListener: () => {},
    querySelector: () => null,
    createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, appendChild() {}, querySelector: () => null, addEventListener() {}, remove() {} }),
    body: { appendChild() {} },
  };
  win.document = doc;

  // Model a classic <script>'s global scope: the context's GLOBAL object IS the
  // window (so the IIFE's top-level `var beacioDetect = …` becomes
  // window.beacioDetect, exactly as in a browser). window/globalThis/document/
  // navigator are all self-referential on it.
  win.globalThis = win;
  win.console = console;
  win.setTimeout = setTimeout;
  win.clearTimeout = clearTimeout;
  // The polyfill builds an EventTarget-derived bluetooth stub and rejects with a
  // DOMException; the banner uses CustomEvent/TextEncoder. A fresh vm realm has
  // none of these — pass through the ones jsdom already provides to this test.
  const g = globalThis as unknown as Record<string, unknown>;
  for (const name of ['EventTarget', 'DOMException', 'CustomEvent', 'Event', 'TextEncoder', 'TextDecoder', 'URL']) {
    if (g[name] !== undefined) win[name] = g[name];
  }
  vm.createContext(win);
  vm.runInContext(src, win);

  // Fire DOMContentLoaded so the auto-banner side effect runs.
  win.__fireDOMContentLoaded = () => (listeners['DOMContentLoaded'] || []).forEach((cb) => cb());

  return { window: win, navigator, document: doc };
}

describe('SB-SDK-02 @beacio/core/browser-auto classic IIFE', () => {
  beforeEach(() => {
    if (!existsSync(ARTIFACT)) {
      throw new Error(
        `Missing build artifact ${ARTIFACT} — run the core browser-auto tsup build first.`,
      );
    }
  });

  afterEach(() => {
    /* each run uses its own vm context — nothing to reset */
  });

  it('patches navigator.bluetooth synchronously on load (defined before any other script)', () => {
    const { navigator } = runBrowserAuto({});
    // Synchronous: no await — the polyfill must have installed during script eval,
    // so a parse-time `if (navigator.bluetooth)` gate sees it.
    expect(typeof navigator.bluetooth).toBe('object');
    expect(navigator.bluetooth).not.toBeNull();
  });

  it('self-attaches window.beacioDetect with a callable showInstallBanner and initBeacio', () => {
    const { window } = runBrowserAuto({});
    expect(window.beacioDetect).toBeTruthy();
    expect(typeof window.beacioDetect!.showInstallBanner).toBe('function');
    expect(typeof window.beacioDetect!.initBeacio).toBe('function');
  });

  it('no-ops when a working navigator.bluetooth already exists (Chrome/Android unaffected)', () => {
    const native = { requestDevice() {}, getAvailability() {}, getDevices() {} };
    const { navigator } = runBrowserAuto({ existingBluetooth: native });
    // The native implementation must be left exactly in place — not wrapped/replaced.
    expect(navigator.bluetooth).toBe(native);
  });

  it('auto-shows the install banner on DOMContentLoaded on stock iOS Safari (Bluetooth absent), honoring data-operator-name', async () => {
    let appended: (Node & { id?: string }) | null = null;
    const { window, document } = runBrowserAuto({
      operatorName: 'STORZ & BICKEL',
      userAgent: IOS_SAFARI_UA,
      // beacioInstalled (without beacioExtension) => getExtensionInstallState()
      // resolves SYNCHRONOUSLY to 'installed-inactive' (no 2s injection poll),
      // which still drives the auto-banner — deterministic for a unit test.
      documentMarkers: { beacioInstalled: 'true' },
    });
    // Capture the banner element the SDK appends to document.body.
    document.body.appendChild = (el: Node) => {
      appended = el;
    };
    window.__fireDOMContentLoaded!();
    // initBeacio() is async (getExtensionInstallState + maybeShowBanner); let its
    // microtasks settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(appended).toBeTruthy();
    expect(appended!.id).toBe('beacio-banner');
  });

  it('does NOT auto-show the banner on DOMContentLoaded when a native navigator.bluetooth exists (Chrome/Android)', async () => {
    let appended: (Node & { id?: string }) | null = null;
    const native = { requestDevice() {}, getAvailability() {}, getDevices() {} };
    const { window, document } = runBrowserAuto({ existingBluetooth: native, userAgent: IOS_SAFARI_UA });
    document.body.appendChild = (el: Node) => {
      appended = el;
    };
    window.__fireDOMContentLoaded!();
    await new Promise((r) => setTimeout(r, 0));
    expect(appended).toBeNull();
  });

  // AC#6 (Part A): a regression test fails if a future build reverts this entry
  // to a deferred/module-only form, to a non-auto library global, or stops
  // self-attaching window.beacioDetect.
  describe('stays a classic, auto-installing, global-attaching bundle (AC#6)', () => {
    it('is a classic script with no ESM import/export syntax', () => {
      const src = readFileSync(ARTIFACT, 'utf8');
      // No top-level module syntax (it must run under a non-module <script>).
      expect(/^\s*export\s/m.test(src)).toBe(false);
      expect(/\bimport\s*[{*]/.test(src)).toBe(false);
      expect(/\bimport\s+["']/.test(src)).toBe(false);
    });

    it('self-attaches the beacioDetect global (esbuild IIFE globalName)', () => {
      const src = readFileSync(ARTIFACT, 'utf8');
      expect(/\bvar beacioDetect\s*=/.test(src)).toBe(true);
    });

    it('actually installs the polyfill (not a non-auto library global)', () => {
      const src = readFileSync(ARTIFACT, 'utf8');
      // The polyfill install path defines navigator.bluetooth — a non-auto
      // library bundle (browser.global.js / BeacioCore) would not.
      expect(/defineProperty\(navigator/.test(src)).toBe(true);
    });
  });

  // SB-SDK-05: the branded error presenter must be reachable from the SAME
  // classic global S&B's vanilla site already uses — window.beacioDetect — exactly
  // like showInstallBanner (the demo can call beacioDetect.presentError(error) with
  // NO module setup). The IIFE's globalName attaches this module's re-exports to
  // window.beacioDetect, so the durable contract is that browser-auto.ts re-exports
  // presentError alongside initBeacio/showInstallBanner. Asserted against the TS
  // SOURCE (not the pre-built artifact) so it is deterministic without a rebuild.
  describe('SB-SDK-05: presentError is on the beacioDetect classic global', () => {
    const SOURCE = path.resolve(__dirname, '..', 'src', 'browser-auto.ts');

    it('re-exports presentError from the local detect surface (so window.beacioDetect.presentError exists)', () => {
      const src = readFileSync(SOURCE, 'utf8');
      // It must be IMPORTED from the detect surface (now the intra-package
      // ./detect module — B10-d folded @beacio/detect into @beacio/core)...
      expect(/import\s*\{[^}]*\bpresentError\b[^}]*\}\s*from\s*['"]\.\/detect['"]/.test(src)).toBe(
        true,
      );
      // ...AND re-exported so the IIFE globalName attaches it to window.beacioDetect
      // (mirroring how showInstallBanner is surfaced).
      expect(/export\s*\{[^}]*\bpresentError\b[^}]*\}/.test(src)).toBe(true);
    });
  });
});

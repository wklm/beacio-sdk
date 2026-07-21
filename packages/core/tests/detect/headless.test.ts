/**
 * SB-SDK-12: the framework-agnostic, ZERO-DOM headless onboarding API for
 * vanilla-JS partners (Storz & Bickel's app is vanilla JS + jQuery and cannot
 * use the React wizard; the only vanilla option today — showInstallBanner —
 * injects beacio chrome).
 *
 * This test pins the tier-3 headless surface the @beacio/detect package root
 * MUST export so a partner can draw a 100%-on-brand "Enable Bluetooth in Safari"
 * card with no beacio pixels, reusing the SAME detection logic as the React
 * ExtensionDetector and the banner's saveReturnContext/isDismissed:
 *
 *  - AC1: getInstallState() returns 'not-installed' | 'installed-inactive' |
 *    'active' from the documentElement/navigator markers, and the return-link +
 *    dismissal helpers (saveReturnContext / getReturnContext / isDismissed /
 *    dismiss) inject NO DOM — body stays empty, #beacio-banner is never created.
 *  - AC3: the headless path emits/observes BEACIO_EVENTS.EXTENSION_READY
 *    ('beacio:extension:ready') — the seam the in-page handshake + react-sdk
 *    already use but @beacio/detect is deaf to today.
 *  - AC4: the App Store helper/constant resolves to the id-form URL
 *    (https://apps.apple.com/app/id6761301368) with NO name slug that could 404
 *    if Apple's slug differs.
 *
 * TDD: RED until index.ts exports the headless API. The import of the
 * not-yet-exported names makes this suite fail to compile/run — the durable
 * guard that this surface cannot silently disappear.
 *
 * project_jest_globals_import_gotcha: `npm run typecheck` (tsconfig.json)
 * compiles .test.ts WITHOUT jest in `types`, so the jest globals MUST be
 * imported explicitly here.
 *
 * Run via:
 *   npx jest --config packages/detect/jest.config.js --rootDir packages/detect headless
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { BEACIO_EVENTS } from '../../src/events';
import {
  // AC1: shared install-state accessor (NOT a duplicate of detect.ts /
  // ExtensionDetector / banner — all four must read one shared derivation).
  getInstallState,
  // AC1: return-link / clipboard context helper, promoted out of banner.ts.
  saveReturnContext,
  getReturnContext,
  // AC1: dismissal helpers, promoted out of banner.ts.
  isDismissed,
  dismiss,
  // AC4: the id-form App Store URL constant the banner CTA must resolve to.
  APP_STORE_URL,
  // AC3: headless detector that resolves 'active' when EXTENSION_READY fires.
  observeInstallState,
} from '../../src/detect/index';

const RETURN_KEY = 'beacio_return';
const DISMISS_KEY = 'beacio_dismiss_until';

function clearMarkers(): void {
  delete document.documentElement.dataset.beacioExtension;
  delete document.documentElement.dataset.beacioInstalled;
  try {
    delete (window as unknown as { __beacio?: unknown }).__beacio;
  } catch {
    /* noop */
  }
  try {
    delete (navigator as unknown as { beacio?: unknown }).beacio;
  } catch {
    /* noop */
  }
}

describe('SB-SDK-12 headless onboarding API (zero-DOM, framework-agnostic)', () => {
  beforeEach(() => {
    clearMarkers();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    // Clear markers/storage/DOM so siblings (events, install-state, banner) do
    // not inherit our mutations (mirrors install-state.test.ts / events.test.ts).
    clearMarkers();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  describe('AC1: getInstallState() reflects each marker transition', () => {
    it('returns "not-installed" with no markers', () => {
      expect(getInstallState()).toBe('not-installed');
    });

    it('returns "installed-inactive" on the data-beacio-installed marker', () => {
      document.documentElement.dataset.beacioInstalled = 'true';
      expect(getInstallState()).toBe('installed-inactive');
    });

    it('returns "installed-inactive" on the window.__beacio.status marker', () => {
      (window as unknown as { __beacio?: { status: string } }).__beacio = { status: 'installed' };
      expect(getInstallState()).toBe('installed-inactive');
    });

    it('returns "active" on the data-beacio-extension marker', () => {
      document.documentElement.dataset.beacioExtension = 'true';
      expect(getInstallState()).toBe('active');
    });

    it('returns "active" on the navigator.beacio.__beacio marker', () => {
      (navigator as unknown as { beacio?: { __beacio: boolean } }).beacio = { __beacio: true };
      expect(getInstallState()).toBe('active');
    });
  });

  describe('AC1: the helpers inject ZERO DOM (no beacio chrome)', () => {
    it('saveReturnContext + getReturnContext add no DOM and round-trip the return link via localStorage', () => {
      saveReturnContext();

      // The whole point of tier-3: a partner draws its OWN card. No beacio pixels.
      expect(document.body.children.length).toBe(0);
      expect(document.getElementById('beacio-banner')).toBeNull();

      const ret = getReturnContext();
      // Round-trips through the 'beacio_return' key, and the returnLink is the
      // link.beacio.com/return?url=<encoded current href> form.
      const stored = localStorage.getItem(RETURN_KEY);
      expect(stored).not.toBeNull();
      expect(ret.returnLink).toContain('https://link.beacio.com/return?url=');
      expect(ret.returnLink).toContain(encodeURIComponent(window.location.href));

      // Still zero DOM after reading it back.
      expect(document.body.children.length).toBe(0);
    });

    it('isDismissed → dismiss → isDismissed round-trips via localStorage with no DOM', () => {
      expect(isDismissed()).toBe(false);

      dismiss(14);

      expect(localStorage.getItem(DISMISS_KEY)).not.toBeNull();
      expect(isDismissed()).toBe(true);
      // No banner chrome was created by the dismissal bookkeeping.
      expect(document.body.children.length).toBe(0);
      expect(document.getElementById('beacio-banner')).toBeNull();
    });
  });

  describe('AC3: the headless path observes BEACIO_EVENTS.EXTENSION_READY', () => {
    it('EXTENSION_READY is the canonical in-page handshake name', () => {
      // The seam the AC names: detect must speak the SAME event the react-sdk
      // ExtensionDetector + in-page handshake use, not just beacio:ready.
      expect(BEACIO_EVENTS.EXTENSION_READY).toBe('beacio:extension:ready');
    });

    it('observeInstallState resolves "active" when EXTENSION_READY fires', async () => {
      // No markers yet → the detector waits for the handshake event.
      const pending = observeInstallState();

      // The in-page extension announces it is live on the canonical name.
      window.dispatchEvent(new CustomEvent(BEACIO_EVENTS.EXTENSION_READY));

      await expect(pending).resolves.toBe('active');
      // Observing the seam injects no DOM either.
      expect(document.getElementById('beacio-banner')).toBeNull();
    });
  });

  describe('AC4: the App Store URL is the id form (no name slug that could 404)', () => {
    it('APP_STORE_URL contains id6761301368 on apps.apple.com with no slug segment', () => {
      const parsed = new URL(APP_STORE_URL);
      expect(parsed.hostname).toBe('apps.apple.com');
      expect(APP_STORE_URL).toContain('id6761301368');
      // The id-form path must NOT carry a `/app/<slug>/` name segment that could
      // 404 / mislead if Apple's slug differs from "beacio".
      expect(APP_STORE_URL).not.toMatch(/\/app\/[^/]+\/id/);
    });
  });
});

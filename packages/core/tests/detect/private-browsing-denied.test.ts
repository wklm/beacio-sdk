/**
 * SB-SDK-17 — Private Browsing + per-origin "Deny" dead-end detection guard.
 *
 * Two iOS-Safari dead ends both look like 'not-installed' to detect.ts today, so
 * initBeacio() falls through to the generic "install the app" sheet — misleading
 * the user, who may already have beacio installed:
 *
 *  1. PRIVATE BROWSING — iOS Safari disables web extensions in Private Browsing
 *     (troubleshooting.md §3). With the extension inert the content script sets no
 *     markers, getExtensionInstallState() resolves 'not-installed', and the user
 *     gets the install sheet even though the app may be installed and enabled — the
 *     fix surfaces a DISTINCT "open this page in a normal tab" hint instead.
 *  2. PER-ORIGIN 'DENY' with markers SUPPRESSED — a prior "Deny" can leave the
 *     extension so inert that NO markers are set (state resolves 'not-installed'),
 *     yet navigator.bluetooth is defined and getAvailability() === false. The
 *     existing SB-SDK-03 isOriginDenied() derivation runs ONLY inside the
 *     installState==='active' branch, so this marker-suppressed case escapes it and
 *     again gets the generic install sheet instead of the aA -> Manage Extensions
 *     -> Allow-on-this-website guidance (the existing 'denied' copy block).
 *
 * iOS exposes no reliable Private-Browsing API, so the heuristic is BEST-EFFORT
 * (a localStorage write-probe that throws) and STRICTLY guarded behind isIOSSafari
 * so it can never downgrade a desktop browser (AC3).
 *
 * Strategy mirrors events.test.ts (drive the REAL initBeacio with the REAL banner)
 * + install-state.test.ts (control the detect inputs): jest.spyOn the detect
 * module's getExtensionInstallState / isIOSSafari (the same module instance the
 * dynamic import in index.ts resolves), stub navigator.bluetooth on the jsdom
 * global, and assert the rendered #beacio-banner's data-beacioState + visible copy.
 *
 * This FAILS on the current tree: there is no 'private-browsing' BannerState
 * (ts-jest compile error on the cast) and initBeacio derives neither dead end. The
 * fix makes it pass while the existing detect suite stays green. jsdom; @jest/globals
 * import style (project_jest_globals_import_gotcha).
 *
 * Run via:
 *   npx jest --config packages/detect/jest.config.js --rootDir packages/detect private-browsing-denied
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as detect from '../../src/detect/detect';
import { type BannerState, removeInstallBanner, showInstallBanner } from '../../src/detect/banner';
import { initBeacio } from '../../src/detect/index';

const DISMISS_KEY = 'beacio_dismiss_until';
const RETURN_KEY = 'beacio_return';
const READY_SHOWN_KEY = 'beacio_ready_shown';

function clearBeacioStorage(): void {
  try {
    localStorage.removeItem(RETURN_KEY);
    localStorage.removeItem(DISMISS_KEY);
    localStorage.removeItem(READY_SHOWN_KEY);
  } catch {
    /* noop */
  }
}

/** The rendered banner element, or null when none was shown. */
function bannerEl(): HTMLElement | null {
  return document.getElementById('beacio-banner');
}

/** The funnel state the rendered sheet committed to (banner.ts sets data-beacioState). */
function bannerState(): string | undefined {
  return bannerEl()?.dataset.beacioState;
}

/** Full rendered banner text (normalised whitespace). */
function bannerText(): string {
  return (bannerEl()?.textContent || '').replace(/\s+/g, ' ');
}

function setBluetooth(value: unknown): void {
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value });
}

function clearBluetooth(): void {
  try {
    delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
  } catch {
    /* noop */
  }
}

/**
 * Trip the best-effort Private-Browsing heuristic: make a localStorage.setItem
 * write-probe throw (historically iOS Safari Private mode gives localStorage a
 * zero quota → QuotaExceededError). Spy is restored in afterEach via
 * restoreAllMocks. Returns the spy so a test can assert the probe is GUARDED (not
 * invoked at all) on non-iOS-Safari (AC3).
 */
function makeStorageWriteThrow() {
  const proto = Object.getPrototypeOf(window.localStorage) as Storage;
  return jest.spyOn(proto, 'setItem').mockImplementation(() => {
    throw new DOMException('exceeded the quota', 'QuotaExceededError');
  });
}

describe('SB-SDK-17 initBeacio routes the Private Browsing + marker-suppressed denied dead ends', () => {
  beforeEach(() => {
    clearBeacioStorage();
    document.body.innerHTML = '';
    delete document.documentElement.dataset.beacioExtension;
    delete document.documentElement.dataset.beacioInstalled;
    clearBluetooth();
    // The two dead ends both present as a marker-less 'not-installed' to detect.ts;
    // pin that input so the routing decision is the only thing under test.
    jest.spyOn(detect, 'getExtensionInstallState').mockResolvedValue('not-installed');
    // Default: iOS Safari (the platform the heuristics are scoped to). AC3 overrides.
    jest.spyOn(detect, 'isIOSSafari').mockReturnValue(true);
  });

  afterEach(() => {
    removeInstallBanner();
    document.body.innerHTML = '';
    jest.restoreAllMocks();
    clearBluetooth();
    clearBeacioStorage();
  });

  // ── AC1: Private Browsing → distinct hint, NOT the generic install sheet ────
  it('AC1: a Private-Browsing heuristic hit shows the "open a normal tab" hint, not the install sheet', async () => {
    makeStorageWriteThrow();

    await initBeacio({ operatorName: 'Storz & Bickel' });

    expect(bannerEl()).not.toBeNull();
    // Routed to the dedicated private-browsing funnel position …
    expect(bannerState()).toBe('private-browsing');
    expect(bannerState()).not.toBe('not-installed');
    // … with the distinct recovery hint (open a normal tab) …
    expect(bannerText()).toMatch(/private browsing/i);
    expect(bannerText()).toMatch(/normal tab|standard.*tab|regular tab/i);
    // … and it is NOT the install sheet: no install CTA, no App Store deep link.
    expect(bannerEl()!.querySelector('#bc-install')).toBeNull();
    const appStore = Array.from(bannerEl()!.querySelectorAll<HTMLAnchorElement>('a[href]')).filter(
      (a) => /apps\.apple\.com/.test(a.getAttribute('href') || '')
    );
    expect(appStore).toHaveLength(0);
  });

  // ── AC2: per-origin Deny with markers suppressed → 'denied' guidance ────────
  it('AC2: marker-suppressed origin (bluetooth defined + getAvailability()===false) shows the denied guidance', async () => {
    // No markers (state resolves 'not-installed') but the polyfill surface reports
    // unavailable HERE → the per-origin "Deny" left it inert.
    setBluetooth({ getAvailability: async () => false });

    await initBeacio({ operatorName: 'Storz & Bickel' });

    expect(bannerEl()).not.toBeNull();
    expect(bannerState()).toBe('denied');
    expect(bannerState()).not.toBe('not-installed');
    // Reuses the SB-SDK-03 per-site-denied copy block verbatim (no new copy).
    expect(bannerText()).toContain('Allow Every Website');
    expect(bannerText()).toMatch(/\bAA\b|address bar/);
    // Half-onboarded state → no install CTA back to the store.
    expect(bannerEl()!.querySelector('#bc-install')).toBeNull();
  });

  // ── AC3: no-op on non-iOS-Safari (the whole initBeacio body is gated) ───────
  it('AC3: on non-iOS-Safari, neither heuristic runs — no banner even with the PB signal + denied surface', async () => {
    (detect.isIOSSafari as jest.Mock).mockReturnValue(false);
    const setItemSpy = makeStorageWriteThrow();
    setBluetooth({ getAvailability: async () => false });

    await initBeacio({ operatorName: 'Storz & Bickel' });

    // isIOSSafari() short-circuits initBeacio before any detection/heuristic runs.
    expect(bannerEl()).toBeNull();
    // The PB write-probe must be GATED behind isIOSSafari, never invoked on desktop.
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  // ── AC3 (graceful fallback): iOS-Safari, no heuristic signal → generic sheet ─
  it('AC3: iOS-Safari with NO PB signal and NO denied surface falls back to the generic install sheet', async () => {
    // localStorage works (no throw) and navigator.bluetooth is undefined → neither
    // dead end is detected, so the established 'not-installed' path is preserved.
    await initBeacio({ operatorName: 'Storz & Bickel' });

    expect(bannerEl()).not.toBeNull();
    expect(bannerState()).toBe('not-installed');
    // The generic path still offers the install CTA (unchanged behaviour).
    expect(bannerEl()!.querySelector('#bc-install')).not.toBeNull();
  });
});

// ─── Banner-level render guard (real banner, direct showInstallBanner) ───────
// The 'private-browsing' BannerState renders the hint with NO install CTA and an
// EMPTY step strip (the action is "open a normal tab", not a Settings walkthrough).

describe('SB-SDK-17 banner renders the private-browsing state (no install CTA, empty step strip)', () => {
  beforeEach(() => {
    clearBeacioStorage();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    removeInstallBanner();
    document.body.innerHTML = '';
    clearBeacioStorage();
  });

  it('renders the distinct hint and no install CTA for state:"private-browsing"', () => {
    showInstallBanner({ mode: 'sheet', state: 'private-browsing' as BannerState });

    const el = bannerEl();
    expect(el).not.toBeNull();
    const text = bannerText();
    expect(text).toMatch(/private browsing/i);
    expect(text).toMatch(/normal tab|standard.*tab|regular tab/i);
    expect(el!.querySelector('#bc-install')).toBeNull();
  });

  it('renders an EMPTY step strip for private-browsing (switch tabs, not a Settings walkthrough)', () => {
    showInstallBanner({ mode: 'sheet', state: 'private-browsing' as BannerState });

    const steps = document.querySelectorAll('#beacio-banner .bc-step');
    expect(steps.length).toBe(0);
  });
});

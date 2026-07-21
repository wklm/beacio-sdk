/**
 * SBOPT-P2.4 — the tier-3 HEADLESS onboarding state machine (zero-beacio-chrome).
 *
 * Tier-2 (BannerOptions co-brand) is shipped; tier-3 lets a partner (Storz &
 * Bickel) render ENTIRELY their own install prompt, using beacio only for the
 * programmatic funnel STATE + the deep-link the partner wires to its own button.
 *
 * SB-SDK-12 already shipped the COARSE headless surface (getInstallState →
 * 'not-installed'|'installed-inactive'|'active', observeInstallState, the
 * dismissal + return-context helpers). What is still UNSHIPPED — and what this
 * suite pins — is the RICH funnel classification that today lives welded INSIDE
 * initBeacio (index.ts): the 'unsupported' (non-iOS-Safari) early-return, the
 * per-origin 'denied' refinement (navigator.bluetooth.getAvailability()===false),
 * and the SB-SDK-17 'private-browsing' dead end. Those positions are computed only
 * as a side-effecting banner render and are unreachable to a headless partner.
 *
 * The design "exposes the existing state machine, it does not invent one": the
 * union's kinds are initBeacio's exact routing OUTCOMES (one `return` per kind) —
 * four of them are the literal BannerState strings the banner already renders
 * (data-beacioState), plus 'ready' (the READY-event success outcome) and
 * 'unsupported' (the isIOSSafari() early-return that has no BannerState today).
 *
 * Design principles pinned here (owner's standing API rules):
 *  - Discriminated union + exhaustive switch (NO scattered undefined checks): the
 *    `label()` helper below is a compile-time proof the union is CLOSED to exactly
 *    these six kinds (a 7th kind, or a missing kind, breaks `_exhaustive: never`).
 *  - Required fields, sentinels over optionals: each variant carries only the
 *    render-ready fields its own prompt needs (installUrl / setupUrl / returnLink),
 *    all required — no `?`. resolveOnboardingState takes a REQUIRED config
 *    ({ operatorName, apiKey }) with empty-string sentinels, no optional args.
 *  - ZERO-DOM: resolving the state injects no beacio chrome — the partner draws
 *    its own card (the whole point of tier-3).
 *
 * TDD: RED until index.ts exports `resolveOnboardingState` + the `OnboardingState`
 * union. The import of the not-yet-exported names makes this suite fail to compile
 * (ts-jest "has no exported member") — the durable guard that this headless funnel
 * surface cannot silently disappear or drift from initBeacio's routing.
 *
 * Strategy mirrors private-browsing-denied.test.ts (drive the REAL classifier with
 * the detect module's inputs stubbed) + headless.test.ts (zero-DOM assertions):
 * jest.spyOn the detect module's getExtensionInstallState / isIOSSafari (the same
 * instance index.ts resolves), stub navigator.bluetooth on the jsdom global, and
 * trip the Private-Browsing write-probe via a throwing localStorage.setItem.
 *
 * project_jest_globals_import_gotcha: `npm run typecheck` compiles .test.ts WITHOUT
 * jest in `types`, so the jest globals MUST be imported explicitly.
 *
 * Run via:
 *   npm test -w packages/core -- onboarding-headless-state
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as detect from '../../src/detect/detect';
import {
  // NEW (RED): the tier-3 headless funnel query + its tagged-union result.
  resolveOnboardingState,
  type OnboardingState,
} from '../../src/detect/index';

const DISMISS_KEY = 'beacio_dismiss_until';
const RETURN_KEY = 'beacio_return';

/** The required config (sentinel empty strings — no optional args on the surface). */
const CONFIG = { operatorName: 'Storz & Bickel', apiKey: '' };

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

function clearBeacioStorage(): void {
  try {
    localStorage.removeItem(RETURN_KEY);
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Trip the SB-SDK-17 best-effort Private-Browsing heuristic: make a
 * localStorage.setItem write-probe throw (the classic iOS Private-mode zero-quota
 * QuotaExceededError). Spy restored in afterEach via restoreAllMocks.
 */
function makeStorageWriteThrow() {
  const proto = Object.getPrototypeOf(window.localStorage) as Storage;
  return jest.spyOn(proto, 'setItem').mockImplementation(() => {
    throw new DOMException('exceeded the quota', 'QuotaExceededError');
  });
}

/**
 * Compile-time exhaustiveness proof: the union is CLOSED to exactly these six
 * kinds. A 7th kind (or a removed kind) breaks `_exhaustive: never`. This is the
 * "discriminated union + switch, no scattered undefined checks" contract rendered
 * as code a partner would write to draw their own prompt.
 */
function label(state: OnboardingState): string {
  switch (state.kind) {
    case 'unsupported':
      return 'unsupported';
    case 'not-installed':
      return 'not-installed';
    case 'installed-inactive':
      return 'installed-inactive';
    case 'denied':
      return 'denied';
    case 'private-browsing':
      return 'private-browsing';
    case 'ready':
      return 'ready';
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

describe('SBOPT-P2.4 resolveOnboardingState — tier-3 headless funnel state (zero-DOM)', () => {
  beforeEach(() => {
    clearMarkers();
    clearBeacioStorage();
    document.body.innerHTML = '';
    clearBluetooth();
    // The classifier's marker input is the detect.ts derivation (initBeacio awaits
    // getExtensionInstallState); pin it so the ROUTING decision is what's under test.
    jest.spyOn(detect, 'getExtensionInstallState').mockResolvedValue('not-installed');
    // Default platform: iOS Safari (the funnel the states describe). Overridden for
    // the 'unsupported' case.
    jest.spyOn(detect, 'isIOSSafari').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    clearMarkers();
    clearBluetooth();
    clearBeacioStorage();
    document.body.innerHTML = '';
  });

  // ── Union correctness across every simulated environment ───────────────────

  it('non-iOS-Safari → { kind: "unsupported" } (the isIOSSafari early-return)', async () => {
    (detect.isIOSSafari as jest.Mock).mockReturnValue(false);

    const state = await resolveOnboardingState(CONFIG);

    expect(state.kind).toBe('unsupported');
    expect(label(state)).toBe('unsupported');
  });

  it('iOS + no markers → { kind: "not-installed" } carrying the id-form install URL + return link', async () => {
    jest.spyOn(detect, 'getExtensionInstallState').mockResolvedValue('not-installed');

    const state = await resolveOnboardingState(CONFIG);

    expect(state.kind).toBe('not-installed');
    if (state.kind !== 'not-installed') throw new Error('narrowing guard');
    // The partner wires state.installUrl to its OWN "Get the app" button — it MUST
    // be the id-form App Store URL (SB-SDK-12 AC4): no /app/<slug>/id name segment
    // that could 404 if Apple's slug differs from "beacio".
    const url = new URL(state.installUrl);
    expect(url.hostname).toBe('apps.apple.com');
    expect(state.installUrl).toContain('id6761301368');
    expect(state.installUrl).not.toMatch(/\/app\/[^/]+\/id/);
    // The tappable "return to your page" affordance — the link.beacio.com/return form.
    expect(state.returnLink).toContain('https://link.beacio.com/return?url=');
    expect(state.returnLink).toContain(encodeURIComponent(window.location.href));
  });

  it('iOS + installed-inactive marker → { kind: "installed-inactive" } carrying a branded setup URL', async () => {
    jest.spyOn(detect, 'getExtensionInstallState').mockResolvedValue('installed-inactive');

    const state = await resolveOnboardingState(CONFIG);

    expect(state.kind).toBe('installed-inactive');
    if (state.kind !== 'installed-inactive') throw new Error('narrowing guard');
    // The guided setup deep-link threads the operator identity + return origin so
    // /setup renders "Return to Storz & Bickel" instead of generic copy.
    expect(state.setupUrl).toContain('beacio.com/setup');
    expect(state.setupUrl).toContain(`operatorName=${encodeURIComponent('Storz & Bickel')}`);
    expect(state.setupUrl).toContain('return=');
    expect(state.returnLink).toContain('https://link.beacio.com/return?url=');
  });

  it('iOS + active markers + getAvailability()===false → { kind: "denied" } (per-origin block)', async () => {
    jest.spyOn(detect, 'getExtensionInstallState').mockResolvedValue('active');
    setBluetooth({ getAvailability: async () => false });

    const state = await resolveOnboardingState(CONFIG);

    expect(state.kind).toBe('denied');
    if (state.kind !== 'denied') throw new Error('narrowing guard');
    // The denied guidance points the partner at the same guided /setup help page.
    expect(state.setupUrl).toContain('beacio.com/setup');
    expect(state.returnLink).toContain('https://link.beacio.com/return?url=');
  });

  it('iOS + active markers + getAvailability()===true → { kind: "ready" } (origin granted)', async () => {
    jest.spyOn(detect, 'getExtensionInstallState').mockResolvedValue('active');
    setBluetooth({ getAvailability: async () => true });

    const state = await resolveOnboardingState(CONFIG);

    expect(state.kind).toBe('ready');
    expect(label(state)).toBe('ready');
  });

  it('iOS + no markers + localStorage write-probe throws → { kind: "private-browsing" }', async () => {
    jest.spyOn(detect, 'getExtensionInstallState').mockResolvedValue('not-installed');
    makeStorageWriteThrow();

    const state = await resolveOnboardingState(CONFIG);

    expect(state.kind).toBe('private-browsing');
    if (state.kind !== 'private-browsing') throw new Error('narrowing guard');
    expect(state.returnLink).toContain('https://link.beacio.com/return?url=');
  });

  it('Private-Browsing WINS over a marker-suppressed denied surface (routing order preserved)', async () => {
    // Both dead ends present at once: initBeacio routes PB first (extensions are
    // globally inert, so per-origin signals are unreliable). resolveOnboardingState
    // must reproduce that precedence, not the denied branch.
    jest.spyOn(detect, 'getExtensionInstallState').mockResolvedValue('not-installed');
    setBluetooth({ getAvailability: async () => false });
    makeStorageWriteThrow();

    const state = await resolveOnboardingState(CONFIG);

    expect(state.kind).toBe('private-browsing');
  });

  // ── Zero-DOM guarantee (tier-3: NO beacio chrome) ──────────────────────────

  it('resolving the state injects ZERO DOM — no beacio banner, empty body', async () => {
    jest.spyOn(detect, 'getExtensionInstallState').mockResolvedValue('installed-inactive');

    await resolveOnboardingState(CONFIG);

    expect(document.body.children.length).toBe(0);
    expect(document.getElementById('beacio-banner')).toBeNull();
  });

  it('resolving the "not-installed" state also injects ZERO DOM', async () => {
    jest.spyOn(detect, 'getExtensionInstallState').mockResolvedValue('not-installed');

    await resolveOnboardingState(CONFIG);

    expect(document.body.children.length).toBe(0);
    expect(document.getElementById('beacio-banner')).toBeNull();
  });
});

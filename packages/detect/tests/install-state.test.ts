/**
 * SB-SDK-03: per-site-DENIED wiring guard for @beacio/detect's initBeacio().
 *
 * The 'denied' state — extension enabled but this ORIGIN not granted "Allow
 * Every Website" — is the one funnel position the in-page flow can distinguish
 * but the install-state markers cannot: getExtensionInstallState() only returns
 * 'not-installed' | 'installed-inactive' | 'active' (detect.ts:17). The W3C
 * signal for it is `navigator.bluetooth` being DEFINED while
 * navigator.bluetooth.getAvailability() resolves false. SB-SDK-03 AC2 requires
 * initBeacio() to derive that 'denied' refinement and forward it to the banner,
 * so the user sees the aA -> Manage Extensions -> Allow Every Website guidance
 * instead of the generic "install the app" sheet.
 *
 * Without this wiring the banner's 'denied' STATE_COPY branch is DEAD from the
 * zero-config initBeacio() entry point (only reachable if a caller hand-passes
 * state:'denied'). This test pins the derivation so it cannot silently regress.
 *
 * Strategy: stub ../src/detect (isIOSSafari -> true, getExtensionInstallState ->
 * 'active'), stub ../src/banner (showInstallBanner as a spy), stub ../src/api
 * (reportEvent no-op), and define navigator.bluetooth.getAvailability -> false on
 * the jsdom global. Assert showInstallBanner is invoked with state:'denied'
 * (NOT 'active'/generic). RED until index.ts inspects getAvailability().
 *
 * Run via:
 *   npx jest --config packages/detect/jest.config.js --rootDir packages/detect install-state
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const showInstallBanner = jest.fn();
const getExtensionInstallState = jest.fn<() => Promise<string>>();

jest.mock('../src/detect', () => ({
  isIOSSafari: () => true,
  getExtensionInstallState: () => getExtensionInstallState(),
  isExtensionInstalled: async () => true,
}));

jest.mock('../src/banner', () => ({
  showInstallBanner: (...args: unknown[]) => showInstallBanner(...args),
  removeInstallBanner: () => {},
  SETUP_STEPS: [],
}));

// reportEvent does a real network/beacon call; neutralise it for the unit test.
jest.mock('../src/api', () => ({
  reportEvent: () => {},
  validateApiKey: () => true,
}));

function setBluetooth(value: unknown): void {
  Object.defineProperty(navigator, 'bluetooth', {
    configurable: true,
    value,
  });
}

describe('SB-SDK-03 initBeacio derives the per-site "denied" state from getAvailability()', () => {
  beforeEach(() => {
    jest.resetModules();
    showInstallBanner.mockReset();
    getExtensionInstallState.mockReset();
  });

  afterEach(() => {
    // Remove the navigator.bluetooth shim so it does not leak into sibling suites.
    try {
      delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
    } catch {
      /* noop */
    }
  });

  it('AC2: enabled-but-origin-blocked (getAvailability() === false) → banner shown with state:"denied"', async () => {
    // Markers say the extension is ACTIVE...
    getExtensionInstallState.mockResolvedValue('active');
    // ...but this ORIGIN is blocked: navigator.bluetooth exists yet reports
    // unavailable. That is the per-site-denied signal.
    setBluetooth({ getAvailability: async () => false });

    const { initBeacio } = await import('../src/index');
    await initBeacio({ operatorName: 'Storz & Bickel' });

    expect(showInstallBanner).toHaveBeenCalled();
    const calls = showInstallBanner.mock.calls;
    const opts = calls[calls.length - 1]?.[0] as { state?: string } | undefined;
    expect(opts?.state).toBe('denied');
  });

  it('AC2: genuinely active origin (getAvailability() === true) does NOT downgrade to "denied"', async () => {
    getExtensionInstallState.mockResolvedValue('active');
    setBluetooth({ getAvailability: async () => true });

    const { initBeacio } = await import('../src/index');
    await initBeacio({ operatorName: 'Storz & Bickel' });

    // Control: a truly-available origin keeps the 'active' path; if the banner is
    // shown at all it must NOT claim the origin is denied.
    const calls = showInstallBanner.mock.calls;
    const opts = calls[calls.length - 1]?.[0] as { state?: string } | undefined;
    if (opts) expect(opts.state).not.toBe('denied');
  });
});

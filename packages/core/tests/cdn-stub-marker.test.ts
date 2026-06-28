/**
 * SB-TST-35 — single-source + parity guard for the CDN-stub discriminator marker.
 *
 * The whole off-iOS no-op the S&B demo relies on hinges on ONE literal string,
 * `__beacioCDNStub`. It is STAMPED once by the unsupported-stub writer
 * (auto.ts createUnsupportedBluetoothStub, via Object.defineProperty(stub, …)) and
 * READ at three independent sites — platform.ts detectPlatform() and
 * getBluetoothAPI(), plus browser-auto.ts's auto-banner gate. Those used to be
 * four bare, hand-copied string literals: rename the writer's without the readers
 * (or any one reader alone) and the readers stop recognising our own stub, so an
 * off-iOS page that loads @beacio/detect's CDN stub gets mis-detected as a NATIVE
 * Bluetooth implementation — silently breaking the no-op (and, via browser-auto,
 * flashing the install banner where Bluetooth genuinely is unavailable).
 *
 * The fix is a single exported `CDN_STUB_MARKER` constant consumed at every site
 * (non-breaking: @beacio/core has zero external consumers, so free per project
 * rules). This is the durable guard that the marker stays single-sourced and that
 * the readers honour the exact key the writer stamps, so the drift class cannot
 * silently return:
 *   - (a) pins the wire value, so any rename is a deliberate, test-visible change;
 *   - (b) drives the readers through the PUBLIC API with a fixture keyed
 *     DYNAMICALLY off CDN_STUB_MARKER — so a reader that checked a different
 *     string than the constant (i.e. a drifted literal) would see no marker and
 *     mis-detect the stub as 'native', failing here.
 * The writer site shares the same constant after the fix and is independently
 * re-verified by auto.test.ts (its unsupported stub detects as 'unsupported') and
 * by vendor:sb:check (the vendored beacio-detect.js inlines core's writer+readers
 * and must still reproduce byte-for-byte).
 *
 * Note on @beacio/detect: detect's SOURCE does not duplicate the literal — its
 * vendored bundle (beacio-detect.js) re-uses core's readers because the vendor
 * esbuild step inlines core's platform.ts. So pinning core's single source pins
 * the value detect ships too.
 *
 * jsdom; @jest/globals import style (project_jest_globals_import_gotcha).
 * Run via
 *   npm --prefix packages/core test -- cdn-stub-marker
 */
import { afterEach, describe, expect, it } from '@jest/globals';
import { CDN_STUB_MARKER, detectPlatform, getBluetoothAPI } from '../src/platform';

const originalNavigator = globalThis.navigator;

function mockNavigator(value: unknown): void {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    writable: true,
    configurable: true,
  });
});

describe('SB-TST-35 — CDN_STUB_MARKER single source + reader parity', () => {
  // (a) Pin the wire value. A rename of the discriminator is then a deliberate,
  // test-visible change (and would have to update the value @beacio/detect's
  // vendored bundle ships, caught additionally by vendor:sb:check).
  it('pins the marker wire string to "__beacioCDNStub"', () => {
    expect(CDN_STUB_MARKER).toBe('__beacioCDNStub');
  });

  // (b) Reader parity through the PUBLIC API: a navigator.bluetooth whose ONLY
  // marker is keyed DYNAMICALLY by CDN_STUB_MARKER must be treated as absent by
  // both readers (detectPlatform → 'unsupported', getBluetoothAPI → null). Keying
  // the fixture off the constant (not a copy of the literal) proves the readers
  // honour the writer's key: a reader that checked a different string would see no
  // marker and mis-detect the stub as 'native'.
  it('both readers treat a stub keyed by CDN_STUB_MARKER as unsupported', () => {
    mockNavigator({ bluetooth: { [CDN_STUB_MARKER]: true } });
    expect(detectPlatform()).toBe('unsupported');
    expect(getBluetoothAPI()).toBeNull();
  });

  // Inversion: a bluetooth WITHOUT the marker (a genuine native impl) must NOT be
  // swallowed — guards against a reader that ignores the marker entirely (which
  // would equally defeat the discriminator by making it dead). Together with (b)
  // this pins the marker as the exact, sole native-vs-stub discriminator.
  it('a marker-less bluetooth is still detected as native', () => {
    mockNavigator({ bluetooth: { requestDevice: () => {} } });
    expect(detectPlatform()).toBe('native');
    expect(getBluetoothAPI()).not.toBeNull();
  });
});

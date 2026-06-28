/**
 * SB-SDK-15 — code-enforced "telemetry OFF by default for integrators" guarantee.
 *
 * The S&B production drop-in pitch ("closes the GDPR sub-processor gap", §6.3)
 * depends on the embedded polyfill shipping NETWORK-SILENT. Today that holds only
 * because no api key / attribution token is configured — a by-ABSENCE property
 * that a pasted attribution snippet could silently break. This file converts the
 * guarantee into a durable, CI-gated guard (the whole point of the issue):
 *
 *   A. Keyless silence — with NO `data-key` (meta[name=beacio-key]) and NO
 *      `__BEACIO_KEY__`, a full detect flow makes ZERO requests to the
 *      telemetry hosts (api.beacio.com / beacon.beacio.com). Locks the
 *      `if (!apiKey) return` gate in src/api.ts and the absence of any other
 *      client-side egress (@beacio/core is a pure thin message-forwarder with no
 *      fetch/sendBeacon — verified by grep; the ONLY SDK egress is reportEvent).
 *
 *   B. Minimal-payload field-bounding — even WITH a key, the only fields that can
 *      egress are the documented minimal set ({origin, ua} + event/timestamp). A
 *      caller cannot smuggle GATT values, device names, or serial numbers through
 *      reportEvent's `data` arg. AC3: "no GATT values, device names, or serial
 *      numbers can be emitted." This is the FAILING-FIRST half against today's
 *      unconstrained `...data` spread.
 *
 * These tests live in packages/detect/tests and so run under `npm run
 * test:packages` (-w packages/detect), which the gate:js pool invokes — no new
 * check script needed (AC6).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { initBeacio } from '../src/index';
import { reportEvent } from '../src/api';

const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/** The two beacio telemetry hosts reportEvent/validateApiKey can ever target. */
const TELEMETRY_HOSTS = ['api.beacio.com', 'beacon.beacio.com'];

/** Device-identifying fields that AC3 says must NEVER be able to egress. */
const FORBIDDEN_FIELDS = ['deviceName', 'serialNumber', 'serial', 'gattValue', 'value', 'keyId'];

/**
 * Mirror events.test.ts: present an iPhone Safari UA so isIOSSafari() is true,
 * and set the `data-beacio-extension` documentElement marker so
 * getExtensionInstallState() resolves synchronously to 'active' (no 2s poll).
 * This drives initBeacio down the active path that calls reportEvent(...,
 * 'extension_active') — the realistic flow whose silence we are locking.
 */
function pretendActiveIOSSafari(): void {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    get: () => IOS_SAFARI_UA,
  });
  document.documentElement.dataset.beacioExtension = 'true';
}

/** Collected (url, body) for every fetch/sendBeacon call the flow makes. */
interface CapturedRequest {
  url: string;
  body: string;
}

/**
 * Spy globalThis.fetch AND navigator.sendBeacon (the two egress primitives the
 * SDK could plausibly use) and record every call. Returns the capture array plus
 * a restore fn. fetch resolves a benign 200 so any keyed path that DOES fire
 * behaves normally.
 */
function spyEgress(): { calls: CapturedRequest[]; restore: () => void } {
  const calls: CapturedRequest[] = [];

  const realFetch = globalThis.fetch;
  const fetchSpy = jest.fn((input: unknown, init?: { body?: unknown }) => {
    calls.push({ url: String(input), body: init?.body == null ? '' : String(init.body) });
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;

  // jsdom leaves navigator.sendBeacon undefined; capture whatever is there and
  // restore it by re-defining the (configurable) property — no `delete` needed.
  const realSendBeacon = (navigator as Navigator & { sendBeacon?: unknown }).sendBeacon;
  const beaconSpy = jest.fn((url: unknown, data?: unknown) => {
    calls.push({ url: String(url), body: data == null ? '' : String(data) });
    return true;
  });
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    writable: true,
    value: beaconSpy,
  });

  return {
    calls,
    restore: () => {
      globalThis.fetch = realFetch;
      Object.defineProperty(navigator, 'sendBeacon', {
        configurable: true,
        writable: true,
        value: realSendBeacon,
      });
    },
  };
}

/** True if a captured URL points at either beacio telemetry host. */
function isTelemetryRequest(url: string): boolean {
  return TELEMETRY_HOSTS.some((host) => url.includes(host));
}

describe('SB-SDK-15: telemetry is OFF by default for integrators (network-silent)', () => {
  let egress: ReturnType<typeof spyEgress>;

  beforeEach(() => {
    pretendActiveIOSSafari();
    egress = spyEgress();
  });

  afterEach(() => {
    egress.restore();
    delete document.documentElement.dataset.beacioExtension;
    // Defensive: ensure no keyless-config marker leaks across tests.
    delete (window as unknown as { __BEACIO_KEY__?: string }).__BEACIO_KEY__;
    const meta = document.querySelector('meta[name="beacio-key"]');
    if (meta) meta.remove();
  });

  // AC2: NO data-key + NO attribution token => a full connect-style detect flow
  // emits ZERO requests to the telemetry hosts. This is the S&B production config
  // (auto.ts getApiKey() returns null => initBeacio gets no key => reportEvent
  // early-returns at api.ts:9). Locks the keyless-silence guarantee.
  it('makes NO request to api.beacio.com / beacon.beacio.com when no key is configured', async () => {
    // Sanity: the S&B production DOM has neither marker.
    expect(document.querySelector('meta[name="beacio-key"]')).toBeNull();
    expect((window as unknown as { __BEACIO_KEY__?: string }).__BEACIO_KEY__).toBeUndefined();

    await initBeacio({ banner: false });

    const telemetryCalls = egress.calls.filter((c) => isTelemetryRequest(c.url));
    expect(telemetryCalls).toEqual([]);
  });

  // AC3: even WITH a key, a caller cannot smuggle device-identifying data through
  // reportEvent. The emitted JSON body must contain ONLY the minimal allow-listed
  // fields. FAILS-FIRST on the unconstrained `...data` spread in api.ts.
  //
  // reportEvent's public signature is (apiKey, event) — there is NO data channel,
  // which is the type-level half of the guarantee. To prove the RUNTIME half (a
  // future refactor that re-adds a data arg still cannot egress device fields), we
  // force-call it through an any-typed alias with a device-identifying payload and
  // assert none of it reaches the wire.
  it('never emits GATT values, device names, or serial numbers even when a key is set', async () => {
    const forceReport = reportEvent as unknown as (
      apiKey: string,
      event: string,
      data?: Record<string, unknown>,
    ) => void;
    forceReport('wbl_live_test_key', 'extension_active', {
      deviceName: 'VOLCANO HYBRID',
      serialNumber: 'SB-0xDEADBEEF',
      serial: 'SB-0xDEADBEEF',
      gattValue: '0102030405',
      value: '0102030405',
      keyId: 'qvap-keyid-42',
    });
    // reportEvent is fire-and-forget; the fetch() is issued synchronously, so the
    // capture is already populated.

    expect(egress.calls.length).toBeGreaterThan(0);
    const [{ body }] = egress.calls;
    const raw = body.toLowerCase();

    for (const field of FORBIDDEN_FIELDS) {
      expect(raw).not.toContain(field.toLowerCase());
    }
    // And none of the actual secret values leak either.
    expect(raw).not.toContain('volcano');
    expect(raw).not.toContain('deadbeef');
    expect(raw).not.toContain('0102030405');
    expect(raw).not.toContain('qvap-keyid-42');

    // Positive shape: the documented minimal fields ARE present.
    const parsed = JSON.parse(body) as { events: Array<{ event: string; data: Record<string, unknown> }> };
    const event = parsed.events[0]!;
    expect(event.event).toBe('extension_active');
    expect(Object.keys(event.data).sort()).toEqual(['origin', 'ua']);
  });
});

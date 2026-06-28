/**
 * SB-SDK-16 — the SDK↔infra AUTH SEAM contract test.
 *
 * `@beacio/detect`'s `API_BASE` (`https://api.beacio.com`) is served by
 * `backend/worker` (SB-INF-01: `custom_domain = api.beacio.com`, NOT a phantom
 * host and NOT `beacon.beacio.com`), so AC#1 (a deployed Worker) already holds.
 * The remaining defect is AC#2 — "the chosen host matches whichever Worker
 * actually ingests": that Worker authenticates the keyed `/v1/config` +
 * `/v1/events` paths ONLY via `Authorization: Bearer` (backend/worker/src/index.ts
 * `extractBearerKey`, lines 256-259; both handlers `if (!apiKey) return 401`,
 * lines 502 & 643). The sole `?key=` reader is `/v1/detect` (the <img> pixel,
 * line 471), which detect never calls. So today's source — which sends the key as
 * a `?key=` query param with NO Authorization header (src/api.ts) — is rejected
 * 401 by the real ingest Worker: validateApiKey always returns null and reportEvent
 * events are silently dropped. The host is right; the SDK never reaches it.
 *
 * This test locks the wire-auth contract: the key MUST travel as
 * `Authorization: Bearer <key>` and MUST NOT appear as a `key=` query param.
 * It FAILS-FIRST on today's `?key=` source and a future revert to query-param
 * auth turns it RED again. The Worker's CORS contract already permits the
 * Authorization request header (index.ts:242 `Access-Control-Allow-Headers:
 * Content-Type, Authorization`), so no infra change rides along with this.
 *
 * Lives in packages/detect/tests so it runs under the detect Jest project the
 * gate:js pool already invokes — no new check script needed.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { reportEvent, validateApiKey } from '../src/api';

const TEST_KEY = 'wbl_live_key';

/** One captured fetch call: the request URL + its (lower-cased-name) headers. */
interface CapturedFetch {
  url: string;
  headers: Record<string, string>;
}

/**
 * Spy globalThis.fetch, recording each call's URL and request headers, and
 * resolve a benign 200 so validateApiKey's `res.json()` path runs normally.
 * Header keys are normalised to lower-case so the assertion is case-insensitive
 * (HTTP header names are case-insensitive; the source uses `Authorization`).
 */
function spyFetch(): { calls: CapturedFetch[]; restore: () => void } {
  const calls: CapturedFetch[] = [];
  const realFetch = globalThis.fetch;

  const fetchSpy = jest.fn((input: unknown, init?: { headers?: unknown }) => {
    const rawHeaders = (init?.headers ?? {}) as Record<string, string>;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawHeaders)) headers[k.toLowerCase()] = v;
    calls.push({ url: String(input), headers });
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;

  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

describe('SB-SDK-16: detect speaks Authorization: Bearer to the ingesting Worker', () => {
  let fetchSpy: ReturnType<typeof spyFetch>;

  beforeEach(() => {
    fetchSpy = spyFetch();
  });

  afterEach(() => {
    fetchSpy.restore();
  });

  // AC#2 — reportEvent (POST /v1/events) must authenticate via the header the
  // Worker actually reads, not a ?key= query param the Worker ignores (→ 401 →
  // dropped events).
  it('reportEvent sends the key as Authorization: Bearer and never as ?key=', () => {
    reportEvent(TEST_KEY, 'extension_active');

    expect(fetchSpy.calls.length).toBe(1);
    const { url, headers } = fetchSpy.calls[0]!;

    // Key travels in the header the Worker authenticates with…
    expect(headers.authorization).toBe(`Bearer ${TEST_KEY}`);
    // …and NOT as a query param (the Worker only reads ?key= for /v1/detect).
    expect(url).not.toContain('key=');
    expect(url).not.toContain(TEST_KEY);
    // Still the right endpoint.
    expect(url).toContain('/v1/events');
  });

  // AC#2 — validateApiKey (GET /v1/config) likewise: header-auth or it always
  // 401s and returns null, so a real key can never resolve operator config.
  it('validateApiKey sends the key as Authorization: Bearer and never as ?key=', async () => {
    await validateApiKey(TEST_KEY);

    expect(fetchSpy.calls.length).toBe(1);
    const { url, headers } = fetchSpy.calls[0]!;

    expect(headers.authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(url).not.toContain('key=');
    expect(url).not.toContain(TEST_KEY);
    expect(url).toContain('/v1/config');
  });
});

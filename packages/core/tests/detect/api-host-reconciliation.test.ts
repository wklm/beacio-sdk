/**
 * SB-SDK-16 — the SDK↔infra HOST RECONCILIATION contract test.
 *
 * Sibling api-auth.test.ts locks the *auth* dimension of SB-SDK-16 (the key must
 * travel as `Authorization: Bearer`, never `?key=`). This file locks the
 * *host* dimension, which is the issue's headline acceptance criterion:
 *
 *   AC#1 "API_BASE resolves to a deployed Worker — the SDK no longer points at a
 *         phantom host."
 *   AC#2 "The chosen host matches whichever Worker actually ingests."
 *
 * `@beacio/detect`'s `API_BASE` (src/api.ts) POSTs `/v1/events` and GETs
 * `/v1/config`. The Worker that actually serves those keyed paths is the
 * `ioswebble-api` Worker at `cloudflare/workers/api`, which declares the ingest
 * host as a `custom_domain` route in `cloudflare/workers/api/wrangler.toml`. The original WF2
 * triage evidence got this WRONG — it claimed `api.beacio.com` was a phantom host
 * and that live ingest was `beacon.beacio.com`. `beacon.beacio.com` is a SEPARATE
 * Worker (cloudflare/workers/beacon) that has NO `/v1/events` or `/v1/config`
 * route, so repointing `API_BASE` there (the "obvious" fix suggested by the stale
 * evidence) would silently 404/401 every keyed call.
 *
 * This test couples the two facts so they cannot drift apart again:
 *   1. `API_BASE`'s host MUST be declared as a route in the api Worker's
 *      wrangler.toml (the Worker that owns the /v1/events + /v1/config handlers).
 *   2. `API_BASE` MUST NOT be a known non-ingest host (the beacon Worker), which
 *      would re-introduce the phantom-host defect the issue describes.
 *
 * It reads the two source-of-truth files directly (no network), so it is a pure,
 * fast, CI-gated guard. A future revert of `API_BASE` to a phantom/non-ingest
 * host — or removal of the matching route from the Worker — turns it RED.
 *
 * Lives in packages/detect/tests so it runs under the detect Jest project the
 * gate:js pool already invokes (`npm run test:packages`) — no new check script.
 */
import { describe, expect, it } from '@jest/globals';

// Node builtins via require() (ts-jest emits CommonJS), typed by @types/node
// through tests/tsconfig.json.
const { readFileSync } = require('fs');
const { resolve } = require('path');

/** packages/core/tests/detect -> repo root. */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const API_TS = resolve(REPO_ROOT, 'packages/core/src/detect/api.ts');
const WORKER_WRANGLER = resolve(REPO_ROOT, 'cloudflare/workers/api/wrangler.toml');

/** The detect keyed paths whose ingest host this test reconciles. */
const KEYED_PATHS = ['/v1/events', '/v1/config'];

/**
 * Known host that ingests neither keyed path — repointing API_BASE here is the
 * exact regression the issue warns against (the beacon Worker has no /v1/events
 * or /v1/config handler).
 */
const NON_INGEST_HOSTS = ['beacon.beacio.com'];

/** Extract the literal assigned to `const API_BASE = '...'` in src/api.ts. */
function readApiBase(): string {
  const src = readFileSync(API_TS, 'utf8');
  const m = src.match(/const\s+API_BASE\s*=\s*['"]([^'"]+)['"]/);
  if (!m) throw new Error(`Could not find API_BASE literal in ${API_TS}`);
  return m[1]!;
}

/**
 * Parse the host portion of every `routes = [...]` entry in the Worker's
 * wrangler.toml. Entries look like `{ pattern = "api.beacio.com", custom_domain
 * = true }` or `{ pattern = "api.ioswebble.com/*", zone_name = "ioswebble.com" }`
 * — we take the pattern, strip any path suffix, and lower-case it.
 */
function readWorkerRouteHosts(): Set<string> {
  const toml = readFileSync(WORKER_WRANGLER, 'utf8');
  const hosts = new Set<string>();
  for (const m of toml.matchAll(/pattern\s*=\s*"([^"]+)"/g)) {
    const host = m[1]!.split('/')[0]!.trim().toLowerCase();
    if (host) hosts.add(host);
  }
  return hosts;
}

describe('SB-SDK-16: detect API_BASE host matches the Worker that ingests /v1/events + /v1/config', () => {
  // AC#1 + AC#2 — the host the SDK points at is a real, deployed route of the
  // api Worker (the one with the keyed-path handlers), not a phantom.
  it('API_BASE host is declared as an api Worker wrangler route', () => {
    const apiBase = readApiBase();
    const host = new URL(apiBase).host.toLowerCase();
    const routeHosts = readWorkerRouteHosts();

    expect(routeHosts.has(host)).toBe(true);
  });

  // Guard against the stale-evidence "fix": pointing at the beacon Worker (or any
  // other non-ingest host), which has no /v1/events or /v1/config route.
  it('API_BASE host is NOT a known non-ingest host (e.g. the beacon Worker)', () => {
    const host = new URL(readApiBase()).host.toLowerCase();
    expect(NON_INGEST_HOSTS).not.toContain(host);
  });

  // Pin the assumption this guard rests on: the api Worker really does own the
  // keyed handlers. If those routes ever move to another Worker, this fails and
  // forces the guard (and the routeHosts source-of-truth) to be re-pointed too,
  // rather than silently passing against the wrong Worker.
  it('the api Worker owns the keyed ingest paths the SDK calls', () => {
    const workerSrc = readFileSync(resolve(REPO_ROOT, 'cloudflare/workers/api/src/index.ts'), 'utf8');
    for (const p of KEYED_PATHS) {
      expect(workerSrc).toContain(`path === '${p}'`);
    }
  });
});

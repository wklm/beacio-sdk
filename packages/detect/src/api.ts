/**
 * Analytics event reporter and API key validator.
 * Fire-and-forget — analytics must never throw or block.
 */

// SB-SDK-16: api.beacio.com is the DEPLOYED ingest Worker — backend/worker
// (the `ioswebble-api` Worker) serves it via `custom_domain` and owns the keyed
// /v1/events + /v1/config handlers. It is NOT a phantom host, and it is NOT
// beacon.beacio.com (a separate Worker with no such routes — the WF2 triage
// evidence got this wrong; repointing here would silently 404/401). The host↔
// Worker coupling is locked by tests/api-host-reconciliation.test.ts so it can't
// drift. No behaviour rides on this while unkeyed: reportEvent early-returns when
// !apiKey (below), so this only matters on the keyed-tenant launch path.
const API_BASE = 'https://api.beacio.com';

/**
 * SB-SDK-15: the EXHAUSTIVE allow-list of fields that may ever leave the browser.
 * The S&B drop-in pitch ("closes the GDPR sub-processor gap", §6.3) depends on the
 * embedded polyfill staying network-silent AND, when an operator opts in with a
 * key, emitting only this minimal non-device set. We build the egress object from
 * these fixed keys instead of spreading caller-supplied `data`, so a future caller
 * passing reportEvent(key, evt, { deviceName, serialNumber, gattValue }) CANNOT
 * smuggle GATT values, device names, or serial numbers onto the wire — the guard
 * is structural, not by-convention (tests/telemetry-privacy.test.ts is the gate).
 */
function buildEventData(): Record<string, string> {
  return { origin: location.hostname, ua: navigator.userAgent };
}

export function reportEvent(apiKey: string, event: string, _data?: Record<string, unknown>): void {
  if (!apiKey) return;
  try {
    // SB-SDK-16: the ingesting Worker (backend/worker) authenticates the keyed
    // /v1/events path ONLY via `Authorization: Bearer` (extractBearerKey); a
    // `?key=` query param is read solely by the /v1/detect pixel and would 401
    // here, silently dropping every event. Send the key in the header.
    fetch(`${API_BASE}/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        events: [{
          event,
          data: buildEventData(),
          timestamp: Date.now(),
        }],
      }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* analytics must never throw */ }
}

export async function validateApiKey(
  apiKey: string,
): Promise<{ operatorId: string; appName: string | null; plan: string } | null> {
  try {
    // SB-SDK-16: /v1/config is Bearer-auth-only on the Worker; a `?key=` param
    // is ignored there and the handler returns 401 → null. Send the key in the
    // Authorization header so a real key can resolve operator config.
    const res = await fetch(`${API_BASE}/v1/config`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

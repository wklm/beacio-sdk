import { describe, expect, it, vi } from 'vitest';
import { TELEMETRY_ENDPOINT, TelemetryClient } from '../src/telemetry.js';

describe('TelemetryClient', () => {
  it('POSTs a well-formed event to /mcp-telemetry matching playbook §8.1', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const client = new TelemetryClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      env: { MCP_CLIENT: 'claude-desktop', MCP_CLIENT_VERSION: '1.2.3' },
    });

    const payload = client.send({
      tool: 'webble_install_plan',
      success: true,
      duration_ms: 42,
      attribution_token: 'webble_202604_mcp_abcdefgh01',
    });
    expect(payload).toEqual({
      tool: 'webble_install_plan',
      client_name: 'claude-desktop',
      client_version: '1.2.3',
      success: true,
      duration_ms: 42,
      attribution_token: 'webble_202604_mcp_abcdefgh01',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(TELEMETRY_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('returns null and skips the network when WEBBLE_MCP_TELEMETRY=0', () => {
    const fetchMock = vi.fn();
    const client = new TelemetryClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      env: { WEBBLE_MCP_TELEMETRY: '0' },
    });
    expect(
      client.send({ tool: 'webble_example', success: true, duration_ms: 0 }),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['false', 'off', 'no', 'FALSE', 'Off', ' no '])(
    'returns null when WEBBLE_MCP_TELEMETRY=%j',
    (value) => {
      const fetchMock = vi.fn();
      const client = new TelemetryClient({
        fetchImpl: fetchMock as unknown as typeof fetch,
        env: { WEBBLE_MCP_TELEMETRY: value },
      });
      expect(
        client.send({ tool: 'webble_example', success: true, duration_ms: 0 }),
      ).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['1', 'true'])('honors DO_NOT_TRACK=%j', (value) => {
    const fetchMock = vi.fn();
    const client = new TelemetryClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      env: { DO_NOT_TRACK: value },
    });
    expect(
      client.send({ tool: 'webble_example', success: true, duration_ms: 0 }),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays enabled when WEBBLE_MCP_TELEMETRY=true (only falsey values opt out)', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const client = new TelemetryClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      env: { WEBBLE_MCP_TELEMETRY: 'true' },
    });
    expect(
      client.send({ tool: 'webble_example', success: true, duration_ms: 0 }),
    ).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('defaults client_name to "" and client_version to "" when env is blank', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const client = new TelemetryClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      env: {},
    });
    const payload = client.send({ tool: 'webble_example', success: true, duration_ms: 1 });
    expect(payload?.client_name).toBe('');
    expect(payload?.client_version).toBe('');
    expect(payload?.attribution_token).toBeNull();
  });

  it('populates client_version from MCP_CLIENT_VERSION env', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const client = new TelemetryClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      env: { MCP_CLIENT: 'cursor', MCP_CLIENT_VERSION: '0.42.0' },
    });
    const payload = client.send({ tool: 'webble_example', success: true, duration_ms: 5 });
    expect(payload?.client_name).toBe('cursor');
    expect(payload?.client_version).toBe('0.42.0');
  });

  it('emits telemetry for failed tool invocations (success=false)', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const client = new TelemetryClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      env: {},
    });
    const payload = client.send({ tool: 'webble_example', success: false, duration_ms: 12 });
    expect(payload?.success).toBe(false);
    expect(payload?.duration_ms).toBe(12);
  });

  it('clamps duration_ms to a non-negative integer', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const client = new TelemetryClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      env: {},
    });
    const negative = client.send({ tool: 'webble_example', success: true, duration_ms: -5 });
    expect(negative?.duration_ms).toBe(0);
    const fractional = client.send({ tool: 'webble_example', success: true, duration_ms: 17.9 });
    expect(fractional?.duration_ms).toBe(17);
    expect(Number.isInteger(fractional?.duration_ms)).toBe(true);
    expect(fractional?.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('swallows fetch rejections (fire-and-forget)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    const client = new TelemetryClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      env: {},
    });
    // Must not throw synchronously or asynchronously.
    expect(() =>
      client.send({ tool: 'webble_example', success: true, duration_ms: 0 }),
    ).not.toThrow();
    // Let the microtask flush so the .catch runs.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalled();
  });
});

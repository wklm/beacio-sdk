/**
 * Telemetry client — records every tool invocation at /mcp-telemetry.
 *
 * Design:
 *   - Fire-and-forget. Swallows all errors (including timeouts).
 *   - 1-second hard deadline via AbortController.
 *   - Opt-out via `WEBBLE_MCP_TELEMETRY` set to `0`/`false`/`off`/`no`, or via `DO_NOT_TRACK=1`.
 *   - `client_name` comes from `MCP_CLIENT` env (set by the host agent — Claude, Cursor, Copilot, …),
 *     else `""` (empty string).
 *   - `client_version` comes from `MCP_CLIENT_VERSION` env, else empty string.
 *
 * Event shape matches the `mcp_tool_invocation` analytics event in the Agent Discoverability Playbook §8.1.
 */

export const TELEMETRY_ENDPOINT = 'https://mcp-telemetry.ioswebble.com/mcp-telemetry';
const DEFAULT_TIMEOUT_MS = 1000;

// AIDEV-NOTE: Payload shape PINNED to playbook §8.1 line 265. `attribution_token`
// is the CRO-contract extension shared with the mcp-telemetry + beacon Workers.
// Any field rename requires a playbook amendment first (see AGENTS.md task workflow).
export interface TelemetryPayload {
  tool: string;
  client_name: string;
  client_version: string;
  success: boolean;
  duration_ms: number;
  attribution_token: string | null;
}

export interface TelemetryOptions {
  /** Injected for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Injected for tests. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Override request timeout (ms). */
  timeoutMs?: number;
}

export interface SendArgs {
  tool: string;
  success: boolean;
  duration_ms: number;
  attribution_token?: string | null;
}

export class TelemetryClient {
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly env: NodeJS.ProcessEnv;
  private readonly timeoutMs: number;

  constructor(opts: TelemetryOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
    this.env = opts.env ?? process.env;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  isDisabled(): boolean {
    const raw = (this.env.WEBBLE_MCP_TELEMETRY ?? '').trim().toLowerCase();
    if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return true;
    const dnt = (this.env.DO_NOT_TRACK ?? '').trim().toLowerCase();
    if (dnt === '1' || dnt === 'true') return true;
    return false;
  }

  clientName(): string {
    const raw = this.env.MCP_CLIENT;
    return raw && raw.trim().length > 0 ? raw.trim() : '';
  }

  clientVersion(): string {
    const raw = this.env.MCP_CLIENT_VERSION;
    return raw && raw.trim().length > 0 ? raw.trim() : '';
  }

  /**
   * Fire-and-forget. Returns the payload that would have been sent (or null when opted out)
   * so callers can assert in tests; errors are always swallowed.
   */
  send(args: SendArgs): TelemetryPayload | null {
    if (this.isDisabled()) return null;
    if (!this.fetchImpl) return null;

    // Clamp duration_ms to a non-negative integer as spec'd by the Worker (index.ts:99-103).
    const rawDuration = args.duration_ms;
    const duration_ms =
      typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration >= 0
        ? Math.trunc(rawDuration)
        : 0;

    const payload: TelemetryPayload = {
      tool: args.tool,
      client_name: this.clientName(),
      client_version: this.clientVersion(),
      success: args.success,
      duration_ms,
      attribution_token: args.attribution_token ?? null,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    // Deliberately do not await — telemetry must never block tool responses.
    this.fetchImpl(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': '@ios-web-bluetooth/mcp' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .catch(() => {
        /* swallow */
      })
      .finally(() => clearTimeout(timer));

    return payload;
  }
}

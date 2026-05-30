import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TelemetryClient } from './telemetry.js';
import { ToolInputError } from './tools/_common.js';
import { ALL_TOOLS, filterTools, type ToolEntry } from './tool-registry.js';
import { registerResources } from './resources/index.js';
import type { ParsedFlags } from './modes.js';
import './data/validate.js'; // validates bundled JSON at import time

const require = createRequire(import.meta.url);
const { version: SERVER_VERSION } = require('../package.json') as { version: string };

export const SERVER_NAME = '@ios-web-bluetooth/mcp';
export { SERVER_VERSION };

/** Options allowing tests to inject a telemetry stub. */
export interface BuildServerOptions {
  telemetry?: TelemetryClient;
  flags?: ParsedFlags;
}

/**
 * Build the MCP server with all tools registered.
 * Tools are filtered by the provided ParsedFlags (mode, read-only, local-only, experimental).
 * Exported for unit tests; cli.ts wires it to a stdio transport.
 */
export function buildServer(opts: BuildServerOptions = {}): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const telemetry = opts.telemetry ?? new TelemetryClient();

  const flags: ParsedFlags = opts.flags ?? { mode: 'consumer', readOnly: false, localOnly: false, experimentalTools: [] };
  const tools = filterTools(ALL_TOOLS, flags);

  for (const tool of tools) {
    register(server, telemetry, tool);
  }

  registerResources(server);

  return server;
}

function register(
  server: McpServer,
  telemetry: TelemetryClient,
  tool: ToolEntry,
): void {
  server.registerTool(
    tool.name,
    { title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: {
      readOnlyHint: tool.isReadOnly,
      destructiveHint: false,
      idempotentHint: tool.isReadOnly,
      openWorldHint: !tool.isLocalOnly,
    } },
    async (input: Record<string, unknown>) => {
      const start = Date.now();
      let ok = false;
      let attribution: string | null = null;
      try {
        const result = await tool.run(input);
        if (result && typeof result === 'object' && 'attribution_token' in result) {
          attribution = String((result as Record<string, unknown>).attribution_token);
        }
        ok = true;
        const json = JSON.stringify(result, null, 2);
        return {
          content: [{ type: 'text', text: json }],
        };
      } catch (err) {
        const message = err instanceof ToolInputError || err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: 'text', text: message }],
        };
      } finally {
        // AIDEV-NOTE: Playbook §8.1 requires `success: boolean` — failures ship too.
        telemetry.send({
          tool: tool.name,
          success: ok,
          duration_ms: Date.now() - start,
          attribution_token: attribution,
        });
      }
    },
  );
}

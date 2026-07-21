#!/usr/bin/env node
/**
 * Entry point for `beacio-mcp`. Wires the MCP server to stdio so hosts
 * (Claude Desktop, Cursor, Copilot, etc.) can spawn and speak MCP.
 */
import { createRequire } from 'node:module';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.js';
import { parseFlags } from './flags.js';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stderr.write(
    `Usage: beacio-mcp [options]\n\nOptions:\n  --consumer                   Consumer tool visibility mode (default)\n  --developer                  Developer tool visibility mode (includes all tools)\n  --read-only                  Expose only read-only tools\n  --local-only                 Expose only local tools\n  -E, --experimental-tool <name>  Enable a specific experimental tool (repeatable)\n  --help, -h                   Show this help message\n  --version, -v                Print version and exit\n`,
  );
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const require = createRequire(import.meta.url);
  const pkg = require('../package.json') as { version: string };
  process.stdout.write(`${pkg.version}\n`);
  process.exit(0);
}

let server: ReturnType<typeof buildServer>;

async function main(): Promise<void> {
  const flags = parseFlags();
  server = buildServer({ flags });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

let shuttingDown = false;

async function shutdown(signal: string) {
  // AIDEV-NOTE: intentionally no logging on stdout — stdio transport owns it.
  if (shuttingDown) return;
  shuttingDown = true;

  void setTimeout(() => {
    console.error(`[beacio-mcp] forced exit after ${signal}`);
    process.exit(1);
  }, 5000).unref();

  try {
    await server?.close?.();
    process.exit(0);
  } catch {
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[beacio-mcp] unhandled rejection:', reason);
  process.exit(1);
});

main().catch((err) => {
  console.error('[beacio-mcp] fatal:', err);
  process.exit(1);
});

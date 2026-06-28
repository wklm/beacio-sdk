/**
 * Public programmatic API for @beacio/mcp.
 *
 * CLI consumers use `beacio-mcp` (bin); library consumers import from here.
 */
export { buildServer, SERVER_NAME, SERVER_VERSION } from './server.js';
export type { BuildServerOptions } from './server.js';
export type { ParsedFlags, ServerMode } from './modes.js';
export { filterTools, ALL_TOOLS } from './tool-registry.js';
export type { ToolEntry } from './tool-registry.js';

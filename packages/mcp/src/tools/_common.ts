/**
 * Shared tool types + data loaders.
 *
 * Each tool exports:
 *   - `name`: the MCP tool name (matches `beacio_*`).
 *   - `schema`: a plain JSON Schema fragment (input shape).
 *   - `run(input)`: pure function producing the typed response.
 *
 * No tool fetches at runtime. All content is bundled JSON (see ./data).
 */

export interface ToolDefinition<TInput, TOutput> {
  name: string;
  title: string;
  description: string;
  run(input: TInput): TOutput;
}

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}

const DOCS_BASE = 'https://beacio.com/docs-md';

export function docsUrl(path: string, hash?: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${DOCS_BASE}${normalized}${hash ? `#${hash}` : ''}`;
}

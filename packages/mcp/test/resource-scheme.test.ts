import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerResources } from '../src/resources/index.js';

/**
 * Resource URI scheme contract.
 *
 * The MCP resource scheme was renamed `ioswebble://` -> `beacio://` (breaking; v2.0.0)
 * so the resource identity matches the beacio brand. The literal scheme lives in two
 * paired places per resource in src/resources/index.ts: the `server.resource(name, ...)`
 * name argument and the `contents[].uri` value returned by the read callback. Both must
 * flip together. This test locks the contract: every registered resource — and every URI
 * it echoes back when read — must use `beacio://`, and `ioswebble://` must never resurface.
 *
 * Note: the @modelcontextprotocol SDK's `resource(name, uri, cb)` signature keys the
 * internal registry by the SECOND arg (the human description), exposing the scheme
 * literal as the registered `.name`. We assert on `.name` (registration side) and on the
 * read callback's `contents[].uri` (wire side) — the two places the scheme literal lives.
 */

function collectRegistered(): { name: string; readCallback: () => Promise<unknown> }[] {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerResources(server);
  // _registeredResources is keyed by the registered URI (the description arg);
  // each value carries the scheme literal as `.name` plus the read callback.
  const registry = (server as unknown as {
    _registeredResources: Record<string, { name: string; readCallback: () => Promise<unknown> }>;
  })._registeredResources;
  return Object.values(registry);
}

describe('resource URI scheme', () => {
  const registered = collectRegistered();

  it('registers at least the seven documented resources', () => {
    expect(registered.length).toBeGreaterThanOrEqual(7);
  });

  it('every registered resource name uses the beacio:// scheme', () => {
    for (const r of registered) {
      expect(r.name.startsWith('beacio://')).toBe(true);
    }
  });

  it('never registers a legacy ioswebble:// resource', () => {
    for (const r of registered) {
      expect(r.name).not.toContain('ioswebble://');
    }
  });

  it('every read callback echoes back beacio:// uris and no ioswebble:// uris', async () => {
    for (const r of registered) {
      const result = (await r.readCallback()) as { contents: { uri: string }[] };
      for (const content of result.contents) {
        expect(content.uri.startsWith('beacio://')).toBe(true);
        expect(content.uri).not.toContain('ioswebble://');
      }
    }
  });

  it('the changelog resource documents the scheme rename', async () => {
    const changelog = registered.find((r) => r.name === 'beacio://changelog');
    expect(changelog).toBeDefined();
    const result = (await changelog!.readCallback()) as { contents: { text: string }[] };
    expect(result.contents[0]?.text).toContain('`ioswebble://` → `beacio://`');
  });
});

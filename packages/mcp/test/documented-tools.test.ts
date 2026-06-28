import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ALL_TOOLS } from '../src/tool-registry.js';

// AIDEV-NOTE: Regression guard for the docs-drift bug where README.md and
// resources/index.ts listed only 6 of the 11 registered tools. These tests
// assert the documented tool names stay in sync with ALL_TOOLS so the lists
// cannot silently drift again.

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL_NAME_RE = /beacio_[a-z0-9_]+/g;
// Attribution tokens keep the legacy `beacio_` prefix (e.g. beacio_202604_mcp_xxxx)
// and are not tool names — exclude them from the documented-name extraction.
const ATTRIBUTION_TOKEN_RE = /^beacio_\d{6}_mcp_/;

const REGISTERED_TOOL_NAMES = ALL_TOOLS.map((t) => t.name).sort();

function documentedToolNames(relativePath: string): string[] {
  const text = readFileSync(join(PKG_ROOT, relativePath), 'utf8');
  const found = new Set(
    (text.match(TOOL_NAME_RE) ?? []).filter((name) => !ATTRIBUTION_TOKEN_RE.test(name)),
  );
  return [...found].sort();
}

describe('documented tool lists stay in sync with ALL_TOOLS', () => {
  it('sanity: there are 12 registered tools (8 consumer + 4 developer)', () => {
    expect(REGISTERED_TOOL_NAMES.length).toBe(12);
    expect(ALL_TOOLS.filter((t) => t.mode === 'consumer').length).toBe(8);
    expect(ALL_TOOLS.filter((t) => t.mode === 'developer').length).toBe(4);
  });

  it('README.md documents exactly every registered tool', () => {
    expect(documentedToolNames('README.md')).toEqual(REGISTERED_TOOL_NAMES);
  });

  it('resources/index.ts changelog documents exactly every registered tool', () => {
    expect(documentedToolNames('src/resources/index.ts')).toEqual(REGISTERED_TOOL_NAMES);
  });
});

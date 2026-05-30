import { describe, expect, it } from 'vitest';
import { filterTools, ALL_TOOLS } from '../src/tool-registry.js';
import { runBestPractices } from '../src/tools/dev/best-practices.js';
import { runSearchDocs } from '../src/tools/dev/search-docs.js';
import { runListStructure } from '../src/tools/dev/list-structure.js';
import { runFindExamples } from '../src/tools/dev/find-examples.js';
import type { ParsedFlags } from '../src/modes.js';

const CONSUMER_FLAGS: ParsedFlags = {
  mode: 'consumer',
  readOnly: false,
  localOnly: false,
  experimentalTools: [],
};

const DEVELOPER_FLAGS: ParsedFlags = {
  mode: 'developer',
  readOnly: false,
  localOnly: false,
  experimentalTools: [],
};

const CONSUMER_TOOL_NAMES = ALL_TOOLS
  .filter((t) => t.mode === 'consumer')
  .map((t) => t.name);

const DEVELOPER_TOOL_NAMES = [
  'webble_dev_best_practices',
  'webble_dev_search_docs',
  'webble_dev_list_structure',
  'webble_dev_find_examples',
];

describe('filterTools', () => {
  it('returns only consumer tools in consumer mode', () => {
    const tools = filterTools(ALL_TOOLS, CONSUMER_FLAGS);
    const names = tools.map((t) => t.name);
    expect(names).toEqual(CONSUMER_TOOL_NAMES);
    for (const devName of DEVELOPER_TOOL_NAMES) {
      expect(names).not.toContain(devName);
    }
  });

  it('returns both consumer and developer tools in developer mode', () => {
    const tools = filterTools(ALL_TOOLS, DEVELOPER_FLAGS);
    const names = tools.map((t) => t.name);
    for (const consumerName of CONSUMER_TOOL_NAMES) {
      expect(names).toContain(consumerName);
    }
    for (const devName of DEVELOPER_TOOL_NAMES) {
      expect(names).toContain(devName);
    }
  });

  it('developer mode returns more tools than consumer mode', () => {
    const consumer = filterTools(ALL_TOOLS, CONSUMER_FLAGS);
    const developer = filterTools(ALL_TOOLS, DEVELOPER_FLAGS);
    expect(developer.length).toBeGreaterThan(consumer.length);
  });
});

describe('webble_dev_best_practices', () => {
  it('returns content when AGENTS.md exists in cwd', () => {
    // AGENTS.md exists at repo root (the cwd during test)
    const out = runBestPractices({});
    expect(out.content.length).toBeGreaterThan(0);
    expect(out.source_file).toContain('AGENTS.md');
  });
});

describe('webble_dev_search_docs', () => {
  it('returns results for a known keyword', () => {
    const out = runSearchDocs({ query: 'react hooks' });
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.query).toBe('react hooks');
  });

  it('returns empty results for nonsense query', () => {
    const out = runSearchDocs({ query: 'xyzzyplugh' });
    expect(out.results).toEqual([]);
  });
});

describe('webble_dev_list_structure', () => {
  it('returns a tree for the current directory', () => {
    const out = runListStructure({});
    expect(out.tree.type).toBe('directory');
    expect(out.depth).toBe(3);
    expect(out.file_count).toBeGreaterThanOrEqual(0);
    expect(out.dir_count).toBeGreaterThanOrEqual(0);
  });

  it('rejects path traversal attempts', () => {
    expect(() => runListStructure({ rootPath: '../../etc/passwd' })).toThrow();
    expect(() => runListStructure({ rootPath: '/etc/passwd' })).toThrow();
    expect(() => runListStructure({ rootPath: '../../../tmp' })).toThrow();
  });
});

describe('webble_dev_find_examples', () => {
  it('returns matches for a known keyword', () => {
    const out = runFindExamples({ query: 'heart rate' });
    expect(out.matches.length).toBeGreaterThan(0);
    expect(out.query).toBe('heart rate');
  });

  it('returns empty matches for nonsense query', () => {
    const out = runFindExamples({ query: 'xyzzyplugh' });
    expect(out.matches).toEqual([]);
  });
});

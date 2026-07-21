import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runSearchDocs } from '../src/tools/dev/search-docs.js';
import { runFindExamples } from '../src/tools/dev/find-examples.js';
import { EXAMPLE_ENTRIES } from '../src/tools/dev/catalog.js';

/**
 * Ranking-stability snapshot for the developer-tool catalogs.
 *
 * search-docs.ts (topic-centric) and find-examples.ts (file-centric) hand-maintain
 * overlapping catalogs. This test pins the ORDER of the top-5 results (the identity
 * dimension only — topic for docs, file for examples) for a representative set of
 * queries, so a refactor that unifies the catalog can prove it did not regress
 * ranking. Relevance scores may legitimately change when scoring is unified; what
 * must NOT change is the identity and order of the surfaced results.
 */

const DOC_QUERIES = [
  'react hooks',
  'install',
  'quickstart',
  'requestDevice',
  'error codes',
  'heart rate',
  'battery',
  'ios safari banner',
  'user gesture click',
  'profiles',
  'device connect',
  'getAvailability',
  'beacio class',
  'troubleshoot disconnect',
  'defineProfile custom',
  'notifications',
  'api reference',
];

const EXAMPLE_QUERIES = [
  'beacio class',
  'device connect',
  'error',
  'uuid resolve',
  'heart rate',
  'battery level',
  'device info manufacturer',
  'defineProfile custom',
  'react provider',
  'react hooks',
  'detect ios',
  'mcp server',
  'install plan framework',
  'example code profile',
  'requestDevice',
  'gatt',
  'core entry point',
];

/** Top-5 result identities (topic) per doc query, in rank order. */
function docTop5(query: string): string[] {
  return runSearchDocs({ query }).results.slice(0, 5).map((r) => r.topic);
}

/** Top-5 result identities (file) per example query, in rank order. */
function exampleTop5(query: string): string[] {
  return runFindExamples({ query }).matches.slice(0, 5).map((m) => m.file);
}

describe('dev catalog ranking stability — search_docs', () => {
  for (const query of DOC_QUERIES) {
    it(`top-5 order is stable for: "${query}"`, () => {
      expect(docTop5(query)).toMatchSnapshot();
    });
  }
});

describe('dev catalog ranking stability — find_examples', () => {
  for (const query of EXAMPLE_QUERIES) {
    it(`top-5 order is stable for: "${query}"`, () => {
      expect(exampleTop5(query)).toMatchSnapshot();
    });
  }
});

describe('dev catalog file facets exist on disk', () => {
  // Guards against phantom file facets: every examples-facet path must point at
  // a real file in the repo (paths are repo-root-relative).
  const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../..');

  for (const entry of EXAMPLE_ENTRIES) {
    it(`catalog entry "${entry.id}" points at a real file: ${entry.file}`, () => {
      const abs = resolve(repoRoot, entry.file!);
      expect(existsSync(abs), `missing file: ${entry.file}`).toBe(true);
      expect(statSync(abs).isFile(), `not a regular file: ${entry.file}`).toBe(true);
    });
  }
});

describe('dev catalog output-shape invariants', () => {
  it('search_docs returns topic/url/snippet/relevance keys', () => {
    const out = runSearchDocs({ query: 'react hooks' });
    expect(out.results.length).toBeGreaterThan(0);
    expect(Object.keys(out.results[0]).sort()).toEqual(
      ['relevance', 'snippet', 'topic', 'url'].sort(),
    );
    expect(out.query).toBe('react hooks');
  });

  it('find_examples returns file/line/snippet/category/relevance keys', () => {
    const out = runFindExamples({ query: 'heart rate' });
    expect(out.matches.length).toBeGreaterThan(0);
    expect(Object.keys(out.matches[0]).sort()).toEqual(
      ['category', 'file', 'line', 'relevance', 'snippet'].sort(),
    );
    expect(out.query).toBe('heart rate');
  });

  it('relevance is monotonically non-increasing — search_docs', () => {
    for (const query of DOC_QUERIES) {
      const { results } = runSearchDocs({ query });
      for (let i = 1; i < results.length; i++) {
        expect(results[i].relevance).toBeLessThanOrEqual(results[i - 1].relevance);
      }
    }
  });

  it('relevance is monotonically non-increasing — find_examples', () => {
    for (const query of EXAMPLE_QUERIES) {
      const { matches } = runFindExamples({ query });
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i].relevance).toBeLessThanOrEqual(matches[i - 1].relevance);
      }
    }
  });
});

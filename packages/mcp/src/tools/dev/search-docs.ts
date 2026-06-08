import { ToolInputError, type ToolDefinition } from '../_common.js';
import { DOC_ENTRIES, rankCatalog } from './catalog.js';

export interface SearchDocsInput {
  query: string;
}

export interface SearchDocsResult {
  topic: string;
  url: string;
  snippet: string;
  relevance: number;
}

export interface SearchDocsOutput {
  results: SearchDocsResult[];
  query: string;
}

export function runSearchDocs(input: SearchDocsInput): SearchDocsOutput {
  if (typeof input.query !== 'string' || input.query.trim().length === 0) {
    throw new ToolInputError('query must be a non-empty string');
  }

  const results = rankCatalog(DOC_ENTRIES, input.query, 'docs').map((s) => ({
    topic: s.entry.topic as string,
    url: s.entry.url as string,
    snippet: s.entry.snippet,
    relevance: s.score,
  }));

  return { results, query: input.query.trim() };
}

export const searchDocsTool: ToolDefinition<SearchDocsInput, SearchDocsOutput> = {
  name: 'webble_dev_search_docs',
  title: 'Search WebBLE documentation by keyword',
  description:
    'Search the WebBLE documentation index for topics matching a query string. Returns ranked results with URLs to ioswebble.com docs.',
  run: runSearchDocs,
};

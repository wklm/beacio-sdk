import { ToolInputError, type ToolDefinition } from '../_common.js';
import { EXAMPLE_ENTRIES, rankCatalog } from './catalog.js';

interface FindExamplesInput {
  query: string;
}

interface ExampleMatch {
  file: string;
  line: number;
  snippet: string;
  category: string;
  relevance: number;
}

interface FindExamplesOutput {
  matches: ExampleMatch[];
  query: string;
}

export function runFindExamples(input: FindExamplesInput): FindExamplesOutput {
  if (typeof input.query !== 'string' || input.query.trim().length === 0) {
    throw new ToolInputError('query must be a non-empty string');
  }

  const matches = rankCatalog(EXAMPLE_ENTRIES, input.query, 'examples').map((s) => ({
    file: s.entry.file as string,
    line: s.entry.line as number,
    snippet: s.entry.snippet,
    category: s.entry.category,
    relevance: s.score,
  }));

  return { matches, query: input.query.trim() };
}

export const findExamplesTool: ToolDefinition<FindExamplesInput, FindExamplesOutput> = {
  name: 'beacio_dev_find_examples',
  title: 'Find code examples in the Beacio monorepo',
  description:
    'Search a curated index of key source files in the Beacio monorepo. Returns ranked matches with file path, line number, and category.',
  run: runFindExamples,
};

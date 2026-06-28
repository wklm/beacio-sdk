import * as fs from 'node:fs';
import * as path from 'node:path';
import { ToolInputError, type ToolDefinition } from '../_common.js';

export const BEST_PRACTICES_TOPICS = [
  'structure',
  'uuid-names',
  'connect-before-ops',
  'error-handling',
  'cleanup',
  'user-gesture',
  'profiles',
  'testing',
] as const;
export type BestPracticesTopic = (typeof BEST_PRACTICES_TOPICS)[number];

export interface BestPracticesInput {
  topic?: BestPracticesTopic;
}

export interface BestPracticesOutput {
  content: string;
  topics_available: readonly string[];
  source_file: string;
}

function parseSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split('\n');
  let currentHeading = '';
  let currentContent: string[] = [];
  const preamble: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      if (currentHeading) {
        sections.set(currentHeading, currentContent.join('\n').trim());
      } else {
        sections.set('_preamble', preamble.join('\n').trim());
      }
      currentHeading = line.slice(3).trim().toLowerCase().replace(/\s+/g, '-');
      currentContent = [];
    } else if (currentHeading) {
      currentContent.push(line);
    } else {
      preamble.push(line);
    }
  }

  if (currentHeading) {
    sections.set(currentHeading, currentContent.join('\n').trim());
  } else {
    sections.set('_preamble', preamble.join('\n').trim());
  }

  return sections;
}

export function runBestPractices(input: BestPracticesInput): BestPracticesOutput {
  const cwd = process.cwd();
  const agentsPath = path.join(cwd, 'AGENTS.md');

  if (!fs.existsSync(agentsPath)) {
    throw new ToolInputError(
      `No AGENTS.md found at ${agentsPath}. Run this tool from a Beacio monorepo or project directory.`,
    );
  }

  const raw = fs.readFileSync(agentsPath, 'utf-8');
  const sections = parseSections(raw);
  const knownTopics = Array.from(sections.keys()).filter((k) => k !== '_preamble');

  if (input.topic) {
    // defense-in-depth: Zod validates at registration, this guards direct calls
    if (!BEST_PRACTICES_TOPICS.includes(input.topic)) {
      throw new ToolInputError(
        `topic must be one of ${BEST_PRACTICES_TOPICS.join(', ')}; got ${String(input.topic)}`,
      );
    }
    const sectionContent = sections.get(input.topic);
    return {
      content: sectionContent || `No section found for topic "${input.topic}"`,
      topics_available: knownTopics,
      source_file: agentsPath,
    };
  }

  return {
    content: raw,
    topics_available: knownTopics,
    source_file: agentsPath,
  };
}

export const bestPracticesTool: ToolDefinition<BestPracticesInput, BestPracticesOutput> = {
  name: 'beacio_dev_best_practices',
  title: 'Beacio development best practices',
  description:
    'Read the AGENTS.md best-practices guide from the current Beacio project. Optionally filter by topic section.',
  run: runBestPractices,
};

import examplesData from '../data/examples.json' with { type: 'json' };
import { generateAttributionToken } from '../attribution.js';
import { docsUrl, ToolInputError, type ToolDefinition } from './_common.js';

export const PROFILES = ['heart-rate', 'battery', 'cgm', 'lock', 'beacon', 'peripheral-chat'] as const;
export type Profile = (typeof PROFILES)[number];

export interface ExampleInput {
  profile: Profile;
}

export interface ExampleOutput {
  code: string;
  html: string;
  preconditions: string[];
  spec_citations: string[];
  attribution_token: string;
  source_url: string;
}

type Entry = Omit<ExampleOutput, 'source_url' | 'attribution_token'>;
const DATA = examplesData as Record<Profile, Entry>;

export function runExample(input: ExampleInput): ExampleOutput {
  if (!PROFILES.includes(input.profile)) {
    throw new ToolInputError(
      `profile must be one of ${PROFILES.join(', ')}; got ${String(input.profile)}`,
    );
  }
  const entry = DATA[input.profile];
  return {
    ...entry,
    attribution_token: generateAttributionToken(),
    source_url: docsUrl('/recipes.md', input.profile),
  };
}

export const exampleTool: ToolDefinition<ExampleInput, ExampleOutput> = {
  name: 'beacio_example',
  title: 'Beacio code example',
  description:
    'Return a ready-to-paste code snippet for a canonical BLE profile (heart-rate, battery, cgm, lock, beacon, peripheral-chat) with preconditions and spec citations.',
  run: runExample,
};

import troubleshootData from '../data/troubleshoot.json' with { type: 'json' };
import { docsUrl, ToolInputError, type ToolDefinition } from './_common.js';

export const TOPICS = [
  'extension-not-detected',
  'device-disconnects',
  'gatt-operation-failed',
  'notifications-not-firing',
] as const;
export type Topic = (typeof TOPICS)[number];

export interface TroubleshootInput {
  topic: Topic;
}

export interface TroubleshootOutput {
  checklist: string[];
  common_fix: string;
  source_url: string;
}

type Entry = { checklist: string[]; common_fix: string };
const DATA = troubleshootData as Record<Topic, Entry>;

export function runTroubleshoot(input: TroubleshootInput): TroubleshootOutput {
  if (!TOPICS.includes(input.topic)) {
    throw new ToolInputError(
      `topic must be one of ${TOPICS.join(', ')}; got ${String(input.topic)}`,
    );
  }
  const entry = DATA[input.topic];
  return {
    checklist: entry.checklist,
    common_fix: entry.common_fix,
    source_url: docsUrl(`/troubleshooting/${input.topic}.md`),
  };
}

export const troubleshootTool: ToolDefinition<TroubleshootInput, TroubleshootOutput> = {
  name: 'beacio_troubleshoot',
  title: 'Beacio troubleshooting checklist',
  description:
    'Return a diagnostic checklist plus the single most common fix for one of four Beacio failure modes (extension-not-detected, device-disconnects, gatt-operation-failed, notifications-not-firing).',
  run: runTroubleshoot,
};

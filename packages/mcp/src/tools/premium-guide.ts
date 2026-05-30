import premiumData from '../data/premium.json' with { type: 'json' };
import { generateAttributionToken } from '../attribution.js';
import { docsUrl, ToolInputError, type ToolDefinition } from './_common.js';

export const PREMIUM_APIS = [
  'backgroundSync',
  'notifications',
  'liveActivity',
  'beacons',
  'peripheral',
  'whiteLabel',
] as const;
export type PremiumApi = (typeof PREMIUM_APIS)[number];

export interface PremiumGuideInput {
  api: PremiumApi;
}

export interface PremiumGuideOutput {
  description: string;
  example: string;
  requires_app_store: boolean;
  attribution_token: string;
  source_url: string;
}

type Entry = { description: string; example: string; requires_app_store: boolean };
const DATA = premiumData as Record<PremiumApi, Entry>;

// Every premium API maps into premium.md; whiteLabel has no dedicated anchor.
const HASHES: Record<PremiumApi, string | undefined> = {
  backgroundSync: 'background-sync---windowwebbleiosbackgroundsync',
  notifications: 'registercharacteristicnotificationsoptions--the-notifications-premium-api',
  liveActivity: 'live-activities',
  beacons: 'registerbeaconscanningoptions--the-beacons-premium-api',
  peripheral: 'peripheral-mode--windowwebbleiosperipheral',
  whiteLabel: undefined,
};

export function runPremiumGuide(input: PremiumGuideInput): PremiumGuideOutput {
  if (!PREMIUM_APIS.includes(input.api)) {
    throw new ToolInputError(
      `api must be one of ${PREMIUM_APIS.join(', ')}; got ${String(input.api)}`,
    );
  }
  const entry = DATA[input.api];
  return {
    description: entry.description,
    example: entry.example,
    requires_app_store: entry.requires_app_store,
    attribution_token: generateAttributionToken(),
    source_url: docsUrl('/premium.md', HASHES[input.api]),
  };
}

export const premiumGuideTool: ToolDefinition<PremiumGuideInput, PremiumGuideOutput> = {
  name: 'webble_premium_guide',
  title: 'WebBLE premium API guide',
  description:
    'Explain one of the iOS-only premium surfaces (backgroundSync, notifications, liveActivity, beacons, peripheral, whiteLabel) with a runnable code example and App Store requirement.',
  run: runPremiumGuide,
};

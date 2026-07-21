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
type PremiumApi = (typeof PREMIUM_APIS)[number];

interface PremiumGuideInput {
  api: PremiumApi;
}

interface PremiumGuideOutput {
  description: string;
  example: string;
  requires_app_store: boolean;
  attribution_token: string;
  source_url: string;
}

type Entry = { description: string; example: string; requires_app_store: boolean };
const DATA = premiumData as Record<PremiumApi, Entry>;

// Every premium API maps to a real heading anchor in premium.md (the
// "every premium API source_url anchor resolves to a real heading" test in
// test/tools.test.ts guards this — a dead/bare anchor fails the gate).
const HASHES: Record<PremiumApi, string> = {
  backgroundSync: 'background-sync---windowbeacioiosbackgroundsync',
  notifications: 'registercharacteristicnotificationsoptions--the-notifications-premium-api',
  liveActivity: 'live-activities',
  beacons: 'registerbeaconscanningoptions--the-beacons-premium-api',
  peripheral: 'peripheral-mode--windowbeacioiosperipheral',
  whiteLabel: 'white-label--your-brand-in-the-app-store',
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
  name: 'beacio_premium_guide',
  title: 'Beacio premium API guide',
  description:
    'Explain one of the iOS-only premium surfaces (backgroundSync, notifications, liveActivity, beacons, peripheral, whiteLabel) with a runnable code example and App Store requirement.',
  run: runPremiumGuide,
};

/**
 * Schema validation for bundled JSON data files.
 * Runs at import time — if data is malformed the server fails fast
 * with a descriptive error instead of a cryptic runtime TypeError.
 */
import { z } from 'zod';
import examplesData from './examples.json' with { type: 'json' };
import premiumData from './premium.json' with { type: 'json' };
import specData from './spec.json' with { type: 'json' };
import detectData from './detect.json' with { type: 'json' };
import installPlanData from './install-plan.json' with { type: 'json' };
import troubleshootData from './troubleshoot.json' with { type: 'json' };
import { FRAMEWORKS } from '../tools/install-plan.js';
import { PROFILES } from '../tools/example.js';
import { PREMIUM_APIS } from '../tools/premium-guide.js';
import { TOPICS } from '../tools/troubleshoot.js';

const ExampleEntry = z.object({
  code: z.string(),
  html: z.string(),
  preconditions: z.array(z.string()),
  spec_citations: z.array(z.string()),
});

const ExamplesSchema = z.record(z.string(), ExampleEntry);

const PremiumEntry = z.object({
  description: z.string(),
  example: z.string(),
  requires_app_store: z.boolean(),
});

const PremiumSchema = z.record(z.string(), PremiumEntry);

const SpecMethod = z.object({
  fragment: z.string(),
  summary: z.string(),
  caveats: z.array(z.string()),
});

const SpecSchema = z.object({
  spec_base_url: z.string(),
  methods: z.record(z.string(), SpecMethod),
});

const DetectSchema = z.object({
  detection_snippet: z.string(),
  global_name: z.string(),
  notes: z.array(z.string()),
});

const InstallPlanEntry = z.object({
  steps: z.array(z.string()),
  code_snippet: z.string(),
});

const InstallPlanSchema = z.record(z.string(), InstallPlanEntry);

const TroubleshootEntry = z.object({
  checklist: z.array(z.string()),
  common_fix: z.string(),
});

const TroubleshootSchema = z.record(z.string(), TroubleshootEntry);

function assertKeys(label: string, parsed: Record<string, unknown>, expected: readonly string[]) {
  const actual = new Set(Object.keys(parsed));
  const missing = expected.filter((k) => !actual.has(k));
  if (missing.length > 0) {
    throw new Error(`${label} is missing required keys: ${missing.join(', ')}`);
  }
}

function validate() {
  const examples = ExamplesSchema.parse(examplesData);
  assertKeys('examples.json', examples, PROFILES);

  const premium = PremiumSchema.parse(premiumData);
  assertKeys('premium.json', premium, PREMIUM_APIS);

  SpecSchema.parse(specData);
  DetectSchema.parse(detectData);

  const installPlan = InstallPlanSchema.parse(installPlanData);
  assertKeys('install-plan.json', installPlan, FRAMEWORKS);

  const troubleshoot = TroubleshootSchema.parse(troubleshootData);
  assertKeys('troubleshoot.json', troubleshoot, TOPICS);
}

try {
  validate();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  throw new Error(`[beacio-mcp] data validation failed: ${message}`, { cause: err });
}

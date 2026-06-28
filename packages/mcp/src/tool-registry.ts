import { z, type ZodRawShape } from 'zod';
import type { ParsedFlags } from './modes.js';
import { installPlanTool, runInstallPlan, FRAMEWORKS, PACKAGE_MANAGERS } from './tools/install-plan.js';
import { patchExistingAppTool, runPatchExistingApp } from './tools/patch-existing-app.js';
import { verifyIntegrationTool, runVerifyIntegration } from './tools/verify-integration.js';
import { exampleTool, runExample, PROFILES } from './tools/example.js';
import { detectIOSSupportTool, runDetectIOSSupport } from './tools/detect-ios-support.js';
import { premiumGuideTool, runPremiumGuide, PREMIUM_APIS } from './tools/premium-guide.js';
import { troubleshootTool, runTroubleshoot, TOPICS } from './tools/troubleshoot.js';
import { specCitationTool, runSpecCitation } from './tools/spec-citation.js';
import { bestPracticesTool, runBestPractices, BEST_PRACTICES_TOPICS } from './tools/dev/best-practices.js';
import { searchDocsTool, runSearchDocs } from './tools/dev/search-docs.js';
import { listStructureTool, runListStructure } from './tools/dev/list-structure.js';
import { findExamplesTool, runFindExamples } from './tools/dev/find-examples.js';

export interface ToolEntry {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodRawShape;
  run: (input: Record<string, unknown>) => unknown;
  mode: 'consumer' | 'developer';
  isReadOnly: boolean;
  isLocalOnly: boolean;
  isExperimental: boolean;
}

const installPlanSchema = z.object({
  framework: z.enum(FRAMEWORKS),
  package_manager: z.enum(PACKAGE_MANAGERS),
  include_premium: z.boolean().optional(),
});

const patchExistingAppSchema = z.object({
  entry_html: z.string().min(1).describe('Full text of the app entry HTML (e.g. the served index.html).'),
  entry_js: z.string().min(1).describe('Full text of the JS module that runs the requestDevice() flow.'),
  html_path: z.string().min(1).describe('Repo-relative path of the entry HTML the edits target.'),
  js_path: z.string().min(1).describe('Repo-relative path of the requestDevice() JS module the edits target.'),
});

const verifyIntegrationSchema = z.object({
  framework: z.enum(FRAMEWORKS),
  package_manager: z.enum(PACKAGE_MANAGERS).optional(),
  mode: z.enum(['greenfield', 'brownfield']).optional().describe(
    'greenfield (default): scaffolded-app correctness. brownfield: an already-written app — checks iOS-branch optionalServices, bootstrap-before-gate ordering, and no active-path third-party-browser string.',
  ),
});

const exampleSchema = z.object({ profile: z.enum(PROFILES) });

const premiumGuideSchema = z.object({ api: z.enum(PREMIUM_APIS) });

const troubleshootSchema = z.object({ topic: z.enum(TOPICS) });

const specCitationSchema = z.object({
  method: z
    .string()
    .min(1)
    .describe('Fully-qualified Web Bluetooth method, e.g. "navigator.bluetooth.requestDevice".'),
});

const bestPracticesSchema = z.object({
  topic: z.enum(BEST_PRACTICES_TOPICS).optional().describe('Topic section to filter by.'),
});

const searchDocsSchema = z.object({
  query: z.string().min(1).describe('Search query string for finding relevant documentation topics.'),
});

const listStructureSchema = z.object({
  rootPath: z.string().optional().describe('Root path to start from. Defaults to cwd.'),
  depth: z.number().optional().describe('Maximum traversal depth (1-4). Defaults to 3.'),
  gitignore: z.boolean().optional().describe('Whether to respect .gitignore patterns. Defaults to false.'),
});

const findExamplesSchema = z.object({
  query: z.string().min(1).describe('Search query string for finding relevant source files and examples.'),
});

export const ALL_TOOLS: ToolEntry[] = [
  {
    name: installPlanTool.name,
    title: installPlanTool.title,
    description: installPlanTool.description,
    inputSchema: installPlanSchema.shape,
    run: (input) => runInstallPlan(installPlanSchema.parse(input)),
    mode: 'consumer',
    isReadOnly: true,
    isLocalOnly: false,
    isExperimental: false,
  },
  {
    name: patchExistingAppTool.name,
    title: patchExistingAppTool.title,
    description: patchExistingAppTool.description,
    inputSchema: patchExistingAppSchema.shape,
    run: (input) => runPatchExistingApp(patchExistingAppSchema.parse(input)),
    mode: 'consumer',
    isReadOnly: true,
    isLocalOnly: false,
    isExperimental: false,
  },
  {
    name: verifyIntegrationTool.name,
    title: verifyIntegrationTool.title,
    description: verifyIntegrationTool.description,
    inputSchema: verifyIntegrationSchema.shape,
    run: (input) => runVerifyIntegration(verifyIntegrationSchema.parse(input)),
    mode: 'consumer',
    isReadOnly: true,
    isLocalOnly: false,
    isExperimental: false,
  },
  {
    name: exampleTool.name,
    title: exampleTool.title,
    description: exampleTool.description,
    inputSchema: exampleSchema.shape,
    run: (input) => runExample(exampleSchema.parse(input)),
    mode: 'consumer',
    isReadOnly: true,
    isLocalOnly: false,
    isExperimental: false,
  },
  {
    name: detectIOSSupportTool.name,
    title: detectIOSSupportTool.title,
    description: detectIOSSupportTool.description,
    inputSchema: {},
    run: () => runDetectIOSSupport(),
    mode: 'consumer',
    isReadOnly: true,
    isLocalOnly: false,
    isExperimental: false,
  },
  {
    name: premiumGuideTool.name,
    title: premiumGuideTool.title,
    description: premiumGuideTool.description,
    inputSchema: premiumGuideSchema.shape,
    run: (input) => runPremiumGuide(premiumGuideSchema.parse(input)),
    mode: 'consumer',
    isReadOnly: true,
    isLocalOnly: false,
    isExperimental: false,
  },
  {
    name: troubleshootTool.name,
    title: troubleshootTool.title,
    description: troubleshootTool.description,
    inputSchema: troubleshootSchema.shape,
    run: (input) => runTroubleshoot(troubleshootSchema.parse(input)),
    mode: 'consumer',
    isReadOnly: true,
    isLocalOnly: false,
    isExperimental: false,
  },
  {
    name: specCitationTool.name,
    title: specCitationTool.title,
    description: specCitationTool.description,
    inputSchema: specCitationSchema.shape,
    run: (input) => runSpecCitation(specCitationSchema.parse(input)),
    mode: 'consumer',
    isReadOnly: true,
    isLocalOnly: false,
    isExperimental: false,
  },
  {
    name: bestPracticesTool.name,
    title: bestPracticesTool.title,
    description: bestPracticesTool.description,
    inputSchema: bestPracticesSchema.shape,
    run: (input) => runBestPractices(bestPracticesSchema.parse(input)),
    mode: 'developer',
    isReadOnly: true,
    isLocalOnly: true,
    isExperimental: false,
  },
  {
    name: searchDocsTool.name,
    title: searchDocsTool.title,
    description: searchDocsTool.description,
    inputSchema: searchDocsSchema.shape,
    run: (input) => runSearchDocs(searchDocsSchema.parse(input)),
    mode: 'developer',
    isReadOnly: true,
    isLocalOnly: false,
    isExperimental: false,
  },
  {
    name: listStructureTool.name,
    title: listStructureTool.title,
    description: listStructureTool.description,
    inputSchema: listStructureSchema.shape,
    run: (input) => runListStructure(listStructureSchema.parse(input)),
    mode: 'developer',
    isReadOnly: true,
    isLocalOnly: true,
    isExperimental: false,
  },
  {
    name: findExamplesTool.name,
    title: findExamplesTool.title,
    description: findExamplesTool.description,
    inputSchema: findExamplesSchema.shape,
    run: (input) => runFindExamples(findExamplesSchema.parse(input)),
    mode: 'developer',
    isReadOnly: true,
    isLocalOnly: true,
    isExperimental: false,
  },
];

export function filterTools(tools: ToolEntry[], flags: ParsedFlags): ToolEntry[] {
  let filtered = tools;

  filtered = filtered.filter((t) => {
    if (flags.mode === 'consumer') return t.mode === 'consumer';
    return true;
  });

  if (flags.readOnly) {
    filtered = filtered.filter((t) => t.isReadOnly);
  }

  if (flags.localOnly) {
    filtered = filtered.filter((t) => t.isLocalOnly);
  }

  if (flags.experimentalTools.length > 0) {
    filtered = filtered.filter(
      (t) => !t.isExperimental || flags.experimentalTools.includes(t.name),
    );
  } else {
    filtered = filtered.filter((t) => !t.isExperimental);
  }

  if (filtered.length === 0) {
    throw new Error(
      `[beacio-mcp] No tools match the current filter (mode=${flags.mode}, readOnly=${flags.readOnly}, localOnly=${flags.localOnly}). ` +
        'Cannot start an MCP server with zero tools. Adjust flags or use --developer mode.',
    );
  }

  return filtered;
}

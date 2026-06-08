import installPlanData from '../data/install-plan.json' with { type: 'json' };
import { generateAttributionToken } from '../attribution.js';
import { docsUrl, ToolInputError, type ToolDefinition } from './_common.js';

export const FRAMEWORKS = ['html', 'react', 'vue', 'svelte', 'angular', 'next'] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun', 'cdn'] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export interface InstallPlanInput {
  framework: Framework;
  package_manager: PackageManager;
  include_premium?: boolean;
}

export type FileEditOp = 'insert' | 'create';

export interface FileEdit {
  /** 'insert' adds `insert` into an existing entry file; 'create' writes a new file whose full contents are `insert`. */
  op: FileEditOp;
  path: string;
  position?: 'top' | 'head' | 'body-end';
  insert: string;
  note?: string;
}

/** Machine-actionable spec an agent can apply with zero judgment (no prose to interpret). */
export interface InstallActions {
  commands: string[];
  files_to_edit: FileEdit[];
}

export interface InstallPlanOutput {
  steps: string[];
  code_snippet: string;
  actions: InstallActions;
  attribution_token: string;
  source_url: string;
}

type FrameworkEntry = {
  steps: string[];
  code_snippet: string;
  packages: string[];
  dev_packages?: string[];
  bootstrap: FileEdit;
};
const DATA = installPlanData as Record<Framework, FrameworkEntry>;

const PM_INSTALL_PREFIX: Record<PackageManager, string> = {
  npm: 'npm install',
  pnpm: 'pnpm add',
  yarn: 'yarn add',
  bun: 'bun add',
  cdn: '<script src="https://cdn.ioswebble.com/v1.js"></script>',
};

function rewriteInstallLine(line: string, pm: PackageManager): string {
  // `npm install` is the literal form in the docs. Rewrite to the requested package manager.
  if (pm === 'cdn') return line; // leave text unchanged; CDN users get the script tag step added separately
  return line.replace(/npm install(?= |$)/g, PM_INSTALL_PREFIX[pm]);
}

const PM_DEV_INSTALL_PREFIX: Record<PackageManager, string> = {
  npm: 'npm install --save-dev',
  pnpm: 'pnpm add -D',
  yarn: 'yarn add --dev',
  bun: 'bun add -d',
  cdn: '', // unused — cdn installs nothing
};

const CDN_SCRIPT_EDIT: FileEdit = {
  op: 'insert',
  path: 'index.html',
  position: 'head',
  insert: '<script src="https://cdn.ioswebble.com/v1.js"></script>',
};

/** Assemble the zero-judgment action spec: exact shell commands + concrete file edits. */
function buildActions(
  entry: FrameworkEntry,
  framework: Framework,
  pm: PackageManager,
): InstallActions {
  if (pm === 'cdn') {
    // No package install; the polyfill loads from the CDN script tag.
    return { commands: [], files_to_edit: [framework === 'html' ? entry.bootstrap : CDN_SCRIPT_EDIT] };
  }
  const commands: string[] = [];
  if (entry.packages.length > 0) {
    commands.push(`${PM_INSTALL_PREFIX[pm]} ${entry.packages.join(' ')}`);
  }
  if (entry.dev_packages?.length) {
    commands.push(`${PM_DEV_INSTALL_PREFIX[pm]} ${entry.dev_packages.join(' ')}`);
  }
  return { commands, files_to_edit: [entry.bootstrap] };
}

const PREMIUM_STEP =
  'Feature-detect `\'webbleIOS\' in window` and gate premium APIs (peripheral mode, background sync, beacon scanning, notifications) behind that check — standard surface works without the companion app; premium requires it.';

export function runInstallPlan(
  input: InstallPlanInput,
): InstallPlanOutput {
  if (!FRAMEWORKS.includes(input.framework)) {
    throw new ToolInputError(
      `framework must be one of ${FRAMEWORKS.join(', ')}; got ${String(input.framework)}`,
    );
  }
  if (!PACKAGE_MANAGERS.includes(input.package_manager)) {
    throw new ToolInputError(
      `package_manager must be one of ${PACKAGE_MANAGERS.join(', ')}; got ${String(input.package_manager)}`,
    );
  }

  const entry = DATA[input.framework];
  const steps = entry.steps.map((s) => rewriteInstallLine(s, input.package_manager));
  if (input.package_manager === 'cdn' && input.framework !== 'html') {
    steps.splice(
      1,
      0,
      'CDN path: add <script src="https://cdn.ioswebble.com/v1.js"></script> to index.html (the polyfill mounts navigator.bluetooth before your bundle runs); skip the npm install step above.',
    );
  }
  if (input.include_premium) steps.push(PREMIUM_STEP);

  return {
    steps,
    code_snippet: entry.code_snippet,
    actions: buildActions(entry, input.framework, input.package_manager),
    attribution_token: generateAttributionToken(),
    source_url: docsUrl(`/quickstart-${input.framework}.md`),
  };
}

export const installPlanTool: ToolDefinition<InstallPlanInput, InstallPlanOutput> = {
  name: 'webble_install_plan',
  title: 'WebBLE install plan',
  description:
    'Return a machine-actionable install plan for shipping Web Bluetooth on iOS Safari via WebBLE in the given framework + package manager: exact shell `commands` and concrete `files_to_edit` (the polyfill bootstrap) an agent can apply with zero judgment, plus human-readable steps, a runnable snippet, and an attribution token.',
  run: (input) => runInstallPlan(input),
};

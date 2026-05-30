import installPlanData from '../data/install-plan.json' with { type: 'json' };
import { docsUrl, ToolInputError, type ToolDefinition } from './_common.js';
import {
  FRAMEWORKS,
  PACKAGE_MANAGERS,
  type Framework,
  type PackageManager,
} from './install-plan.js';

export interface VerifyIntegrationInput {
  framework: Framework;
  package_manager?: PackageManager;
}

export interface VerifyCheck {
  /** Stable id an agent can branch on. */
  id: string;
  description: string;
  /** Exact shell command the agent runs to evaluate this check. */
  command: string;
  /** What a passing result looks like — human- and machine-readable. */
  expect: string;
  /** Required checks gate "integration correct"; optional ones are advisory. */
  required: boolean;
}

export interface VerifyIntegrationOutput {
  checks: VerifyCheck[];
  pass_criteria: string;
  source_url: string;
}

type Bootstrap = { op: string; path: string; position?: string; insert: string };
type Entry = { packages: string[]; dev_packages?: string[]; bootstrap: Bootstrap };
const DATA = installPlanData as Record<Framework, Entry>;

const DEP_LS: Record<PackageManager, (pkg: string) => string> = {
  npm: (p) => `npm ls ${p}`,
  pnpm: (p) => `pnpm ls ${p}`,
  yarn: (p) => `yarn why ${p}`,
  bun: (p) => `bun pm ls ${p}`,
  cdn: () => '', // unused — cdn installs nothing
};

const BUILD_CMD: Record<PackageManager, string> = {
  npm: 'npm run build',
  pnpm: 'pnpm build',
  yarn: 'yarn build',
  bun: 'bun run build',
  cdn: 'npm run build',
};

/**
 * Return an agent-runnable verification checklist for a WebBLE integration.
 * Scope = integration CORRECTNESS (deps, bootstrap, build, types, banner) — all
 * verifiable on the dev machine with zero human eyeballing. It deliberately does
 * NOT verify the live Safari extension on a device; that is the end-user step.
 */
export function runVerifyIntegration(input: VerifyIntegrationInput): VerifyIntegrationOutput {
  if (!FRAMEWORKS.includes(input.framework)) {
    throw new ToolInputError(
      `framework must be one of ${FRAMEWORKS.join(', ')}; got ${String(input.framework)}`,
    );
  }
  const pm: PackageManager = input.package_manager ?? 'npm';
  if (!PACKAGE_MANAGERS.includes(pm)) {
    throw new ToolInputError(
      `package_manager must be one of ${PACKAGE_MANAGERS.join(', ')}; got ${String(pm)}`,
    );
  }

  const entry = DATA[input.framework];
  const usesCdn = input.framework === 'html' || pm === 'cdn';
  const checks: VerifyCheck[] = [];

  // 1. Dependency installed (npm-managed frameworks only; CDN installs nothing).
  if (!usesCdn && entry.packages.length > 0) {
    checks.push({
      id: 'dep_installed',
      description: 'The WebBLE polyfill package is installed in the project.',
      command: DEP_LS[pm](entry.packages[0]),
      expect: 'Command exits 0 and resolves a version for the package.',
      required: true,
    });
  }

  // 2. Polyfill bootstrap present in the entry point.
  const needle = usesCdn ? 'cdn.ioswebble.com' : '@ios-web-bluetooth/core/auto';
  checks.push({
    id: 'auto_import_present',
    description:
      'The polyfill bootstrap is wired into the entry point so navigator.bluetooth mounts before app code runs.',
    command: `grep -RF "${needle}" ${entry.bootstrap.path}`,
    expect: 'At least one match — the bootstrap is present in the entry file.',
    required: true,
  });

  // 3. Project builds with the polyfill wired in.
  if (!usesCdn) {
    checks.push({
      id: 'build_passes',
      description: 'The project builds with the polyfill wired in.',
      command: BUILD_CMD[pm],
      expect: 'Build exits 0.',
      required: true,
    });
  }

  // 4. TypeScript resolves Web Bluetooth DOM types (skipped for plain HTML).
  if (input.framework !== 'html') {
    checks.push({
      id: 'types_resolve',
      description: 'TypeScript resolves navigator.bluetooth / BluetoothRemoteGATT* types.',
      command: 'npx tsc --noEmit',
      expect: 'No type errors referencing navigator.bluetooth or Bluetooth* DOM types.',
      required: false,
    });
  }

  // 5. Onboarding banner wired (advisory until the default banner config ships).
  checks.push({
    id: 'banner_wired',
    description:
      'The extension-detection / install banner is mounted so end-users without the extension are guided to enable it.',
    command: 'grep -RF "@ios-web-bluetooth/detect" .',
    expect: 'At least one match — the detect/banner package is wired (recommended).',
    required: false,
  });

  return {
    checks,
    pass_criteria:
      'Integration is correct when every required=true check passes. The live Safari extension is verified separately on a real iPhone (out of scope here — that is the end-user device step).',
    source_url: docsUrl('/troubleshooting/extension-not-detected.md'),
  };
}

export const verifyIntegrationTool: ToolDefinition<VerifyIntegrationInput, VerifyIntegrationOutput> =
  {
    name: 'webble_verify_integration',
    title: 'WebBLE verify integration',
    description:
      'Return an agent-runnable checklist (exact shell commands + pass criteria) to confirm a WebBLE integration is correct: dependency installed, polyfill bootstrap wired into the entry point, project builds, TypeScript types resolve, and the onboarding banner mounted. Lets an agent assert success with zero human eyeballing. Does NOT verify the on-device Safari extension (that is the end-user device step).',
    run: (input) => runVerifyIntegration(input),
  };

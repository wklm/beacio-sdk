import installPlanData from '../data/install-plan.json' with { type: 'json' };
import { docsUrl, ToolInputError, type ToolDefinition } from './_common.js';
import {
  FRAMEWORKS,
  PACKAGE_MANAGERS,
  type Framework,
  type PackageManager,
} from './install-plan.js';

export type VerifyMode = 'greenfield' | 'brownfield';

export interface VerifyIntegrationInput {
  framework: Framework;
  package_manager?: PackageManager;
  /**
   * 'greenfield' (default): a freshly-scaffolded app — verifies deps/bootstrap/build/types/banner.
   * 'brownfield': an ALREADY-WRITTEN Web Bluetooth app patched via beacio_patch_existing_app /
   * `beacio migrate` — verifies the three brownfield invariants (SB-SDK-04 AC#5).
   */
  mode?: VerifyMode;
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
 * SB-SDK-04 AC#5 — the BROWNFIELD checklist for an already-written Web Bluetooth app
 * patched via beacio_patch_existing_app / `beacio migrate`. Three REQUIRED checks, each
 * an exact shell command whose exit 0 == satisfied (so an agent asserts success with zero
 * eyeballing). They are written to PASS on the patched app and FAIL on the unpatched one:
 *
 *   1. ios_optional_services       — optionalServices declared INSIDE the iOS requestDevice
 *                                    branch braces (not merely somewhere in the file: the
 *                                    Android/desktop branches always have it).
 *   2. bootstrap_before_gate       — a beacio bootstrap <script src> tag (the canonical
 *                                    browser-auto.global.js, or a vendored beacio-core-auto.js)
 *                                    sits BEFORE the first app-entry <script src="js/…"> tag, so
 *                                    navigator.bluetooth is patched before the parse-time gate.
 *   3. no_third_party_browser_string — there is NO active-path alert("… Bluefy / Web BLE
 *                                    browser …") left (it was swapped for the beacio affordance).
 *
 * Paths default to the static-app layout (index.html + js/main.js at the app root), matching the
 * S&B fork the runbook works through. perl -0777 (slurp) is used for cross-newline position checks
 * and is present on macOS + Linux.
 */
const BROWNFIELD_HTML_PATH = 'index.html';
const BROWNFIELD_JS_PATH = 'js/main.js';

function brownfieldChecklist(): VerifyIntegrationOutput {
  const checks: VerifyCheck[] = [
    {
      id: 'ios_optional_services',
      description:
        'optionalServices is declared inside the iOS requestDevice branch (if (userAgent_iOS()) { … }), so iOS getPrimaryService() is permitted for every filtered service.',
      command: `perl -0777 -ne 'exit(/userAgent_iOS\\(\\)\\)\\s*\\{[^{}]*optionalServices/ ? 0 : 1)' ${BROWNFIELD_JS_PATH}`,
      expect: 'Exit 0 — the iOS branch sets options.optionalServices. (Unpatched: exits 1.)',
      required: true,
    },
    {
      id: 'bootstrap_before_gate',
      description:
        'A beacio polyfill bootstrap <script src> tag appears in the entry HTML before the first app-entry script, so navigator.bluetooth is patched before the parse-time gate runs.',
      command: `perl -0777 -ne 'my $b = /<script\\b[^>]*\\bsrc\\s*=\\s*["'"'"'][^"'"'"']*(?:browser-auto\\.global\\.js|beacio-core-auto\\.js)/i ? $-[0] : -1; my $g = /<script\\b[^>]*\\bsrc\\s*=\\s*["'"'"']js\\/(?!vendor\\/beacio)/i ? $-[0] : -1; exit(($b >= 0 && ($g < 0 || $b < $g)) ? 0 : 1)' ${BROWNFIELD_HTML_PATH}`,
      expect:
        'Exit 0 — the bootstrap tag is present and precedes the first app-entry script. (Unpatched: no bootstrap, exits 1.)',
      required: true,
    },
    {
      id: 'no_third_party_browser_string',
      description:
        'No active-path alert directing users to a third-party browser ("Please use Bluefy / Web BLE browser") remains — it was swapped for the beacio install/enable affordance. Scoped to the connect gate (matches `hasThirdPartyBrowserMessage` in the CLI): a dead capability-only notice that merely mentions Bluefy (e.g. a "update firmware … use Bluefy" message guarded by browserSupportsWriteWithoutResponse, off the active path on beacio) is NOT this gate and must not trip it — otherwise this surface would contradict `beacio check --brownfield` on the same patched app.',
      command: `perl -0777 -ne 'exit(/alert\\(\\s*["'"'"'][^"'"'"']*(?:Web BLE browser|Web Bluetooth[^"'"'"']*Bluefy|Bluefy[^"'"'"']*Web Bluetooth)/ ? 1 : 0)' ${BROWNFIELD_JS_PATH}`,
      expect: 'Exit 0 — no active-path third-party-browser alert present. (Unpatched: a live "use Bluefy / Web BLE browser" connect-gate alert exists, exits 1.)',
      required: true,
    },
  ];
  return {
    checks,
    pass_criteria:
      'Brownfield integration is correct when every required=true check passes: the iOS branch declares optionalServices, the bootstrap loads before the parse-time gate, and no third-party-browser message remains on the active path. The live Safari extension is verified separately on a real iPhone (the end-user device step).',
    source_url: docsUrl('/troubleshooting/extension-not-detected.md'),
  };
}

/**
 * Return an agent-runnable verification checklist for a Beacio integration.
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

  if (input.mode === 'brownfield') {
    return brownfieldChecklist();
  }

  const entry = DATA[input.framework];
  const usesCdn = input.framework === 'html' || pm === 'cdn';
  const checks: VerifyCheck[] = [];

  // 1. Dependency installed (npm-managed frameworks only; CDN installs nothing).
  if (!usesCdn && entry.packages.length > 0) {
    checks.push({
      id: 'dep_installed',
      description: 'The Beacio polyfill package is installed in the project.',
      command: DEP_LS[pm](entry.packages[0]),
      expect: 'Command exits 0 and resolves a version for the package.',
      required: true,
    });
  }

  // 2. Polyfill bootstrap present in the entry point.
  const needle = usesCdn ? 'cdn.beacio.com' : '@beacio/core/auto';
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
    command: 'grep -RF "@beacio/detect" .',
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
    name: 'beacio_verify_integration',
    title: 'Beacio verify integration',
    description:
      'Return an agent-runnable checklist (exact shell commands + pass criteria) to confirm a Beacio integration is correct: dependency installed, polyfill bootstrap wired into the entry point, project builds, TypeScript types resolve, and the onboarding banner mounted. Lets an agent assert success with zero human eyeballing. Does NOT verify the on-device Safari extension (that is the end-user device step).',
    run: (input) => runVerifyIntegration(input),
  };

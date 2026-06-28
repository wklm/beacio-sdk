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

// AIDEV-NOTE: SB-INF-06 — the single canonical bare CDN bootstrap URL. The MCP
// install-plan + examples + cdn/README + the canonical quickstart / @beacio/skill
// reference all emit THIS exact pinned (`@1.0.0`, full semver — the cdn Worker
// 400s partials) URL. It is kept bare
// (tokenless) as the documentary copy in install-plan.json / example.ts; the
// `cdn` package-manager path overlays the `?beacio_attr=<cdn-channel token>`
// query at emit time via withCdnAttribution() so the `cdn` acquisition channel
// records REAL attribution end-to-end (producer → cdn Worker → unpkg) instead of
// a blank blob. Param name is `beacio_attr` (matches the cdn Worker's
// dual-accept key + README). Keep this literal byte-identical to the JSON so the
// string-replace overlay finds it.
const CANONICAL_CDN_BOOTSTRAP_URL =
  'https://cdn.beacio.com/@beacio/core@1.0.0/dist/auto.mjs';

/** The attribution query-param key the cdn Worker honors (dual-accepted with the legacy webble_attr). */
const CDN_ATTR_PARAM = 'beacio_attr';

/**
 * Overlay the `cdn`-channel attribution token onto every occurrence of the bare
 * canonical CDN bootstrap URL in an emitted surface. A no-op for any text that
 * does not contain the URL, so it is safe to run over every step / snippet /
 * file-edit insert on the cdn path. The token rides as `?beacio_attr=<token>`;
 * the URL is otherwise unchanged (the trailing `'` / `"` / `<` delimiters in the
 * snippets are preserved because we replace only the URL substring itself).
 */
function withCdnAttribution(text: string, token: string): string {
  return text.split(CANONICAL_CDN_BOOTSTRAP_URL).join(
    `${CANONICAL_CDN_BOOTSTRAP_URL}?${CDN_ATTR_PARAM}=${token}`,
  );
}

const PM_INSTALL_PREFIX: Record<PackageManager, string> = {
  npm: 'npm install',
  pnpm: 'pnpm add',
  yarn: 'yarn add',
  bun: 'bun add',
  cdn: '<script type="module">import \'https://cdn.beacio.com/@beacio/core@1.0.0/dist/auto.mjs\';</script>',
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
  insert: '<script type="module">import \'https://cdn.beacio.com/@beacio/core@1.0.0/dist/auto.mjs\';</script>',
  note: 'Module scripts are deferred, so navigator.bluetooth mounts after the document parses. For apps that read navigator.bluetooth at parse time (before your bundle runs), prefer the npm path: install @beacio/core and `import \'@beacio/core/auto\'` as the first import.',
};

/**
 * SB-SDK-01 / AC#5: the install-banner wiring as a CONCRETE files_to_edit (not free-text prose).
 * `initBeacio({ operatorName })` is the single recommended @beacio/detect call (see
 * packages/detect/README.md + AGENTS.md + onboarding-manifest.json `banner.recommendedCall`); it is
 * GATED on `navigator.bluetooth === undefined` so it is a no-op where the W3C surface already exists
 * (Chrome/Edge, or iOS Safari once the extension is active) and only guides install when it is
 * missing. An agent can apply this edit verbatim with zero judgment.
 *
 * It is emitted as a DEDICATED `create`d module (not an insert into the framework entry) so it never
 * collides with the polyfill bootstrap edit's path; the agent imports it once from the app entry. The
 * note carries that one-line wiring instruction.
 */
const BANNER_EDIT: FileEdit = {
  op: 'create',
  path: 'src/beacio-install.ts',
  insert:
    "import { initBeacio } from '@beacio/detect';\n\n// The one recommended @beacio/detect call. Gated on the missing native API: only guide install\n// when the W3C surface is absent (iOS Safari without the extension); a no-op everywhere else.\nif (navigator.bluetooth === undefined) {\n  initBeacio({ operatorName: 'YourApp' });\n}\n",
  note: "The recommended install-banner wiring. Import it once from your app entry: `import './beacio-install';`. showInstallBanner({ operatorName }) and <BeacioProvider> are lower-level primitives. Set operatorName to your app name; add `key: 'wbl_xxxxx'` for campaign tracking. Requires `@beacio/detect` installed.",
};

/**
 * Assemble the zero-judgment action spec: exact shell commands + concrete file edits.
 *
 * Every plan ends with the BANNER_EDIT (SB-SDK-01 / AC#5) — the one recommended
 * `initBeacio({ operatorName })` install-guidance call, gated on navigator.bluetooth===undefined —
 * as a concrete files_to_edit (not free-text prose). It needs `@beacio/detect`, so the detect package
 * is added to the install command for the non-CDN paths that don't already pull it in.
 */
function buildActions(
  entry: FrameworkEntry,
  framework: Framework,
  pm: PackageManager,
  cdnToken: string,
): InstallActions {
  if (pm === 'cdn') {
    // No package install; the polyfill loads from the CDN script tag. The banner is still wired as a
    // concrete edit so the install-guidance path is identical across package managers.
    // SB-INF-06: overlay the cdn-channel attribution token onto the bootstrap
    // edit's CDN URL so the emitted snippet carries `?beacio_attr=` (not a blank
    // channel). BANNER_EDIT has no CDN URL, so the overlay is a no-op on it.
    const bootstrap = framework === 'html' ? entry.bootstrap : CDN_SCRIPT_EDIT;
    const tokenizedBootstrap: FileEdit = {
      ...bootstrap,
      insert: withCdnAttribution(bootstrap.insert, cdnToken),
    };
    return {
      commands: [],
      files_to_edit: [tokenizedBootstrap, BANNER_EDIT],
    };
  }
  const commands: string[] = [];
  // The banner edit imports @beacio/detect; ensure it is installed alongside the polyfill packages.
  const packages = entry.packages.includes('@beacio/detect')
    ? entry.packages
    : [...entry.packages, '@beacio/detect'];
  if (packages.length > 0) {
    commands.push(`${PM_INSTALL_PREFIX[pm]} ${packages.join(' ')}`);
  }
  if (entry.dev_packages?.length) {
    commands.push(`${PM_DEV_INSTALL_PREFIX[pm]} ${entry.dev_packages.join(' ')}`);
  }
  // Non-CDN paths bootstrap via `import '@beacio/core/auto'` (no CDN URL), so no
  // attribution overlay applies here.
  return { commands, files_to_edit: [entry.bootstrap, BANNER_EDIT] };
}

const PREMIUM_STEP =
  'Feature-detect `\'beacioIOS\' in window` and gate premium APIs (peripheral mode, background sync, beacon scanning, notifications) behind that check — standard surface works without the companion app; premium requires it.';

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
  const isCdn = input.package_manager === 'cdn';

  // AIDEV-NOTE: SB-INF-06 — one `cdn`-channel token per call, reused for BOTH
  // the in-snippet `?beacio_attr=` overlay AND the returned attribution_token, so
  // the detached field is no longer hand-wired: it IS the token the CDN URL
  // carries. Non-CDN paths emit the default `mcp`-channel token (their bootstrap
  // is `import '@beacio/core/auto'`, which carries no CDN URL to attribute).
  const attributionToken = generateAttributionToken(isCdn ? { channel: 'cdn' } : {});

  let steps = entry.steps.map((s) => rewriteInstallLine(s, input.package_manager));
  if (isCdn && input.framework !== 'html') {
    steps.splice(
      1,
      0,
      'CDN path: add <script type="module">import \'https://cdn.beacio.com/@beacio/core@1.0.0/dist/auto.mjs\';</script> to index.html (auto-installs the polyfill from the branded CDN); skip the npm install step above. Note: module scripts are deferred, so navigator.bluetooth mounts after the document parses — if your bundle reads navigator.bluetooth at parse time, use the npm path instead (npm install @beacio/core, then import \'@beacio/core/auto\' as the first import).',
    );
  }
  if (input.include_premium) steps.push(PREMIUM_STEP);

  // Overlay the cdn-channel attribution token onto every bare canonical CDN URL
  // in the emitted human-readable surfaces (steps + code_snippet). A no-op when
  // the text has no CDN URL, so it is safe to run unconditionally on the cdn path.
  let code_snippet = entry.code_snippet;
  if (isCdn) {
    steps = steps.map((s) => withCdnAttribution(s, attributionToken));
    code_snippet = withCdnAttribution(code_snippet, attributionToken);
  }

  return {
    steps,
    code_snippet,
    actions: buildActions(entry, input.framework, input.package_manager, attributionToken),
    attribution_token: attributionToken,
    source_url: docsUrl(`/quickstart-${input.framework}.md`),
  };
}

export const installPlanTool: ToolDefinition<InstallPlanInput, InstallPlanOutput> = {
  name: 'beacio_install_plan',
  title: 'Beacio install plan',
  description:
    'Return a machine-actionable install plan for shipping Web Bluetooth on iOS Safari via Beacio in the given framework + package manager: exact shell `commands` and concrete `files_to_edit` (the polyfill bootstrap) an agent can apply with zero judgment, plus human-readable steps, a runnable snippet, and an attribution token.',
  run: (input) => runInstallPlan(input),
};

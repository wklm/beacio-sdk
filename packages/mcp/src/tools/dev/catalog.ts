/**
 * Shared developer-tool catalog.
 *
 * `search-docs` (topic-centric, URL-bearing) and `find-examples` (file-centric,
 * line-bearing) historically hand-maintained two overlapping catalogs with
 * divergent fields and divergent scoring weights. This module unifies the *data*
 * into a single list of {@link CatalogEntry} records and the *ranking* into one
 * {@link scoreEntry} function that branches by query intent ('docs' | 'examples')
 * so it reproduces each tool's original top results exactly.
 *
 * Each entry may carry a docs facet (topic + url), an examples facet
 * (file + line), or both. A tool only ranks entries that expose the facet it
 * needs, then projects them into its own public output shape. Scoring weights are
 * intentionally NOT shared between intents — they are preserved verbatim from the
 * two original implementations to keep ranking stable (see the dev-catalog
 * stability snapshot test).
 */

export type CatalogIntent = 'docs' | 'examples';

export interface CatalogEntry {
  /** Stable identifier, unique within the catalog. */
  id: string;
  /** Docs facet — human-readable topic title (search-docs identity). */
  topic?: string;
  /** Docs facet — canonical documentation URL. */
  url?: string;
  /** Examples facet — repo-relative source path (find-examples identity). */
  file?: string;
  /** Examples facet — line number the snippet starts at. */
  line?: number;
  /** Short prose/code excerpt surfaced to the caller. */
  snippet: string;
  /** Lowercased match terms (exact-token matches score highest). */
  keywords: string[];
  /** Coarse grouping (core, profiles, react, detect, testing, mcp, docs...). */
  category: string;
}

/**
 * Single source of truth for both developer search tools.
 *
 * Doc-only entries (topic+url, no file) populate search-docs; example-only
 * entries (file+line, no topic) populate find-examples. Where a concept appears
 * in both original catalogs the snippet/keywords differ enough that they remain
 * distinct entries rather than being force-merged — merging identity-disjoint
 * rows would not change either tool's results and would muddy the snippets.
 */
export const CATALOG: CatalogEntry[] = [
  // ── Docs facet (formerly DOC_INDEX) ──────────────────────────────────────
  {
    id: 'docs:quickstart',
    topic: 'Quick Start',
    url: 'https://beacio.com/docs/quickstart',
    snippet:
      'Install @beacio/core and add the polyfill to your web app. Works on iOS Safari with the Beacio extension.',
    keywords: ['quickstart', 'install', 'setup', 'getting started', 'polyfill', 'auto', 'import'],
    category: 'docs',
  },
  {
    id: 'docs:api-beacio',
    topic: 'API Reference — Beacio class',
    url: 'https://beacio.com/docs/api#beacio',
    snippet:
      'The Beacio class provides requestDevice, getAvailability, and platform detection. Entry point for all BLE operations.',
    keywords: ['api', 'beacio', 'class', 'requestDevice', 'getAvailability', 'platform', 'reference'],
    category: 'docs',
  },
  {
    id: 'docs:api-device',
    topic: 'API Reference — BeacioDevice class',
    url: 'https://beacio.com/docs/api#beacio-device',
    snippet:
      'BeacioDevice wraps BluetoothDevice with connect, disconnect, read, write, subscribe, and notifications methods.',
    keywords: ['api', 'device', 'connect', 'disconnect', 'read', 'write', 'subscribe', 'notifications', 'gatt'],
    category: 'docs',
  },
  {
    id: 'docs:api-error',
    topic: 'API Reference — BeacioError',
    url: 'https://beacio.com/docs/api#beacio-error',
    snippet:
      'BeacioError provides typed error codes (DEVICE_NOT_FOUND, GATT_OPERATION_FAILED, etc.) with recovery suggestions.',
    keywords: ['api', 'error', 'beacioerror', 'code', 'suggestion', 'handle', 'catch'],
    category: 'docs',
  },
  {
    id: 'docs:react',
    topic: 'React SDK',
    url: 'https://beacio.com/docs/react',
    snippet:
      '@beacio/react provides BeacioProvider, useBeacio, useDevice, useNotifications hooks, and ready-made UI components.',
    keywords: ['react', 'hooks', 'provider', 'useBeacio', 'useDevice', 'useNotifications', 'component', 'jsx', 'tsx'],
    category: 'docs',
  },
  {
    id: 'docs:profiles',
    topic: 'Typed Profiles',
    url: 'https://beacio.com/docs/profiles',
    snippet:
      '@beacio/profiles ships HeartRateProfile, BatteryProfile, DeviceInfoProfile plus defineProfile for custom BLE profiles.',
    keywords: ['profiles', 'heart rate', 'battery', 'device info', 'defineProfile', 'typed', 'parsing', 'hr', 'bpm'],
    category: 'docs',
  },
  {
    id: 'docs:detect',
    topic: 'iOS Detection & Install Banner',
    url: 'https://beacio.com/docs/detect',
    snippet:
      '@beacio/detect adds an automatic install banner on iOS Safari when the Beacio extension is not installed.',
    keywords: ['detect', 'ios', 'safari', 'banner', 'install', 'extension', 'initBeacio', 'window.beacioIOS'],
    category: 'docs',
  },
  {
    id: 'docs:errors',
    topic: 'Error Codes & Troubleshooting',
    url: 'https://beacio.com/docs/errors',
    snippet:
      'Complete reference of BeacioError codes: BLUETOOTH_UNAVAILABLE, EXTENSION_NOT_INSTALLED, DEVICE_NOT_FOUND, and more with fixes.',
    keywords: ['errors', 'troubleshoot', 'debug', 'fix', 'not working', 'disconnect', 'permission', 'timeout'],
    category: 'docs',
  },
  {
    id: 'docs:user-gesture',
    topic: 'User Gesture Requirement',
    url: 'https://beacio.com/docs/quickstart#user-gesture',
    snippet:
      'requestDevice() MUST be called from a user gesture (click/tap). Never call it from useEffect, setTimeout, or page load on iOS Safari.',
    keywords: ['gesture', 'click', 'tap', 'user', 'securityerror', 'useEffect', 'page load', 'button'],
    category: 'docs',
  },
  {
    id: 'docs:testing',
    topic: 'Testing with Mocks',
    url: 'https://beacio.com/docs/testing',
    snippet:
      '@beacio/testing provides mock BLE devices, mock navigator.bluetooth, and helpers for unit/integration testing.',
    keywords: ['testing', 'mock', 'unit test', 'integration', 'jest', 'vitest', 'fake', 'stub'],
    category: 'docs',
  },

  // ── Examples facet (formerly EXAMPLE_INDEX) ───────────────────────────────
  {
    id: 'ex:core-beacio',
    file: 'packages/core/src/beacio.ts',
    line: 42,
    snippet: 'class Beacio { requestDevice(opts) { ... } getAvailability() { ... } }',
    category: 'core',
    keywords: ['beacio', 'class', 'requestDevice', 'getAvailability', 'core', 'entry point'],
  },
  {
    id: 'ex:core-device',
    file: 'packages/core/src/device.ts',
    line: 1,
    snippet: 'class BeacioDevice { connect() disconnect() read() write() subscribe() }',
    category: 'core',
    keywords: ['device', 'connect', 'disconnect', 'read', 'write', 'subscribe', 'gatt'],
  },
  {
    id: 'ex:core-errors',
    file: 'packages/core/src/errors.ts',
    line: 1,
    snippet: 'class BeacioError { code: BeacioErrorCode; suggestion: string; static from() }',
    category: 'core',
    keywords: ['error', 'beacioerror', 'code', 'suggestion', 'from', 'handle'],
  },
  {
    id: 'ex:core-uuids',
    file: 'packages/core/src/uuids.ts',
    line: 1,
    snippet: 'resolveUUID(name) getServiceName(uuid) getCharacteristicName(uuid)',
    category: 'core',
    keywords: ['uuid', 'resolve', 'service', 'characteristic', 'name', 'lookup'],
  },
  {
    id: 'ex:profiles-heart-rate',
    file: 'packages/profiles/src/heart-rate.ts',
    line: 1,
    snippet: 'class HeartRateProfile extends BaseProfile { onHeartRate(cb) readSensorLocation() }',
    category: 'profiles',
    keywords: ['heart rate', 'profile', 'bpm', 'sensor', 'hr', 'health'],
  },
  {
    id: 'ex:profiles-battery',
    file: 'packages/profiles/src/battery.ts',
    line: 1,
    snippet: 'class BatteryProfile extends BaseProfile { readLevel() onLevelChange(cb) }',
    category: 'profiles',
    keywords: ['battery', 'profile', 'level', 'power', 'percent'],
  },
  {
    id: 'ex:profiles-device-info',
    file: 'packages/profiles/src/device-info.ts',
    line: 1,
    snippet: 'class DeviceInfoProfile extends BaseProfile { readAll() readManufacturerName() }',
    category: 'profiles',
    keywords: ['device info', 'profile', 'manufacturer', 'serial', 'firmware', 'model'],
  },
  {
    id: 'ex:profiles-define',
    file: 'packages/profiles/src/define.ts',
    line: 1,
    snippet: 'defineProfile({ name, service, characteristics }) -> Profile class',
    category: 'profiles',
    keywords: ['defineProfile', 'custom', 'profile', 'define', 'create', 'build'],
  },
  {
    id: 'ex:react-provider',
    file: 'packages/react-sdk/src/provider.tsx',
    line: 1,
    snippet: 'BeacioProvider config={{ apiKey, operatorName, autoConnect }}',
    category: 'react',
    keywords: ['react', 'provider', 'beacioprovider', 'apiKey', 'config'],
  },
  {
    id: 'ex:react-hooks',
    file: 'packages/react-sdk/src/hooks.ts',
    line: 1,
    snippet: 'useBeacio() useDevice() useNotifications() useBluetooth() useCharacteristic()',
    category: 'react',
    keywords: ['react', 'hooks', 'useBeacio', 'useDevice', 'useNotifications', 'useBluetooth'],
  },
  {
    id: 'ex:detect-index',
    file: 'packages/detect/src/index.ts',
    line: 1,
    snippet: 'initBeacio({ key }) detectBeacio() -> { installed, version }',
    category: 'detect',
    keywords: ['detect', 'ios', 'safari', 'banner', 'initBeacio', 'install'],
  },
  {
    id: 'ex:testing-mock',
    file: 'packages/testing/src/mock.ts',
    line: 1,
    snippet: 'createMockDevice(opts) mockNavigatorBluetooth() mockRequestDevice()',
    category: 'testing',
    keywords: ['testing', 'mock', 'fake', 'stub', 'unit test', 'jest', 'vitest'],
  },
  {
    id: 'ex:mcp-server',
    file: 'packages/mcp/src/server.ts',
    line: 24,
    snippet: 'buildServer(opts): McpServer — registers tools with telemetry wrapper',
    category: 'mcp',
    keywords: ['mcp', 'server', 'tool', 'register', 'telemetry', 'buildserver'],
  },
  {
    id: 'ex:mcp-install-plan',
    file: 'packages/mcp/src/tools/install-plan.ts',
    line: 45,
    snippet: 'runInstallPlan({ framework, package_manager, include_premium? }) -> steps, snippet, token',
    category: 'mcp',
    keywords: ['install', 'plan', 'framework', 'package manager', 'mcp tool'],
  },
  {
    id: 'ex:mcp-example',
    file: 'packages/mcp/src/tools/example.ts',
    line: 22,
    snippet: 'runExample({ profile }) -> code, html, preconditions, spec_citations',
    category: 'mcp',
    keywords: ['example', 'code', 'snippet', 'profile', 'mcp tool', 'copy-paste'],
  },
];

/** Entries exposing the docs facet (topic + url), in catalog order. */
export const DOC_ENTRIES: CatalogEntry[] = CATALOG.filter(
  (e) => e.topic !== undefined && e.url !== undefined,
);

/** Entries exposing the examples facet (file + line), in catalog order. */
export const EXAMPLE_ENTRIES: CatalogEntry[] = CATALOG.filter(
  (e) => e.file !== undefined && e.line !== undefined,
);

/**
 * Score one entry against a tokenized query under a given intent.
 *
 * The two intents apply DIFFERENT weights, preserved verbatim from the original
 * tools — unifying the weights would shift rankings. Callers should only pass
 * entries that expose the facet matching the intent (use {@link DOC_ENTRIES} /
 * {@link EXAMPLE_ENTRIES}).
 *
 *  - docs:     topic-token +10, exact-keyword +8, any-text +3,
 *              exact topic == query +20, exact full-text == query +15
 *  - examples: exact-keyword +10, file-substring +5, snippet-substring +5,
 *              category == token +8, any-text +2, exact file == query +20
 */
export function scoreEntry(
  entry: CatalogEntry,
  query: string,
  queryTokens: string[],
  intent: CatalogIntent,
): number {
  let score = 0;

  if (intent === 'docs') {
    const topic = entry.topic ?? '';
    const entryText =
      `${topic} ${entry.snippet} ${entry.keywords.join(' ')}`.toLowerCase();

    for (const token of queryTokens) {
      if (topic.toLowerCase().includes(token)) score += 10;
      if (entry.keywords.some((k) => k.toLowerCase() === token)) score += 8;
      if (entryText.includes(token)) score += 3;
    }

    if (topic.toLowerCase() === query) score += 20;
    if (entryText === query) score += 15;
    return score;
  }

  // intent === 'examples'
  const file = entry.file ?? '';
  const entryText =
    `${file} ${entry.snippet} ${entry.keywords.join(' ')}`.toLowerCase();

  for (const token of queryTokens) {
    if (entry.keywords.some((k) => k.toLowerCase() === token)) score += 10;
    if (file.toLowerCase().includes(token)) score += 5;
    if (entry.snippet.toLowerCase().includes(token)) score += 5;
    if (entry.category.toLowerCase() === token) score += 8;
    if (entryText.includes(token)) score += 2;
  }

  if (file.toLowerCase() === query) score += 20;
  return score;
}

/**
 * Rank catalog entries for a query under an intent. Filters out zero-score
 * entries and sorts by descending score (stable sort preserves catalog order
 * for ties, matching the original tools' behavior).
 */
export function rankCatalog(
  entries: CatalogEntry[],
  rawQuery: string,
  intent: CatalogIntent,
): Array<{ entry: CatalogEntry; score: number }> {
  const query = rawQuery.trim().toLowerCase();
  const queryTokens = query.split(/\s+/);

  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, query, queryTokens, intent) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

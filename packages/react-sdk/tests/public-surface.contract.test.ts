import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import * as ReactSdk from '../src/index';

// AIDEV-NOTE: Public-surface contract guard (SBOPT-P3.2, slim-in-place).
// @beacio/react is a pinned future-client asset: the slim pass prunes dead
// internal code + unused devDependencies but MUST NOT change the PUBLIC export
// surface. onboarding-manifest.json names `BeacioProvider` in
// lowerLevelPrimitives, and check-package-bundles.mjs + the SDK topo build
// depend on the barrel's dist entry. This guard FREEZES the exact surface so any
// accidental add/remove during the slim (or later) reds here:
//   * VALUE exports are checked at RUNTIME — `Object.keys` of the imported
//     module namespace is the real consumer surface (type-only exports are
//     erased and never appear here).
//   * TYPE-only exports are erased at runtime, so they are parsed from the
//     barrel (src/index.ts) via the TypeScript compiler API — the same `ts`
//     dependency the SB-SDK-24 docs-migration guard uses. `X as Y` aliases are
//     resolved to the exported (consumer-visible) name `Y`.
// The contract is BEFORE == AFTER: this test is GREEN on the current tree by
// design and must stay GREEN through the slim; a removed/renamed public export
// reds it (see the non-vacuity proof in the SBOPT-P3.2 fix-note).

// --- FROZEN CONTRACT: the public surface of @beacio/react (src/index.ts) ------

// 16 runtime VALUE exports (`export { … } from …` in the barrel).
const FROZEN_VALUE_EXPORTS = [
  // Core
  'BeacioProvider',
  'useBeacio',
  'ExtensionDetector',
  // Hooks
  'useBluetooth',
  'useDevice',
  'useCharacteristic',
  'useNotifications',
  'useScan',
  'useBackgroundSync',
  'useProfile',
  'useConnection',
  // Components
  'DeviceScanner',
  'ServiceExplorer',
  'InstallationWizard',
  // Utilities
  'getServiceDisplayName',
  'getCharacteristicDisplayName',
];

// 29 TYPE-only exports (consumer-visible names; `ConnectionStatus as
// UseConnectionStatus` is recorded under the exported alias `UseConnectionStatus`).
const FROZEN_TYPE_EXPORTS = [
  // Re-exported from @beacio/core (single source of truth):
  'BackgroundConnectionOptions',
  'BackgroundRegistration',
  'BackgroundRegistrationType',
  'BeaconScanningOptions',
  'CharacteristicNotificationOptions',
  'NotificationPermissionState',
  'NotificationTemplate',
  'BeacioDevice',
  'BeacioError',
  'BeacioErrorCode',
  'Platform',
  'RequestDeviceOptions',
  'NotificationCallback',
  'WriteOptions',
  'WriteLimits',
  // Local to @beacio/react (./types):
  'BeacioConfig',
  'UseBluetoothReturn',
  'UseDeviceReturn',
  'UseCharacteristicReturn',
  'UseNotificationsReturn',
  'UseBackgroundSyncOptions',
  'UseBackgroundSyncReturn',
  'UseScanReturn',
  'ConnectionState',
  'ScanState',
  'NotificationHandler',
  'UseConnectionOptions',
  'UseConnectionReturn',
  'UseConnectionStatus',
];

const INDEX_PATH = join(__dirname, '..', 'src', 'index.ts');

// Parse the barrel's export declarations, splitting VALUE vs TYPE-only exports.
// Handles `X as Y` (records the exported name Y) and per-specifier `type`.
function barrelExports(): { value: Set<string>; type: Set<string> } {
  const source = ts.createSourceFile(
    INDEX_PATH,
    readFileSync(INDEX_PATH, 'utf8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );
  const value = new Set<string>();
  const type = new Set<string>();
  source.forEachChild((node) => {
    if (!ts.isExportDeclaration(node)) return;
    const clause = node.exportClause;
    if (!clause || !ts.isNamedExports(clause)) return; // skips `export * from …`
    for (const spec of clause.elements) {
      const exportedName = spec.name.text; // the post-`as` (consumer) name
      (node.isTypeOnly || spec.isTypeOnly ? type : value).add(exportedName);
    }
  });
  return { value, type };
}

const sorted = (xs: Iterable<string>): string[] => [...xs].sort();

describe('@beacio/react public-surface contract (SBOPT-P3.2 slim-in-place)', () => {
  it('keeps BeacioProvider + useBeacio as named exports (onboarding-manifest lowerLevelPrimitives)', () => {
    const keys = new Set(Object.keys(ReactSdk));
    expect(keys.has('BeacioProvider')).toBe(true);
    expect(keys.has('useBeacio')).toBe(true);
  });

  it('runtime VALUE export set is byte-identical to the frozen contract', () => {
    expect(sorted(Object.keys(ReactSdk))).toEqual(sorted(FROZEN_VALUE_EXPORTS));
  });

  it('static TYPE export set (barrel AST) is byte-identical to the frozen contract', () => {
    expect(sorted(barrelExports().type)).toEqual(sorted(FROZEN_TYPE_EXPORTS));
  });

  it('barrel-declared value exports agree with the runtime value surface (parser sanity)', () => {
    // A value<->type flip in the barrel diverges these even if a name-count
    // coincidence hid it from the frozen checks above.
    expect(sorted(barrelExports().value)).toEqual(sorted(Object.keys(ReactSdk)));
  });
});

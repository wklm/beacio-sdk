// GATT assigned-numbers tables + the §7.1 resolver (`canonicalUUID` /
// `resolveUUIDName`) live in ONE generated module (DR-06): the npm core, the
// extension-injected surface and the CDN polyfill all import them from there,
// so the registry data + §7.1 semantics exist exactly once. The lenient,
// fuzzy-matching SDK-level `resolveUUID` below is a separate, core-only helper
// built on top of those shared tables. Regenerate the tables with:
//   node scripts/registries/generate.mjs
import {
  BLUETOOTH_BASE_UUID_SUFFIX as BASE_SUFFIX,
  UUID_RE,
  GATT_ASSIGNED_SERVICES as SERVICES,
  GATT_ASSIGNED_CHARACTERISTICS as CHARACTERISTICS,
  GATT_ASSIGNED_DESCRIPTORS as DESCRIPTORS,
  canonicalUUID,
  resolveUUIDName,
} from './gatt-registry.generated';

export { canonicalUUID };

/** Expand a validated 16/32-bit alias into the canonical lowercase 128-bit UUID. */
function hexToUUID(hex: number): string {
  return hex.toString(16).padStart(8, '0') + BASE_SUFFIX;
}


// Reverse maps for name lookups (built lazily)
let serviceNameMap: Map<string, string> | undefined;
let charNameMap: Map<string, string> | undefined;

function getServiceNameMap(): Map<string, string> {
  if (!serviceNameMap) {
    serviceNameMap = new Map();
    // First definition wins, so a canonical name (e.g. generic_access) beats its
    // SIG abbreviation (gap) when multiple names map to the same UUID.
    for (const [name, hex] of Object.entries(SERVICES)) {
      const uuid = hexToUUID(hex);
      if (!serviceNameMap.has(uuid)) serviceNameMap.set(uuid, name);
    }
  }
  return serviceNameMap;
}

function getCharNameMap(): Map<string, string> {
  if (!charNameMap) {
    charNameMap = new Map();
    // First definition wins (canonical name beats any SIG abbreviation alias).
    for (const [name, hex] of Object.entries(CHARACTERISTICS)) {
      const uuid = hexToUUID(hex);
      if (!charNameMap.has(uuid)) charNameMap.set(uuid, name);
    }
  }
  return charNameMap;
}

const HEX4_RE = /^[0-9a-f]{4}$/;
const HEX8_RE = /^[0-9a-f]{8}$/;

/** Single-row Levenshtein distance — O(m·n) time, O(n) space. */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = tmp;
    }
  }
  return row[n];
}

function normalizeBluetoothName(input: string): string {
  return input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[-.\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function lookupNamedUUID(name: string, table: Record<string, number>): number | undefined {
  const directMatch = table[name];
  if (directMatch !== undefined) return directMatch;

  // Registry names may contain dots and hyphens ('gap.device_name',
  // 'ieee_11073-20601_…'); compare with all separators stripped so normalized
  // camelCase/kebab-case inputs still match.
  const compactName = name.replace(/[._-]/g, '');
  if (!compactName) return undefined;

  for (const [candidateName, candidateHex] of Object.entries(table)) {
    if (candidateName.replace(/[._-]/g, '') === compactName) {
      return candidateHex;
    }
  }

  return undefined;
}

/**
 * Resolve a service/characteristic name, number, or short UUID to a full 128-bit UUID string.
 *
 * **Supported input formats:**
 * 1. **Named alias** -- Bluetooth SIG service or characteristic name (e.g. `'heart_rate'`, `'battery_level'`)
 * 2. **16-bit integer** -- Numeric service/characteristic ID (e.g. `0x180D`)
 * 3. **4-hex string** -- Short 16-bit hex (e.g. `'180d'`)
 * 4. **8-hex string** -- 32-bit hex (e.g. `'0000180d'`)
 * 5. **Full 128-bit UUID** -- Passed through unchanged (e.g. `'0000180d-0000-1000-8000-00805f9b34fb'`)
 *
 * **Fuzzy matching:** If the input looks like a name but does not match any known alias,
 * Levenshtein edit distance (threshold <= 3) is used to suggest corrections. Name
 * normalization converts camelCase/PascalCase to snake_case and replaces hyphens/dots/spaces
 * with underscores before matching.
 *
 * @param nameOrUUID - Service/characteristic name, hex string, numeric ID, or full UUID.
 * @returns Canonical lowercase 128-bit UUID string.
 *
 * @throws {TypeError} If a numeric input is out of the 32-bit unsigned range.
 * @throws {TypeError} If a string input is not a valid UUID format or known name (includes "Did you mean?" hint).
 *
 * @example
 * ```typescript
 * resolveUUID('heart_rate')      // '0000180d-0000-1000-8000-00805f9b34fb'
 * resolveUUID('180d')            // '0000180d-0000-1000-8000-00805f9b34fb'
 * resolveUUID(0x180D)            // '0000180d-0000-1000-8000-00805f9b34fb'
 * resolveUUID('battery_level')   // '00002a19-0000-1000-8000-00805f9b34fb'
 * resolveUUID('HeartRate')       // '0000180d-...' (camelCase normalized)
 * resolveUUID('heart_rat')       // throws Error: Did you mean "heart_rate"?
 * ```
 *
 * @see {@link getServiceName} for reverse lookup (UUID to name)
 * @see {@link getCharacteristicName} for reverse lookup (UUID to name)
 */
export function resolveUUID(nameOrUUID: string | number): string {
  // Numeric input: 16-bit or 32-bit Bluetooth UUID integer
  if (typeof nameOrUUID === 'number') {
    if (!Number.isInteger(nameOrUUID) || nameOrUUID < 0 || nameOrUUID > 0xFFFFFFFF) {
      throw new TypeError(`Invalid UUID integer: ${nameOrUUID}. Must be a 16-bit or 32-bit unsigned integer.`);
    }
    return hexToUUID(nameOrUUID);
  }

  const raw = nameOrUUID.trim();
  const lower = raw.toLowerCase();

  // Full 128-bit UUID
  if (UUID_RE.test(lower)) return lower;

  // 4-digit hex shorthand
  if (HEX4_RE.test(lower)) return '0000' + lower + BASE_SUFFIX;

  // 8-digit hex shorthand
  if (HEX8_RE.test(lower)) return lower + BASE_SUFFIX;

  // Exact registry-name match first — registry names may contain dots
  // ('gap.device_name') that name normalization would otherwise destroy.
  const exactAlias = SERVICES[lower] ?? CHARACTERISTICS[lower];
  if (exactAlias !== undefined) return hexToUUID(exactAlias);

  const normalizedName = normalizeBluetoothName(raw);

  // Named service
  const serviceHex = lookupNamedUUID(normalizedName, SERVICES);
  if (serviceHex !== undefined) return hexToUUID(serviceHex);

  // Named characteristic
  const charHex = lookupNamedUUID(normalizedName, CHARACTERISTICS);
  if (charHex !== undefined) return hexToUUID(charHex);

  // Reject strings that don't look like valid UUIDs or hex shorthand.
  // Likely a typo of a Bluetooth SIG name (e.g. "heart_rat" instead of "heart_rate").
  // AIDEV-NOTE: Uses Levenshtein distance (≤3) with prefix fallback to catch typos
  // beyond simple character-position mismatches (e.g. "heartrate" → "heart_rate").
  const allNames = Object.keys(SERVICES).concat(Object.keys(CHARACTERISTICS));

  // Levenshtein match — find the closest name within edit distance 3
  let closest: string | undefined;
  let bestDist = 4; // threshold + 1
  for (const name of allNames) {
    const d = levenshtein(normalizedName, name);
    if (d < bestDist) {
      bestDist = d;
      closest = name;
    }
  }

  // Prefix fallback — if no close Levenshtein match, check if input is a prefix
  // of a known name (minimum 4 chars to avoid overly broad matches).
  if (!closest && normalizedName.length >= 4) {
    closest = allNames.find((name) => name.startsWith(normalizedName));
  }

  const hint = closest ? ` Did you mean "${closest}"?` : '';
  // §7.1 ResolveUUIDName: "Otherwise, throw a TypeError." (a real TypeError,
  // so `err instanceof TypeError` holds for spec-conformant callers).
  throw new TypeError(`Invalid UUID: "${nameOrUUID}". Expected a 128-bit UUID, 4/8-digit hex, or a known Bluetooth SIG name.${hint}`);
}

/**
 * Get the human-readable Bluetooth SIG service name for a UUID, if known.
 *
 * @param uuid - Full 128-bit UUID string (case-insensitive).
 * @returns Service name (e.g. `'heart_rate'`), or `undefined` if not a known SIG service.
 *
 * @see {@link resolveUUID} for the reverse operation (name to UUID)
 */
export function getServiceName(uuid: string): string | undefined {
  return getServiceNameMap().get(uuid.toLowerCase());
}

/**
 * Get the human-readable Bluetooth SIG characteristic name for a UUID, if known.
 *
 * @param uuid - Full 128-bit UUID string (case-insensitive).
 * @returns Characteristic name (e.g. `'heart_rate_measurement'`), or `undefined` if not a known SIG characteristic.
 *
 * @see {@link resolveUUID} for the reverse operation (name to UUID)
 */
export function getCharacteristicName(uuid: string): string | undefined {
  return getCharNameMap().get(uuid.toLowerCase());
}

/**
 * Format a Bluetooth SIG snake_case name (e.g. `'heart_rate'`) as Title Case
 * (e.g. `'Heart Rate'`) for display in a UI.
 *
 * Unknown inputs — anything that does not look like a snake_case SIG name, such
 * as a raw UUID string or hex shorthand — are returned unchanged so callers can
 * use the raw value as a fallback label.
 *
 * @param name - A snake_case SIG name, or a raw UUID/hex string.
 * @returns Title-cased name, or the input unchanged when it is not a SIG name.
 *
 * @example
 * ```typescript
 * getDisplayName('heart_rate')             // 'Heart Rate'
 * getDisplayName('heart_rate_measurement') // 'Heart Rate Measurement'
 * getDisplayName('gap.device_name')        // 'Device Name'
 * getDisplayName('0000180d-0000-1000-8000-00805f9b34fb') // (unchanged)
 * ```
 */
export function getDisplayName(name: string): string {
  // Registry names in the GAP/GATT namespaces are dot-prefixed
  // ('gap.device_name', 'gatt.client_characteristic_configuration'). The
  // prefix is registry plumbing, not part of the SIG human-readable name —
  // strip it before formatting so 0x2A00 displays as 'Device Name'.
  const bare = name.replace(/^(gap|gatt)\./, '');
  // Raw UUIDs / hex shorthand are not SIG names — return them unchanged so the
  // caller can show the raw identifier as a fallback label.
  if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(bare)) return name;
  return bare
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// BluetoothUUID — Web Bluetooth spec §4
// https://webbluetoothcg.github.io/web-bluetooth/#bluetoothuuid
//
// Static methods to resolve service, characteristic, and descriptor
// names/aliases to canonical 128-bit UUID strings.
// ---------------------------------------------------------------------------

// Descriptor name → 16-bit alias map (descriptors are not part of
// SERVICES/CHARACTERISTICS). Keys use the registry dot form, e.g.
// 'gatt.client_characteristic_configuration'.


// `canonicalUUID` and the §7.1 `resolveUUIDName` (used by `getDescriptor` and
// the `BluetoothUUID` namespace below) are imported from
// `./gatt-registry.generated` — the single source shared with the extension +
// CDN surfaces (DR-06). `canonicalUUID` is re-exported at the top of this file.

/**
 * Resolve a descriptor name or UUID alias to a canonical 128-bit UUID.
 * Implements `BluetoothUUID.getDescriptor()` from the Web Bluetooth spec
 * (§7.1 ResolveUUIDName against GATT assigned descriptors only): accepts a
 * registry descriptor name in its registry dot form
 * (e.g. `'gatt.client_characteristic_configuration'`), an integer alias, or
 * a valid lowercase 128-bit UUID. Anything else throws a TypeError.
 *
 * @param name - Descriptor name, 16/32-bit integer alias, or full UUID string.
 * @returns Canonical 128-bit UUID string.
 * @throws {TypeError} For unknown names, bare hex shorthand, or uppercase UUIDs.
 *
 * @example
 * ```typescript
 * getDescriptor('gatt.client_characteristic_configuration') // '00002902-...'
 * getDescriptor(0x2902)                                      // '00002902-...'
 * ```
 *
 * @see {@link resolveUUID} for the lenient SDK-level resolver
 */
export function getDescriptor(name: string | number): string {
  return resolveUUIDName(name, DESCRIPTORS, 'getDescriptor');
}

/**
 * BluetoothUUID namespace object conforming to the Web Bluetooth spec.
 * Can be assigned to `window.BluetoothUUID` for spec compliance.
 * Each getter is scoped to its own GATT assigned-numbers table (§7.1).
 */
export const BluetoothUUID = {
  canonicalUUID,
  getService: (name: string | number) => resolveUUIDName(name, SERVICES, 'getService'),
  getCharacteristic: (name: string | number) => resolveUUIDName(name, CHARACTERISTICS, 'getCharacteristic'),
  getDescriptor,
} as const;

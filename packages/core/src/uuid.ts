const BASE_SUFFIX = '-0000-1000-8000-00805f9b34fb';

// Bluetooth SIG assigned service UUIDs (16-bit)
const SERVICES: Record<string, number> = {
  generic_access: 0x1800,
  gap: 0x1800,
  generic_attribute: 0x1801,
  gatt: 0x1801,
  device_information: 0x180A,
  battery_service: 0x180F,
  heart_rate: 0x180D,
  health_thermometer: 0x1809,
  glucose: 0x1808,
  blood_pressure: 0x1810,
  running_speed_and_cadence: 0x1814,
  cycling_speed_and_cadence: 0x1816,
  cycling_power: 0x1818,
  location_and_navigation: 0x1819,
  environmental_sensing: 0x181A,
  body_composition: 0x181B,
  user_data: 0x181C,
  weight_scale: 0x181D,
  bond_management: 0x181E,
  continuous_glucose_monitoring: 0x181F,
  internet_protocol_support: 0x1820,
  indoor_positioning: 0x1821,
  pulse_oximeter: 0x1822,
  http_proxy: 0x1823,
  transport_discovery: 0x1824,
  object_transfer: 0x1825,
  fitness_machine: 0x1826,
  mesh_provisioning: 0x1827,
  mesh_proxy: 0x1828,
  reconnection_configuration: 0x1829,
  insulin_delivery: 0x183A,
  binary_sensor: 0x183B,
  emergency_configuration: 0x183C,
  physical_activity_monitor: 0x183E,
  audio_input_control: 0x1843,
  volume_control: 0x1844,
  volume_offset_control: 0x1845,
  coordinated_set_identification: 0x1846,
  device_time: 0x1847,
  media_control: 0x1848,
  generic_media_control: 0x1849,
  constant_tone_extension: 0x184A,
  telephone_bearer: 0x184B,
  generic_telephone_bearer: 0x184C,
  microphone_control: 0x184D,
};

// Bluetooth SIG assigned characteristic UUIDs (16-bit)
const CHARACTERISTICS: Record<string, number> = {
  device_name: 0x2A00,
  appearance: 0x2A01,
  peripheral_privacy_flag: 0x2A02,
  reconnection_address: 0x2A03,
  peripheral_preferred_connection_parameters: 0x2A04,
  service_changed: 0x2A05,
  system_id: 0x2A23,
  model_number_string: 0x2A24,
  serial_number_string: 0x2A25,
  firmware_revision_string: 0x2A26,
  hardware_revision_string: 0x2A27,
  software_revision_string: 0x2A28,
  manufacturer_name_string: 0x2A29,
  battery_level: 0x2A19,
  heart_rate_measurement: 0x2A37,
  body_sensor_location: 0x2A38,
  heart_rate_control_point: 0x2A39,
  temperature: 0x2A6E,
};

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
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

  const compactName = name.replace(/_/g, '');
  if (!compactName) return undefined;

  for (const [candidateName, candidateHex] of Object.entries(table)) {
    if (candidateName.replace(/_/g, '') === compactName) {
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
 * @throws {Error} If a string input is not a valid UUID format or known name (includes "Did you mean?" hint).
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
  throw new Error(`Invalid UUID: "${nameOrUUID}". Expected a 128-bit UUID, 4/8-digit hex, or a known Bluetooth SIG name.${hint}`);
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
 * getDisplayName('0000180d-0000-1000-8000-00805f9b34fb') // (unchanged)
 * ```
 */
export function getDisplayName(name: string): string {
  // Raw UUIDs / hex shorthand are not SIG names — return them unchanged so the
  // caller can show the raw identifier as a fallback label.
  if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name)) return name;
  return name
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

// Descriptor name → 16-bit hex map (descriptors are not part of SERVICES/CHARACTERISTICS)
const DESCRIPTORS: Record<string, number> = {
  gatt_characteristic_extended_properties: 0x2900,
  gatt_characteristic_user_description: 0x2901,
  gatt_client_characteristic_configuration: 0x2902,
  gatt_server_characteristic_configuration: 0x2903,
  gatt_characteristic_presentation_format: 0x2904,
  gatt_characteristic_aggregate_format: 0x2905,
  valid_range: 0x2906,
  external_report_reference: 0x2907,
  report_reference: 0x2908,
  number_of_digitals: 0x2909,
  value_trigger_setting: 0x290A,
  es_configuration: 0x290B,
  es_measurement: 0x290C,
  es_trigger_setting: 0x290D,
  time_trigger_setting: 0x290E,
  complete_br_edr_transport_block_data: 0x290F,
};

/**
 * Convert a 16-bit or 32-bit integer alias to a canonical 128-bit UUID string.
 * Implements `BluetoothUUID.canonicalUUID()` from the Web Bluetooth spec.
 *
 * @param alias - 16-bit or 32-bit unsigned integer (0 to 0xFFFFFFFF).
 * @returns Canonical lowercase 128-bit UUID string.
 * @throws {TypeError} If the alias is not a valid unsigned 32-bit integer.
 *
 * @example
 * ```typescript
 * canonicalUUID(0x180D) // '0000180d-0000-1000-8000-00805f9b34fb'
 * canonicalUUID(0x2A37) // '00002a37-0000-1000-8000-00805f9b34fb'
 * ```
 *
 * @see {@link resolveUUID} for resolving names and hex strings
 */
export function canonicalUUID(alias: number): string {
  if (!Number.isInteger(alias) || alias < 0 || alias > 0xFFFFFFFF) {
    throw new TypeError(
      `Failed to execute 'canonicalUUID' on 'BluetoothUUID': ` +
      `Value is not a valid unsigned long: ${alias}`
    );
  }
  return hexToUUID(alias);
}

/**
 * Resolve a service or characteristic name or UUID alias to a canonical
 * 128-bit UUID. Backs `BluetoothUUID.getService()` and
 * `BluetoothUUID.getCharacteristic()` from the Web Bluetooth spec, which share
 * identical resolution semantics.
 *
 * @param name - Name (e.g. `'heart_rate'`), 16-bit integer, or UUID string.
 * @returns Canonical 128-bit UUID string.
 *
 * @see {@link resolveUUID}
 */
function resolveServiceOrCharacteristic(name: string | number): string {
  if (typeof name === 'number') return canonicalUUID(name);
  return resolveUUID(name);
}

/**
 * Resolve a descriptor name or UUID alias to a canonical 128-bit UUID.
 * Implements `BluetoothUUID.getDescriptor()` from the Web Bluetooth spec.
 * Supports GATT descriptor names (e.g. `'gatt_client_characteristic_configuration'`)
 * in addition to all formats supported by {@link resolveUUID}.
 *
 * @param name - Descriptor name, 16-bit integer, or UUID string.
 * @returns Canonical 128-bit UUID string.
 *
 * @example
 * ```typescript
 * getDescriptor('gatt_client_characteristic_configuration') // '00002902-...'
 * getDescriptor(0x2902)                                     // '00002902-...'
 * ```
 *
 * @see {@link resolveUUID}
 */
export function getDescriptor(name: string | number): string {
  if (typeof name === 'number') return canonicalUUID(name);

  const lower = name.toLowerCase();
  const descHex = DESCRIPTORS[lower];
  if (descHex !== undefined) return hexToUUID(descHex);

  // Fall through to resolveUUID for full UUIDs and hex shorthands
  return resolveUUID(name);
}

/**
 * BluetoothUUID namespace object conforming to the Web Bluetooth spec.
 * Can be assigned to `window.BluetoothUUID` for spec compliance.
 */
export const BluetoothUUID = {
  canonicalUUID,
  getService: resolveServiceOrCharacteristic,
  getCharacteristic: resolveServiceOrCharacteristic,
  getDescriptor,
} as const;

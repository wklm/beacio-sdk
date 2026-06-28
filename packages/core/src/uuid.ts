const BASE_SUFFIX = '-0000-1000-8000-00805f9b34fb';

// GATT assigned numbers (Web Bluetooth §7.2), generated from the vendored
// WebBluetoothCG registries — the single source of truth shared with
// `Shared (Extension)/UUIDResolver.swift` and `src/cdn/beacio.ts`.
// Regenerate with: node scripts/registries/generate.mjs

// registries:begin core-services
// GENERATED from registries/gatt_assigned_services.txt by scripts/registries/generate.mjs — do not edit by hand.
const SERVICES: Record<string, number> = {
  'generic_access': 0x1800,
  'generic_attribute': 0x1801,
  'immediate_alert': 0x1802,
  'link_loss': 0x1803,
  'tx_power': 0x1804,
  'current_time': 0x1805,
  'reference_time_update': 0x1806,
  'next_dst_change': 0x1807,
  'glucose': 0x1808,
  'health_thermometer': 0x1809,
  'device_information': 0x180A,
  'heart_rate': 0x180D,
  'phone_alert_status': 0x180E,
  'battery_service': 0x180F,
  'blood_pressure': 0x1810,
  'alert_notification': 0x1811,
  'human_interface_device': 0x1812,
  'scan_parameters': 0x1813,
  'running_speed_and_cadence': 0x1814,
  'automation_io': 0x1815,
  'cycling_speed_and_cadence': 0x1816,
  'cycling_power': 0x1818,
  'location_and_navigation': 0x1819,
  'environmental_sensing': 0x181A,
  'body_composition': 0x181B,
  'user_data': 0x181C,
  'weight_scale': 0x181D,
  'bond_management': 0x181E,
  'continuous_glucose_monitoring': 0x181F,
  'internet_protocol_support': 0x1820,
  'indoor_positioning': 0x1821,
  'pulse_oximeter': 0x1822,
  'http_proxy': 0x1823,
  'transport_discovery': 0x1824,
  'object_transfer': 0x1825,
  'fitness_machine': 0x1826,
  'mesh_provisioning': 0x1827,
  'mesh_proxy': 0x1828,
  'reconnection_configuration': 0x1829,
};
// registries:end core-services

// registries:begin core-characteristics
// GENERATED from registries/gatt_assigned_characteristics.txt by scripts/registries/generate.mjs — do not edit by hand.
const CHARACTERISTICS: Record<string, number> = {
  'gap.device_name': 0x2A00,
  'gap.appearance': 0x2A01,
  'gap.peripheral_privacy_flag': 0x2A02,
  'gap.reconnection_address': 0x2A03,
  'gap.peripheral_preferred_connection_parameters': 0x2A04,
  'gatt.service_changed': 0x2A05,
  'alert_level': 0x2A06,
  'tx_power_level': 0x2A07,
  'date_time': 0x2A08,
  'day_of_week': 0x2A09,
  'day_date_time': 0x2A0A,
  'exact_time_100': 0x2A0B,
  'exact_time_256': 0x2A0C,
  'dst_offset': 0x2A0D,
  'time_zone': 0x2A0E,
  'local_time_information': 0x2A0F,
  'secondary_time_zone': 0x2A10,
  'time_with_dst': 0x2A11,
  'time_accuracy': 0x2A12,
  'time_source': 0x2A13,
  'reference_time_information': 0x2A14,
  'time_broadcast': 0x2A15,
  'time_update_control_point': 0x2A16,
  'time_update_state': 0x2A17,
  'glucose_measurement': 0x2A18,
  'battery_level': 0x2A19,
  'battery_power_state': 0x2A1A,
  'battery_level_state': 0x2A1B,
  'temperature_measurement': 0x2A1C,
  'temperature_type': 0x2A1D,
  'intermediate_temperature': 0x2A1E,
  'temperature_celsius': 0x2A1F,
  'temperature_fahrenheit': 0x2A20,
  'measurement_interval': 0x2A21,
  'boot_keyboard_input_report': 0x2A22,
  'system_id': 0x2A23,
  'model_number_string': 0x2A24,
  'serial_number_string': 0x2A25,
  'firmware_revision_string': 0x2A26,
  'hardware_revision_string': 0x2A27,
  'software_revision_string': 0x2A28,
  'manufacturer_name_string': 0x2A29,
  'ieee_11073-20601_regulatory_certification_data_list': 0x2A2A,
  'current_time': 0x2A2B,
  'magnetic_declination': 0x2A2C,
  'position_2d': 0x2A2F,
  'position_3d': 0x2A30,
  'scan_refresh': 0x2A31,
  'boot_keyboard_output_report': 0x2A32,
  'boot_mouse_input_report': 0x2A33,
  'glucose_measurement_context': 0x2A34,
  'blood_pressure_measurement': 0x2A35,
  'intermediate_cuff_pressure': 0x2A36,
  'heart_rate_measurement': 0x2A37,
  'body_sensor_location': 0x2A38,
  'heart_rate_control_point': 0x2A39,
  'removable': 0x2A3A,
  'service_required': 0x2A3B,
  'scientific_temperature_celsius': 0x2A3C,
  'string': 0x2A3D,
  'network_availability': 0x2A3E,
  'alert_status': 0x2A3F,
  'ringer_control_point': 0x2A40,
  'ringer_setting': 0x2A41,
  'alert_category_id_bit_mask': 0x2A42,
  'alert_category_id': 0x2A43,
  'alert_notification_control_point': 0x2A44,
  'unread_alert_status': 0x2A45,
  'new_alert': 0x2A46,
  'supported_new_alert_category': 0x2A47,
  'supported_unread_alert_category': 0x2A48,
  'blood_pressure_feature': 0x2A49,
  'hid_information': 0x2A4A,
  'report_map': 0x2A4B,
  'hid_control_point': 0x2A4C,
  'report': 0x2A4D,
  'protocol_mode': 0x2A4E,
  'scan_interval_window': 0x2A4F,
  'pnp_id': 0x2A50,
  'glucose_feature': 0x2A51,
  'record_access_control_point': 0x2A52,
  'rsc_measurement': 0x2A53,
  'rsc_feature': 0x2A54,
  'sc_control_point': 0x2A55,
  'digital': 0x2A56,
  'digital_output': 0x2A57,
  'analog': 0x2A58,
  'analog_output': 0x2A59,
  'aggregate': 0x2A5A,
  'csc_measurement': 0x2A5B,
  'csc_feature': 0x2A5C,
  'sensor_location': 0x2A5D,
  'plx_spot_check_measurement': 0x2A5E,
  'plx_continuous_measurement': 0x2A5F,
  'plx_features': 0x2A60,
  'pulse_oximetry_control_point': 0x2A62,
  'cycling_power_measurement': 0x2A63,
  'cycling_power_vector': 0x2A64,
  'cycling_power_feature': 0x2A65,
  'cycling_power_control_point': 0x2A66,
  'location_and_speed': 0x2A67,
  'navigation': 0x2A68,
  'position_quality': 0x2A69,
  'ln_feature': 0x2A6A,
  'ln_control_point': 0x2A6B,
  'elevation': 0x2A6C,
  'pressure': 0x2A6D,
  'temperature': 0x2A6E,
  'humidity': 0x2A6F,
  'true_wind_speed': 0x2A70,
  'true_wind_direction': 0x2A71,
  'apparent_wind_speed': 0x2A72,
  'apparent_wind_direction': 0x2A73,
  'gust_factor': 0x2A74,
  'pollen_concentration': 0x2A75,
  'uv_index': 0x2A76,
  'irradiance': 0x2A77,
  'rainfall': 0x2A78,
  'wind_chill': 0x2A79,
  'heat_index': 0x2A7A,
  'dew_point': 0x2A7B,
  'descriptor_value_changed': 0x2A7D,
  'aerobic_heart_rate_lower_limit': 0x2A7E,
  'aerobic_threshold': 0x2A7F,
  'age': 0x2A80,
  'anaerobic_heart_rate_lower_limit': 0x2A81,
  'anaerobic_heart_rate_upper_limit': 0x2A82,
  'anaerobic_threshold': 0x2A83,
  'aerobic_heart_rate_upper_limit': 0x2A84,
  'date_of_birth': 0x2A85,
  'date_of_threshold_assessment': 0x2A86,
  'email_address': 0x2A87,
  'fat_burn_heart_rate_lower_limit': 0x2A88,
  'fat_burn_heart_rate_upper_limit': 0x2A89,
  'first_name': 0x2A8A,
  'five_zone_heart_rate_limits': 0x2A8B,
  'gender': 0x2A8C,
  'heart_rate_max': 0x2A8D,
  'height': 0x2A8E,
  'hip_circumference': 0x2A8F,
  'last_name': 0x2A90,
  'maximum_recommended_heart_rate': 0x2A91,
  'resting_heart_rate': 0x2A92,
  'sport_type_for_aerobic_and_anaerobic_thresholds': 0x2A93,
  'three_zone_heart_rate_limits': 0x2A94,
  'two_zone_heart_rate_limit': 0x2A95,
  'vo2_max': 0x2A96,
  'waist_circumference': 0x2A97,
  'weight': 0x2A98,
  'database_change_increment': 0x2A99,
  'user_index': 0x2A9A,
  'body_composition_feature': 0x2A9B,
  'body_composition_measurement': 0x2A9C,
  'weight_measurement': 0x2A9D,
  'weight_scale_feature': 0x2A9E,
  'user_control_point': 0x2A9F,
  'magnetic_flux_density_2d': 0x2AA0,
  'magnetic_flux_density_3d': 0x2AA1,
  'language': 0x2AA2,
  'barometric_pressure_trend': 0x2AA3,
  'bond_management_control_point': 0x2AA4,
  'bond_management_feature': 0x2AA5,
  'gap.central_address_resolution_support': 0x2AA6,
  'cgm_measurement': 0x2AA7,
  'cgm_feature': 0x2AA8,
  'cgm_status': 0x2AA9,
  'cgm_session_start_time': 0x2AAA,
  'cgm_session_run_time': 0x2AAB,
  'cgm_specific_ops_control_point': 0x2AAC,
  'indoor_positioning_configuration': 0x2AAD,
  'latitude': 0x2AAE,
  'longitude': 0x2AAF,
  'local_north_coordinate': 0x2AB0,
  'local_east_coordinate.xml': 0x2AB1,
  'floor_number': 0x2AB2,
  'altitude': 0x2AB3,
  'uncertainty': 0x2AB4,
  'location_name': 0x2AB5,
  'uri': 0x2AB6,
  'http_headers': 0x2AB7,
  'http_status_code': 0x2AB8,
  'http_entity_body': 0x2AB9,
  'http_control_point': 0x2ABA,
  'https_security': 0x2ABB,
  'tds_control_point': 0x2ABC,
  'ots_feature': 0x2ABD,
  'object_name': 0x2ABE,
  'object_type': 0x2ABF,
  'object_size': 0x2AC0,
  'object_first_created': 0x2AC1,
  'object_last_modified': 0x2AC2,
  'object_id': 0x2AC3,
  'object_properties': 0x2AC4,
  'object_action_control_point': 0x2AC5,
  'object_list_control_point': 0x2AC6,
  'object_list_filter': 0x2AC7,
  'object_changed': 0x2AC8,
  'resolvable_private_address_only': 0x2AC9,
  'fitness_machine_feature': 0x2ACC,
  'treadmill_data': 0x2ACD,
  'cross_trainer_data': 0x2ACE,
  'step_climber_data': 0x2ACF,
  'stair_climber_data': 0x2AD0,
  'rower_data': 0x2AD1,
  'indoor_bike_data': 0x2AD2,
  'training_status': 0x2AD3,
  'supported_speed_range': 0x2AD4,
  'supported_inclination_range': 0x2AD5,
  'supported_resistance_level_range': 0x2AD6,
  'supported_heart_rate_range': 0x2AD7,
  'supported_power_range': 0x2AD8,
  'fitness_machine_control_point': 0x2AD9,
  'fitness_machine_status': 0x2ADA,
  'date_utc': 0x2AED,
};
// registries:end core-characteristics

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

// registries:begin core-descriptors
// GENERATED from registries/gatt_assigned_descriptors.txt by scripts/registries/generate.mjs — do not edit by hand.
const DESCRIPTORS: Record<string, number> = {
  'gatt.characteristic_extended_properties': 0x2900,
  'gatt.characteristic_user_description': 0x2901,
  'gatt.client_characteristic_configuration': 0x2902,
  'gatt.server_characteristic_configuration': 0x2903,
  'gatt.characteristic_presentation_format': 0x2904,
  'gatt.characteristic_aggregate_format': 0x2905,
  'valid_range': 0x2906,
  'external_report_reference': 0x2907,
  'report_reference': 0x2908,
  'number_of_digitals': 0x2909,
  'value_trigger_setting': 0x290A,
  'es_configuration': 0x290B,
  'es_measurement': 0x290C,
  'es_trigger_setting': 0x290D,
  'time_trigger_setting': 0x290E,
};
// registries:end core-descriptors

/**
 * Convert a 16-bit or 32-bit integer alias to a canonical 128-bit UUID string.
 * Implements `BluetoothUUID.canonicalUUID()` from the Web Bluetooth spec.
 *
 * Spec IDL: `static UUID canonicalUUID([EnforceRange] unsigned long alias)` —
 * the WebIDL `[EnforceRange]` conversion is ToNumber, then truncation, then a
 * range check. Fractional inputs like `2.5` therefore CONVERT (to `2`); only
 * NaN, ±Infinity, and values outside [0, 2^32 − 1] after truncation throw.
 *
 * @param alias - 16-bit or 32-bit unsigned integer (0 to 0xFFFFFFFF).
 * @returns Canonical lowercase 128-bit UUID string.
 * @throws {TypeError} If the alias fails [EnforceRange] unsigned long conversion.
 *
 * @example
 * ```typescript
 * canonicalUUID(0x180D) // '0000180d-0000-1000-8000-00805f9b34fb'
 * canonicalUUID(0x2A37) // '00002a37-0000-1000-8000-00805f9b34fb'
 * canonicalUUID(2.5)    // '00000002-0000-1000-8000-00805f9b34fb'
 * ```
 *
 * @see {@link resolveUUID} for resolving names and hex strings
 */
export function canonicalUUID(alias: number): string {
  // [EnforceRange] unsigned long (WebIDL §3.2.4.9): ToNumber → reject
  // non-finite → truncate toward zero → reject out of [0, 2^32 − 1].
  const converted = Number(alias);
  if (!Number.isFinite(converted)) {
    throw new TypeError(
      `Failed to execute 'canonicalUUID' on 'BluetoothUUID': ` +
      `Value is not a valid unsigned long: ${alias}`
    );
  }
  const truncated = Math.trunc(converted);
  if (truncated < 0 || truncated > 0xFFFFFFFF) {
    throw new TypeError(
      `Failed to execute 'canonicalUUID' on 'BluetoothUUID': ` +
      `Value is not a valid unsigned long: ${alias}`
    );
  }
  // `+ 0` normalizes -0 (from truncating e.g. -0.5) to 0.
  return hexToUUID(truncated + 0);
}

/**
 * §7.1 ResolveUUIDName, scoped to a single GATT assigned-numbers table.
 * Names are table-scoped because the registries reuse names across categories
 * (`current_time` is service 0x1805 AND characteristic 0x2A2B), so
 * `BluetoothUUID.getService()` / `getCharacteristic()` / `getDescriptor()`
 * must each consult only their own table. Unknown names throw a TypeError
 * (spec: "Otherwise, throw a TypeError").
 *
 * Spec-exact strictness: a §7 valid UUID is LOWERCASE 128-bit only, so
 * uppercase UUID strings and bare 4/8-hex abbreviations are rejected here
 * (the lenient forms remain available on the SDK-level {@link resolveUUID}).
 * Name lookup is case-folded because the generated tables key the registry's
 * mixed-case spellings (e.g. `magnetic_flux_density_2D`) in lowercase.
 */
function resolveUUIDName(
  name: string | number,
  table: Record<string, number>,
  getter: string,
): string {
  if (typeof name === 'number') return canonicalUUID(name);
  if (UUID_RE.test(name)) return name;
  const alias = table[name.toLowerCase()];
  if (alias !== undefined) return hexToUUID(alias);
  throw new TypeError(
    `Failed to execute '${getter}' on 'BluetoothUUID': Invalid UUID or registry name: "${name}"`
  );
}

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

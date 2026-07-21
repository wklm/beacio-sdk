import { describe, expect, it } from '@jest/globals';
import {
  resolveUUID,
  getServiceName,
  getCharacteristicName,
  getDisplayName,
  canonicalUUID,
  getDescriptor,
  BluetoothUUID,
} from '../src/uuid';
import {
  GATT_ASSIGNED_SERVICES,
  GATT_ASSIGNED_CHARACTERISTICS,
  GATT_ASSIGNED_DESCRIPTORS,
} from '../src/gatt-registry.generated';

const BASE = '-0000-1000-8000-00805f9b34fb';

describe('resolveUUID', () => {
  it('resolves named service to full UUID', () => {
    expect(resolveUUID('heart_rate')).toBe('0000180d' + BASE);
  });

  it('resolves named characteristic to full UUID', () => {
    expect(resolveUUID('heart_rate_measurement')).toBe('00002a37' + BASE);
  });

  it('resolves camelCase service names silently', () => {
    expect(resolveUUID('heartRate')).toBe('0000180d' + BASE);
  });

  it('resolves kebab-case service names silently', () => {
    expect(resolveUUID('running-speed-and-cadence')).toBe('00001814' + BASE);
  });

  it('resolves camelCase characteristic names silently', () => {
    expect(resolveUUID('heartRateMeasurement')).toBe('00002a37' + BASE);
  });

  it('resolves dotted characteristic names silently', () => {
    expect(resolveUUID('heart.rate.measurement')).toBe('00002a37' + BASE);
  });

  it('resolves names with omitted underscores silently', () => {
    expect(resolveUUID('heartrate')).toBe('0000180d' + BASE);
  });

  it('expands 4-hex shorthand', () => {
    expect(resolveUUID('180d')).toBe('0000180d' + BASE);
  });

  it('expands 8-hex shorthand', () => {
    expect(resolveUUID('0000180d')).toBe('0000180d' + BASE);
  });

  it('passes through full 128-bit UUID', () => {
    const full = '12345678-1234-1234-1234-123456789abc';
    expect(resolveUUID(full)).toBe(full);
  });

  it('canonicalizes mixed-case full UUIDs to lowercase', () => {
    expect(resolveUUID('12345678-1234-1234-1234-ABCDEFABCDEF')).toBe('12345678-1234-1234-1234-abcdefabcdef');
  });

  it('lowercases input', () => {
    expect(resolveUUID('180D')).toBe('0000180d' + BASE);
  });

  it('suggests close Levenshtein matches (edit distance 1)', () => {
    expect(() => resolveUUID('heart_rat')).toThrow(/Did you mean "heart_rate"/);
  });

  it('suggests close matches when normalization cannot resolve', () => {
    expect(() => resolveUUID('heartrat')).toThrow(/Did you mean "heart_rate"/);
  });

  it('suggests matches at edit distance 2', () => {
    expect(() => resolveUUID('hrat_rate')).toThrow(/Did you mean "heart_rate"/);
  });

  it('suggests prefix matches when ≥4 chars', () => {
    expect(() => resolveUUID('environmental_')).toThrow(/Did you mean "environmental_sensing"/);
  });

  it('throws without suggestion for distant strings', () => {
    const err = () => resolveUUID('totally_bogus');
    expect(err).toThrow(/Invalid UUID/);
    expect(err).toThrow(/Expected a 128-bit UUID/);
  });

  // §7.1: "Otherwise, throw a TypeError." — a plain Error breaks
  // `instanceof TypeError` checks in spec-conformant callers.
  it('throws a real TypeError for unknown names', () => {
    expect(() => resolveUUID('totally_bogus')).toThrow(TypeError);
    expect(() => resolveUUID('heart_rat')).toThrow(TypeError);
  });
});

describe('getServiceName', () => {
  it('returns name for known service UUID', () => {
    expect(getServiceName('0000180d' + BASE)).toBe('heart_rate');
  });

  it('returns undefined for unknown UUID', () => {
    expect(getServiceName('00000000' + BASE)).toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(getServiceName('0000180D' + BASE)).toBe('heart_rate');
  });
});

describe('getCharacteristicName', () => {
  it('returns name for known characteristic UUID', () => {
    expect(getCharacteristicName('00002a37' + BASE)).toBe('heart_rate_measurement');
  });

  it('returns undefined for unknown UUID', () => {
    expect(getCharacteristicName('00000000' + BASE)).toBeUndefined();
  });
});

describe('getDisplayName', () => {
  it('converts snake_case to Title Case', () => {
    expect(getDisplayName('heart_rate')).toBe('Heart Rate');
  });

  it('title-cases multi-word characteristic names', () => {
    expect(getDisplayName('heart_rate_measurement')).toBe('Heart Rate Measurement');
  });

  it('title-cases single-word names', () => {
    expect(getDisplayName('appearance')).toBe('Appearance');
  });

  it('strips the gap./gatt. registry namespace before title-casing', () => {
    expect(getDisplayName('gap.device_name')).toBe('Device Name');
    expect(getDisplayName('gatt.client_characteristic_configuration')).toBe(
      'Client Characteristic Configuration',
    );
  });

  it('passes through registry quirk names that are not plain snake_case', () => {
    expect(getDisplayName('local_east_coordinate.xml')).toBe('local_east_coordinate.xml');
    expect(getDisplayName('ieee_11073-20601_regulatory_certification_data_list')).toBe(
      'ieee_11073-20601_regulatory_certification_data_list',
    );
  });

  it('passes through a raw UUID unchanged (fallback for unknowns)', () => {
    const full = '0000abcd' + BASE;
    expect(getDisplayName(full)).toBe(full);
  });

  it('passes through short hex fallback unchanged', () => {
    expect(getDisplayName('0x9999')).toBe('0x9999');
  });
});

describe('canonicalUUID', () => {
  it('expands a 16-bit alias to a canonical UUID', () => {
    expect(canonicalUUID(0x180d)).toBe('0000180d' + BASE);
  });

  it('expands a 32-bit alias to a canonical UUID', () => {
    expect(canonicalUUID(0x12345678)).toBe('12345678' + BASE);
  });

  // IDL: `canonicalUUID([EnforceRange] unsigned long alias)` — [EnforceRange]
  // applies ToNumber then truncation, so fractional inputs CONVERT, they do
  // not throw.
  it('truncates fractional aliases per [EnforceRange]', () => {
    expect(canonicalUUID(2.5)).toBe('00000002' + BASE);
    expect(canonicalUUID(0x180d + 0.9)).toBe('0000180d' + BASE);
  });

  it('converts numeric strings per [EnforceRange] ToNumber', () => {
    expect(canonicalUUID('0x180d' as unknown as number)).toBe('0000180d' + BASE);
    expect(canonicalUUID('6157.5' as unknown as number)).toBe('0000180d' + BASE);
  });

  it('truncates negative fractions above -1 to zero', () => {
    expect(canonicalUUID(-0.5)).toBe('00000000' + BASE);
  });

  it('throws a TypeError on NaN and non-finite aliases', () => {
    expect(() => canonicalUUID(NaN)).toThrow(TypeError);
    expect(() => canonicalUUID(Infinity)).toThrow(TypeError);
    expect(() => canonicalUUID('bogus' as unknown as number)).toThrow(TypeError);
  });

  it('throws a TypeError on out-of-range aliases', () => {
    expect(() => canonicalUUID(0x1_0000_0000)).toThrow(/not a valid unsigned long/);
  });

  it('throws a TypeError on negative aliases', () => {
    expect(() => canonicalUUID(-1)).toThrow(TypeError);
  });
});

describe('getDescriptor', () => {
  it('resolves a known descriptor name (registry dot form) to a canonical UUID', () => {
    expect(getDescriptor('gatt.client_characteristic_configuration')).toBe('00002902' + BASE);
  });

  it('resolves the spec §7.1 worked example', () => {
    expect(getDescriptor('gatt.characteristic_presentation_format')).toBe('00002904' + BASE);
  });

  it('is case-insensitive for descriptor names', () => {
    expect(getDescriptor('GATT.Client_Characteristic_Configuration')).toBe('00002902' + BASE);
  });

  it('does not resolve the legacy underscore spelling of gatt.* names', () => {
    expect(() => getDescriptor('gatt_client_characteristic_configuration')).toThrow();
  });

  it('resolves a numeric descriptor alias', () => {
    expect(getDescriptor(0x2902)).toBe('00002902' + BASE);
  });

  // §7 valid UUID is lowercase 128-bit only; bare 4/8-hex shorthand is not a
  // valid UUID, not a registered name → TypeError.
  it('rejects bare hex shorthand with a TypeError', () => {
    expect(() => getDescriptor('2902')).toThrow(TypeError);
    expect(() => getDescriptor('00002902')).toThrow(TypeError);
  });

  it('passes through full lowercase UUIDs', () => {
    const full = '00002902' + BASE;
    expect(getDescriptor(full)).toBe(full);
  });
});

describe('BluetoothUUID namespace', () => {
  it('exposes canonicalUUID', () => {
    expect(BluetoothUUID.canonicalUUID(0x180d)).toBe('0000180d' + BASE);
  });

  it('getService resolves named services', () => {
    expect(BluetoothUUID.getService('heart_rate')).toBe('0000180d' + BASE);
  });

  it('getService resolves numeric aliases', () => {
    expect(BluetoothUUID.getService(0x180d)).toBe('0000180d' + BASE);
  });

  it('getCharacteristic resolves named characteristics', () => {
    expect(BluetoothUUID.getCharacteristic('heart_rate_measurement')).toBe('00002a37' + BASE);
  });

  it('getDescriptor resolves descriptor names', () => {
    expect(BluetoothUUID.getDescriptor('gatt.client_characteristic_configuration')).toBe('00002902' + BASE);
  });

  // §7.1 worked example: BluetoothUUID.getService("unknown-service") throws a
  // TypeError.
  it('throws a real TypeError for unknown names', () => {
    expect(() => BluetoothUUID.getService('unknown-service')).toThrow(TypeError);
    expect(() => BluetoothUUID.getCharacteristic('unknown-characteristic')).toThrow(TypeError);
    expect(() => BluetoothUUID.getDescriptor('unknown-descriptor')).toThrow(TypeError);
  });

  // §7.1: each getter resolves against its own GATT assigned-numbers table
  // only — no cross-category fallback.
  it('scopes each getter to its own registry table', () => {
    expect(() => BluetoothUUID.getService('battery_level')).toThrow(TypeError);
    expect(() => BluetoothUUID.getCharacteristic('heart_rate')).toThrow(TypeError);
    expect(() => BluetoothUUID.getDescriptor('heart_rate')).toThrow(TypeError);
  });

  // `current_time` is registered as BOTH service 0x1805 and characteristic
  // 0x2A2B — per-table scoping must yield different UUIDs per getter.
  it('resolves names shared across categories within each getter scope', () => {
    expect(BluetoothUUID.getService('current_time')).toBe('00001805' + BASE);
    expect(BluetoothUUID.getCharacteristic('current_time')).toBe('00002a2b' + BASE);
  });

  // §7: a valid UUID is lowercase 128-bit; the 16/32-bit hex abbreviations
  // and uppercase spellings are not valid UUID slots on this surface.
  it('rejects bare 4/8-hex shorthand', () => {
    expect(() => BluetoothUUID.getService('180d')).toThrow(TypeError);
    expect(() => BluetoothUUID.getService('0000180d')).toThrow(TypeError);
  });

  it('rejects uppercase 128-bit UUID strings', () => {
    expect(() => BluetoothUUID.getService('0000180D-0000-1000-8000-00805F9B34FB')).toThrow(TypeError);
  });

  it('passes through valid lowercase UUIDs', () => {
    expect(BluetoothUUID.getService('00001801' + BASE)).toBe('00001801' + BASE);
  });

  it('canonicalUUID applies [EnforceRange] conversion', () => {
    expect(BluetoothUUID.canonicalUUID(2.5)).toBe('00000002' + BASE);
    expect(() => BluetoothUUID.canonicalUUID(-1)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// Full-registry coverage (Web Bluetooth §7.1/§7.2): every name in the vendored
// WebBluetoothCG registry files must resolve to canonicalUUID(alias). Guards
// against the tables regressing to hand-rolled subsets.
// ---------------------------------------------------------------------------

describe('GATT assigned-numbers registry coverage', () => {
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const registriesDir = join(__dirname, '..', '..', '..', 'registries');

  function registryEntries(fileName: string): Array<[string, string]> {
    return (readFileSync(join(registriesDir, fileName), 'utf8') as string)
      .split('\n')
      .filter((line: string) => line !== '' && !line.startsWith('#'))
      .map((line: string) => {
        const [name, uuid] = line.split(' ');
        // Mirror the generator's D2-001 sanitize (scripts/registries/generate.mjs
        // parseAssignedNumbers): strip the leaked `.xml` source-filename suffix so
        // this "every registered name resolves" check tests the REAL bare name
        // (`local_east_coordinate`), which is what the fixed table now keys on.
        return [name.toLowerCase().replace(/\.xml$/, ''), uuid.toLowerCase()] as [string, string];
      });
  }

  it('resolves every registered service name', () => {
    for (const [name, uuid] of registryEntries('gatt_assigned_services.txt')) {
      expect(BluetoothUUID.getService(name)).toBe(uuid);
    }
  });

  it('resolves every registered characteristic name', () => {
    for (const [name, uuid] of registryEntries('gatt_assigned_characteristics.txt')) {
      expect(BluetoothUUID.getCharacteristic(name)).toBe(uuid);
    }
  });

  it('resolves every registered descriptor name', () => {
    for (const [name, uuid] of registryEntries('gatt_assigned_descriptors.txt')) {
      expect(BluetoothUUID.getDescriptor(name)).toBe(uuid);
    }
  });

  it('resolves the spec §7.1 worked examples', () => {
    expect(BluetoothUUID.getService('cycling_power')).toBe('00001818' + BASE);
    expect(BluetoothUUID.getService('tx_power')).toBe('00001804' + BASE);
    expect(BluetoothUUID.getCharacteristic('ieee_11073-20601_regulatory_certification_data_list')).toBe('00002a2a' + BASE);
    expect(BluetoothUUID.getCharacteristic('gap.device_name')).toBe('00002a00' + BASE);
    expect(BluetoothUUID.getDescriptor('gatt.characteristic_presentation_format')).toBe('00002904' + BASE);
  });
});

// ---------------------------------------------------------------------------
// D2-001 (ACTION-PLAN #8): a stray `.xml` source-filename suffix leaked from the
// vendored WebBluetoothCG registry into the generated characteristic key
// (`local_east_coordinate.xml` → 0x2AB1), so the REAL Web Bluetooth name
// `local_east_coordinate` is unreachable — it throws on iOS while resolving on
// Chrome (bluetooth_uuid.cc:250 has the bare name). The generator must strip the
// suffix and fail loudly on any other stray file-extension suffix. These guards
// lock the fix and prevent a future silent leak.
// ---------------------------------------------------------------------------
describe('D2-001 stray .xml registry-key leak (local_east_coordinate / 0x2AB1)', () => {
  it('resolves the real characteristic name local_east_coordinate to 0x2AB1', () => {
    expect(BluetoothUUID.getCharacteristic('local_east_coordinate')).toBe('00002ab1' + BASE);
  });

  it('does NOT treat the leaked .xml source-filename as a real name', () => {
    expect(() => BluetoothUUID.getCharacteristic('local_east_coordinate.xml')).toThrow(TypeError);
  });

  it('keys the characteristic table on the bare name, not the .xml filename', () => {
    expect(
      Object.prototype.hasOwnProperty.call(GATT_ASSIGNED_CHARACTERISTICS, 'local_east_coordinate'),
    ).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(GATT_ASSIGNED_CHARACTERISTICS, 'local_east_coordinate.xml'),
    ).toBe(false);
  });

  // Durable table-invariant: no generated registry key may carry a stray
  // trailing file-extension suffix (`.xml`, `.txt`, …). Legit GATT names are
  // dot-namespaced (`gap.device_name`, `gatt.service_changed`) but their final
  // segment is always a long identifier (≥6 chars), so a short trailing
  // dot-segment (1–5 alnum) is only ever a leaked source-filename suffix.
  it('has no generated key with a stray trailing file-extension suffix', () => {
    const STRAY_SUFFIX_RE = /\.[a-z0-9]{1,5}$/;
    const offenders = [
      ...Object.keys(GATT_ASSIGNED_SERVICES),
      ...Object.keys(GATT_ASSIGNED_CHARACTERISTICS),
      ...Object.keys(GATT_ASSIGNED_DESCRIPTORS),
    ].filter((key) => STRAY_SUFFIX_RE.test(key));
    expect(offenders).toEqual([]);
  });
});

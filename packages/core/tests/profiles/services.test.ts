import { describe, expect, it } from '@jest/globals';
import {
  deriveOptionalServices,
  NUS_SERVICES,
  HEART_RATE_SERVICES,
  NordicUARTProfile,
  HeartRateProfile,
} from '../../src/profiles/index';

const NUS = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const HEART_RATE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';

describe('per-profile SERVICES exports', () => {
  it('NUS_SERVICES pins the Nordic UART service', () => {
    expect(NUS_SERVICES).toEqual([NUS]);
  });

  it('HEART_RATE_SERVICES resolves the SIG heart_rate alias to its canonical 128-bit UUID', () => {
    expect(HEART_RATE_SERVICES).toEqual([HEART_RATE_UUID]);
  });

  it('every SERVICES array entry is a canonical lowercase 128-bit UUID', () => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const uuid of [...NUS_SERVICES, ...HEART_RATE_SERVICES]) {
      expect(uuid).toMatch(uuidRe);
    }
  });
});

describe('deriveOptionalServices()', () => {
  it('derives the family services for the Nordic UART and Heart Rate profiles', () => {
    expect(deriveOptionalServices(NordicUARTProfile)).toEqual(NUS_SERVICES);
    expect(deriveOptionalServices(HeartRateProfile)).toEqual(HEART_RATE_SERVICES);
  });

  it('accepts plain service arrays and resolves aliases/hex to canonical lowercase', () => {
    expect(deriveOptionalServices(['heart_rate', '180F'])).toEqual([
      HEART_RATE_UUID,
      '0000180f-0000-1000-8000-00805f9b34fb',
    ]);
  });

  it('combining two profiles flattens + de-dups (no duplicate UUIDs)', () => {
    const combined = deriveOptionalServices(NordicUARTProfile, HeartRateProfile, NordicUARTProfile);
    expect(combined).toEqual([NUS, HEART_RATE_UUID]);
    expect(new Set(combined).size).toBe(combined.length);
  });

  it('mixes profiles and raw arrays, de-duping an overlapping UUID across the two', () => {
    const combined = deriveOptionalServices(NordicUARTProfile, [NUS, 'heart_rate']);
    // NUS appears in both the profile and the array; it must survive exactly once.
    expect(combined).toEqual([NUS, HEART_RATE_UUID]);
  });

  it('is order-preserving and idempotent (deriving an already-derived array is a no-op)', () => {
    const once = deriveOptionalServices(NordicUARTProfile, HeartRateProfile);
    const twice = deriveOptionalServices(once);
    expect(once).toEqual([NUS, HEART_RATE_UUID]);
    expect(twice).toEqual(once);
  });
});

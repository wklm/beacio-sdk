import {
  getServiceDisplayName,
  getCharacteristicDisplayName
} from '../../src/utils/bluetooth-utils';
import * as bluetoothUtils from '../../src/utils/bluetooth-utils';

// Title Case names are produced by core's getDisplayName() formatter applied
// to core's snake_case SIG names (single source of truth); the local
// STANDARD_SERVICES/STANDARD_CHARACTERISTICS maps and the local `canonicalUUID`
// canonicalizer were removed (DR-12) — the display-name helpers now delegate to
// @beacio/core's resolver after a small 0x-strip shim.
describe('bluetooth-utils', () => {
  describe('getServiceDisplayName', () => {
    it('should return standard service names', () => {
      expect(getServiceDisplayName('0x1800')).toBe('Generic Access');
      expect(getServiceDisplayName('0x180D')).toBe('Heart Rate');
      expect(getServiceDisplayName('0x180F')).toBe('Battery Service');
      expect(getServiceDisplayName('0x180A')).toBe('Device Information');
    });

    it('should handle case insensitive UUIDs', () => {
      expect(getServiceDisplayName('0x1800')).toBe('Generic Access');
      expect(getServiceDisplayName('0X1800')).toBe('Generic Access');
      expect(getServiceDisplayName('0x180d')).toBe('Heart Rate');
    });

    it('should accept bare 4-digit hex short forms (no 0x prefix)', () => {
      expect(getServiceDisplayName('1800')).toBe('Generic Access');
      expect(getServiceDisplayName('180d')).toBe('Heart Rate');
    });

    it('should accept canonical 128-bit UUIDs', () => {
      expect(getServiceDisplayName('0000180d-0000-1000-8000-00805f9b34fb')).toBe('Heart Rate');
    });

    it('should accept Bluetooth SIG names (core resolver)', () => {
      expect(getServiceDisplayName('heart_rate')).toBe('Heart Rate');
    });

    it('should return the raw input for unknown / garbage services', () => {
      expect(getServiceDisplayName('0x9999')).toBe('0x9999');
      expect(getServiceDisplayName('custom-uuid')).toBe('custom-uuid');
    });
  });

  describe('getCharacteristicDisplayName', () => {
    it('should return standard characteristic names', () => {
      expect(getCharacteristicDisplayName('0x2A00')).toBe('Device Name');
      expect(getCharacteristicDisplayName('0x2A19')).toBe('Battery Level');
      expect(getCharacteristicDisplayName('0x2A37')).toBe('Heart Rate Measurement');
      expect(getCharacteristicDisplayName('0x2A29')).toBe('Manufacturer Name String');
    });

    it('should handle case insensitive UUIDs', () => {
      expect(getCharacteristicDisplayName('0x2a00')).toBe('Device Name');
      expect(getCharacteristicDisplayName('0X2A19')).toBe('Battery Level');
    });

    it('should accept bare 4-digit hex short forms (no 0x prefix)', () => {
      expect(getCharacteristicDisplayName('2a19')).toBe('Battery Level');
    });

    it('should accept Bluetooth SIG names (core resolver)', () => {
      expect(getCharacteristicDisplayName('battery_level')).toBe('Battery Level');
    });

    it('should return the raw input for unknown / garbage characteristics', () => {
      expect(getCharacteristicDisplayName('0x9999')).toBe('0x9999');
      expect(getCharacteristicDisplayName('custom-uuid')).toBe('custom-uuid');
    });
  });

  // Guard: the local `canonicalUUID` (a broken fourth TS canonicalizer that
  // shadowed core's stricter export by name) must NOT be re-introduced.
  describe('canonicalUUID removal guard', () => {
    it('is no longer exported from bluetooth-utils', () => {
      expect(
        (bluetoothUtils as Record<string, unknown>).canonicalUUID
      ).toBeUndefined();
    });
  });
});

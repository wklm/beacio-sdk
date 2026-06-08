import {
  getServiceName,
  getCharacteristicName,
  parseValue,
  formatValue,
  canonicalUUID
} from '../../src/utils/bluetooth-utils';

// Title Case names are produced by core's getDisplayName() formatter applied
// to core's snake_case SIG names (single source of truth); the local
// STANDARD_SERVICES/STANDARD_CHARACTERISTICS maps were removed.
describe('bluetooth-utils', () => {
  describe('getServiceName', () => {
    it('should return standard service names', () => {
      expect(getServiceName('0x1800')).toBe('Generic Access');
      expect(getServiceName('0x180D')).toBe('Heart Rate');
      expect(getServiceName('0x180F')).toBe('Battery Service');
      expect(getServiceName('0x180A')).toBe('Device Information');
    });

    it('should handle case insensitive UUIDs', () => {
      expect(getServiceName('0x1800')).toBe('Generic Access');
      expect(getServiceName('0X1800')).toBe('Generic Access');
      expect(getServiceName('0x180d')).toBe('Heart Rate');
    });

    it('should return UUID for unknown services', () => {
      expect(getServiceName('0x9999')).toBe('0x9999');
      expect(getServiceName('custom-uuid')).toBe('custom-uuid');
    });
  });

  describe('getCharacteristicName', () => {
    it('should return standard characteristic names', () => {
      expect(getCharacteristicName('0x2A00')).toBe('Device Name');
      expect(getCharacteristicName('0x2A19')).toBe('Battery Level');
      expect(getCharacteristicName('0x2A37')).toBe('Heart Rate Measurement');
      expect(getCharacteristicName('0x2A29')).toBe('Manufacturer Name String');
    });

    it('should handle case insensitive UUIDs', () => {
      expect(getCharacteristicName('0x2a00')).toBe('Device Name');
      expect(getCharacteristicName('0X2A19')).toBe('Battery Level');
    });

    it('should return UUID for unknown characteristics', () => {
      expect(getCharacteristicName('0x9999')).toBe('0x9999');
      expect(getCharacteristicName('custom-uuid')).toBe('custom-uuid');
    });
  });

  describe('parseValue', () => {
    it('should parse battery level', () => {
      const buffer = new ArrayBuffer(1);
      const view = new DataView(buffer);
      view.setUint8(0, 75);
      
      expect(parseValue(view, '0x2A19')).toBe(75);
    });

    it('should parse heart rate measurement (8-bit)', () => {
      const buffer = new ArrayBuffer(2);
      const view = new DataView(buffer);
      view.setUint8(0, 0x00); // Flags: 8-bit heart rate
      view.setUint8(1, 72);
      
      expect(parseValue(view, '0x2A37')).toBe(72);
    });

    it('should parse heart rate measurement (16-bit)', () => {
      const buffer = new ArrayBuffer(3);
      const view = new DataView(buffer);
      view.setUint8(0, 0x01); // Flags: 16-bit heart rate
      view.setUint16(1, 180, true); // Little endian
      
      expect(parseValue(view, '0x2A37')).toBe(180);
    });

    it('should parse string values', () => {
      const text = 'Test Device';
      const encoder = new TextEncoder();
      const buffer = encoder.encode(text).buffer;
      const view = new DataView(buffer);
      
      expect(parseValue(view, '0x2A00')).toBe(text);
      expect(parseValue(view, '0x2A29')).toBe(text);
    });

    it('should return hex string for unknown characteristics', () => {
      const buffer = new ArrayBuffer(3);
      const view = new DataView(buffer);
      view.setUint8(0, 0x01);
      view.setUint8(1, 0x02);
      view.setUint8(2, 0xFF);
      
      expect(parseValue(view, '0x9999')).toBe('01 02 ff');
    });
  });

  describe('formatValue', () => {
    it('should format battery level', () => {
      const buffer = formatValue(85, '0x2A19');
      const view = new DataView(buffer);
      
      expect(view.getUint8(0)).toBe(85);
    });

    it('should format string values', () => {
      const text = 'Device Name';
      const buffer = formatValue(text, '0x2A00');
      const decoder = new TextDecoder();
      
      expect(decoder.decode(buffer)).toBe(text);
    });

    it('should pass through ArrayBuffer', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint32(0, 0x12345678);
      
      const result = formatValue(buffer, '0x9999');
      expect(result).toBe(buffer);
    });

    it('should convert Uint8Array to ArrayBuffer', () => {
      const array = new Uint8Array([1, 2, 3, 4]);
      const buffer = formatValue(array, '0x9999');
      
      // The buffer should contain the same data but be a new ArrayBuffer
      const view = new DataView(buffer);
      expect(view.getUint8(0)).toBe(1);
      expect(view.getUint8(1)).toBe(2);
      expect(view.getUint8(2)).toBe(3);
      expect(view.getUint8(3)).toBe(4);
      expect(buffer.byteLength).toBe(4);
    });

    it('should parse hex string', () => {
      const hexString = '01 02 ff';
      const buffer = formatValue(hexString, '0x9999');
      const view = new DataView(buffer);
      
      expect(view.getUint8(0)).toBe(0x01);
      expect(view.getUint8(1)).toBe(0x02);
      expect(view.getUint8(2)).toBe(0xff);
    });

    it('should throw error for unsupported value types', () => {
      expect(() => formatValue({}, '0x9999')).toThrow('Cannot format value');
    });
  });

  describe('canonicalUUID', () => {
    it('should expand 4-character UUID', () => {
      expect(canonicalUUID('180d')).toBe('0000180d-0000-1000-8000-00805f9b34fb');
      expect(canonicalUUID('2a19')).toBe('00002a19-0000-1000-8000-00805f9b34fb');
    });

    it('should expand 8-character UUID', () => {
      expect(canonicalUUID('12345678')).toBe('12345678-0000-1000-8000-00805f9b34fb');
    });

    it('should handle numeric UUID', () => {
      expect(canonicalUUID(0x180d)).toBe('0000180d-0000-1000-8000-00805f9b34fb');
      expect(canonicalUUID(0x2a19)).toBe('00002a19-0000-1000-8000-00805f9b34fb');
    });

    it('should lowercase full UUID', () => {
      const fullUUID = '12345678-9ABC-DEF0-1234-567890ABCDEF';
      expect(canonicalUUID(fullUUID)).toBe('12345678-9abc-def0-1234-567890abcdef');
    });

    it('should return already canonical UUID unchanged', () => {
      const canonical = '12345678-9abc-def0-1234-567890abcdef';
      expect(canonicalUUID(canonical)).toBe(canonical);
    });
  });
});
/**
 * Bluetooth utility functions for the React SDK
 */

import {
  getServiceName as coreGetServiceName,
  getCharacteristicName as coreGetCharacteristicName,
  getDisplayName,
} from '@ios-web-bluetooth/core';

/**
 * Get the human-readable name for a service UUID.
 * Accepts short-form (0X1800), hex (1800), or canonical UUIDs.
 *
 * Delegates name resolution to `@ios-web-bluetooth/core` (single source of
 * truth) and formats the snake_case SIG name as Title Case for display. Falls
 * back to the raw UUID for unknown services.
 */
export function getServiceName(uuid: string): string {
  const name = coreGetServiceName(canonicalUUID(uuid));
  return name ? getDisplayName(name) : uuid;
}

/**
 * Get the human-readable name for a characteristic UUID.
 * Accepts short-form (0X2A37), hex (2a37), or canonical UUIDs.
 *
 * Delegates name resolution to `@ios-web-bluetooth/core` (single source of
 * truth) and formats the snake_case SIG name as Title Case for display. Falls
 * back to the raw UUID for unknown characteristics.
 */
export function getCharacteristicName(uuid: string): string {
  const name = coreGetCharacteristicName(canonicalUUID(uuid));
  return name ? getDisplayName(name) : uuid;
}

/**
 * Parse a DataView value based on the characteristic UUID
 */
export function parseValue(value: DataView, uuid: string): any {
  const normalized = uuid.toUpperCase();
  
  switch (normalized) {
    case '0X2A19': // Battery Level (handle both 0x and 0X)
      return value.getUint8(0);
      
    case '0X2A37': // Heart Rate Measurement
      const flags = value.getUint8(0);
      const is16Bit = flags & 0x01;
      const heartRate = is16Bit ? value.getUint16(1, true) : value.getUint8(1);
      return heartRate;
      
    case '0X2A00': // Device Name (handle both 0x and 0X)
    case '0X2A29': // Manufacturer Name
    case '0X2A24': // Model Number
    case '0X2A25': // Serial Number
    case '0X2A26': // Firmware Revision
    case '0X2A27': // Hardware Revision
    case '0X2A28': // Software Revision
      return new TextDecoder().decode(value.buffer);
      
    default:
      // Return hex string for unknown characteristics
      return Array.from(new Uint8Array(value.buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
  }
}

/**
 * Format a value for writing to a characteristic
 */
export function formatValue(value: any, uuid: string): ArrayBuffer {
  const normalized = uuid.toUpperCase();
  
  switch (normalized) {
    case '0X2A19': // Battery Level (handle both 0x and 0X)
      const batteryBuffer = new ArrayBuffer(1);
      const batteryView = new DataView(batteryBuffer);
      batteryView.setUint8(0, value);
      return batteryBuffer;
      
    case '0X2A00': // Device Name (and other string characteristics) - handle both 0x and 0X
    case '0X2A29':
    case '0X2A24':
    case '0X2A25':
    case '0X2A26':
    case '0X2A27':
    case '0X2A28':
      return new TextEncoder().encode(value).buffer;
      
    default:
      // Assume value is already an ArrayBuffer or can be converted
      if (value instanceof ArrayBuffer) {
        return value;
      }
      if (value instanceof Uint8Array) {
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
      }
      if (typeof value === 'string') {
        // Parse hex string
        const bytes = value.split(/\s+/).map(b => parseInt(b, 16));
        return new Uint8Array(bytes).buffer;
      }
      if (typeof value === 'number') {
        // For generic numeric values, store as uint8
        const buffer = new ArrayBuffer(1);
        const view = new DataView(buffer);
        view.setUint8(0, value);
        return buffer;
      }
      throw new Error(`Cannot format value for characteristic ${uuid}`);
  }
}

/**
 * Convert a UUID to its canonical form
 */
export function canonicalUUID(uuid: string | number): string {
  if (typeof uuid === 'number') {
    uuid = uuid.toString(16);
  }

  uuid = uuid.toLowerCase();

  // Strip 0x prefix (e.g. '0x1800' → '1800')
  if (uuid.startsWith('0x')) {
    uuid = uuid.slice(2);
  }

  // If it's a 4-character UUID, expand it
  if (uuid.length === 4) {
    uuid = `0000${uuid}-0000-1000-8000-00805f9b34fb`;
  }

  // If it's an 8-character UUID, expand it
  if (uuid.length === 8) {
    uuid = `${uuid}-0000-1000-8000-00805f9b34fb`;
  }

  return uuid;
}
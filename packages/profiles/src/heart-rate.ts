import { readUint8, readUint16LE, resolveUUID } from '@beacio/core';
import { BaseProfile } from './base';

/**
 * Service UUIDs a Heart Rate device may reach after connection (the SIG Heart
 * Rate Service, 0x180D). Canonical 128-bit form (resolved from the SIG alias via
 * the core registry — single source of truth). Use with `optionalServices` /
 * `Beacio.registerServices`, or via {@link deriveOptionalServices} given
 * {@link HeartRateProfile}.
 */
export const HEART_RATE_SERVICES: readonly string[] = [resolveUUID('heart_rate')];

/**
 * Parsed heart rate measurement data from the Heart Rate Measurement
 * characteristic (UUID 0x2A37).
 *
 * Fields are populated based on the flags byte in the BLE payload.
 * Optional fields are `null` when the corresponding flag bit is unset.
 */
export interface HeartRateData {
  /** Heart rate value in beats per minute (BPM). May be 8-bit or 16-bit depending on the flags byte. */
  bpm: number;
  /** Whether the sensor has skin contact. `null` if the sensor does not support contact detection. */
  contact: boolean | null;
  /** Cumulative energy expended in kilojoules since the last reset. `null` if not present in this measurement. */
  energyExpended: number | null;
  /** RR-interval values in seconds (1/1024 s resolution). Empty array if not present in this measurement. */
  rrIntervals: number[];
}

/**
 * BLE Heart Rate Service profile (UUID 0x180D).
 *
 * Provides access to heart rate measurements, body sensor location,
 * and the energy-expended reset control point as defined by the
 * Bluetooth SIG Heart Rate Service specification.
 *
 * The measurement characteristic (0x2A37) uses a flags byte:
 * bit 0 = HR format (0 = UINT8, 1 = UINT16), bits 1-2 = sensor contact,
 * bit 3 = energy expended present, bit 4 = RR-interval present.
 *
 * @example
 * ```ts
 * import { HeartRateProfile } from '@beacio/profiles';
 *
 * const hr = new HeartRateProfile(device);
 * await hr.connect();
 *
 * // Subscribe to real-time heart rate data
 * const unsubscribe = hr.onHeartRate((data) => {
 *   console.log(`BPM: ${data.bpm}`);
 *   if (data.contact === false) {
 *     console.warn('No skin contact detected');
 *   }
 *   if (data.rrIntervals.length > 0) {
 *     console.log('RR intervals (s):', data.rrIntervals);
 *   }
 * });
 *
 * // Read sensor location (e.g. 1 = Chest, 2 = Wrist)
 * const location = await hr.readSensorLocation();
 *
 * // Clean up
 * unsubscribe();
 * hr.stop();
 * ```
 */
export class HeartRateProfile extends BaseProfile {
  /** Services this profile's device may reach after connection (Heart Rate, 0x180D). Read by {@link deriveOptionalServices}. */
  static readonly services = HEART_RATE_SERVICES;

  protected readonly service = 'heart_rate';

  /** Subscribe to heart rate measurements. Returns unsubscribe function. */
  onHeartRate(callback: (data: HeartRateData) => void): () => void {
    return this.subscribe('heart_rate_measurement', (dv) => {
      callback(parseHeartRate(dv));
    });
  }

  /** Read body sensor location (0=Other, 1=Chest, 2=Wrist, ...) */
  async readSensorLocation(): Promise<number> {
    const dv = await this.read('body_sensor_location');
    return readUint8(dv);
  }

  /** Reset energy expended counter */
  async resetEnergyExpended(): Promise<void> {
    await this.write('heart_rate_control_point', new Uint8Array([1]));
  }
}

/**
 * Parse a raw Heart Rate Measurement characteristic value (UUID 0x2A37)
 * into a structured {@link HeartRateData} object.
 *
 * The first byte is a flags field that determines the format and which
 * optional fields are present. This function handles all flag combinations
 * defined by the Bluetooth SIG specification.
 *
 * @param dv - Raw characteristic value as a {@link DataView}.
 * @returns Parsed heart rate data with BPM, contact status, energy, and RR intervals.
 *
 * @example
 * ```ts
 * import { parseHeartRate } from '@beacio/profiles';
 *
 * // Manually parse a DataView from a notification
 * const data = parseHeartRate(characteristicValue);
 * console.log(`Heart rate: ${data.bpm} BPM`);
 * ```
 */
export function parseHeartRate(dv: DataView): HeartRateData {
  const flags = readUint8(dv, 0);
  let offset = 1;

  // Bit 0: Heart Rate Format — 0=UINT8, 1=UINT16
  const is16bit = (flags & 0x01) !== 0;
  const bpm = is16bit ? readUint16LE(dv, offset) : readUint8(dv, offset);
  offset += is16bit ? 2 : 1;

  // Bits 1-2: Sensor Contact
  const contactSupported = (flags & 0x04) !== 0;
  const contact = contactSupported ? (flags & 0x02) !== 0 : null;

  // Bit 3: Energy Expended present
  let energyExpended: number | null = null;
  if (flags & 0x08) {
    energyExpended = readUint16LE(dv, offset);
    offset += 2;
  }

  // Bit 4: RR-Interval present
  const rrIntervals: number[] = [];
  if (flags & 0x10) {
    // Consume only complete 2-byte RR pairs; a stray trailing byte (malformed
    // frame) is dropped rather than triggering an out-of-bounds read.
    while (offset + 2 <= dv.byteLength) {
      // RR intervals are in 1/1024 seconds units, convert to seconds
      rrIntervals.push(readUint16LE(dv, offset) / 1024);
      offset += 2;
    }
  }

  return { bpm, contact, energyExpended, rrIntervals };
}

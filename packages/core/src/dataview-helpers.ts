/**
 * Ergonomic helpers for reading typed values from `DataView` objects returned
 * by `device.read()` and notification callbacks.
 *
 * BLE characteristics return raw bytes as `DataView`. These helpers eliminate
 * boilerplate for common numeric and string decodings. All functions default
 * to offset 0 for the common case of reading the first value.
 *
 * @example
 * ```typescript
 * import { readUint8, readUint16LE, readUtf8 } from '@beacio/core'
 *
 * const battery = await device.read('battery_service', 'battery_level')
 * const level = readUint8(battery) // 0-100
 *
 * const name = await device.read('generic_access', 'gap.device_name')
 * console.log(readUtf8(name)) // "My Device"
 * ```
 *
 * @see {@link BeacioDevice.read} for reading characteristic values
 */
import { BeacioError } from './errors';

/**
 * Validate that `size` bytes can be read from `dv` starting at `offset`.
 *
 * BLE peripherals (or a torn notification frame) can deliver a payload that is
 * shorter than the width a decoder expects. A bare `DataView.getX()` would throw
 * a raw `RangeError` ("Offset is outside the bounds of the DataView") in that
 * case, which callers cannot distinguish from a programming bug. This converts
 * that into a typed {@link BeacioError} (`INVALID_PARAMETER`) so it can be
 * caught and handled programmatically.
 *
 * @param reader - Name of the calling reader, for a descriptive message.
 * @param dv - Source DataView.
 * @param offset - Requested byte offset.
 * @param size - Number of bytes the reader will consume.
 * @throws {BeacioError} INVALID_PARAMETER if the offset is invalid or the read
 *   would run past the end of the DataView.
 */
function assertReadable(reader: string, dv: DataView, offset: number, size: number): void {
  if (!Number.isInteger(offset) || offset < 0 || offset + size > dv.byteLength) {
    throw new BeacioError(
      'INVALID_PARAMETER',
      `${reader}: cannot read ${size} byte${size === 1 ? '' : 's'} at offset ${offset} of a ${dv.byteLength}-byte DataView (value too short).`,
    );
  }
}

/**
 * Read an unsigned 8-bit integer from the DataView.
 *
 * @param dv - Source DataView from a characteristic read or notification.
 * @param offset - Byte offset to read from. Defaults to 0.
 * @returns Unsigned integer in range [0, 255].
 * @throws {BeacioError} INVALID_PARAMETER if the DataView is too short for the read.
 */
export function readUint8(dv: DataView, offset = 0): number {
  assertReadable('readUint8', dv, offset, 1);
  return dv.getUint8(offset);
}

/**
 * Read an unsigned 16-bit little-endian integer from the DataView.
 * Little-endian is the standard byte order for most BLE characteristics.
 *
 * @param dv - Source DataView.
 * @param offset - Byte offset to read from. Defaults to 0.
 * @returns Unsigned integer in range [0, 65535].
 * @throws {BeacioError} INVALID_PARAMETER if the DataView is too short for the read.
 */
export function readUint16LE(dv: DataView, offset = 0): number {
  assertReadable('readUint16LE', dv, offset, 2);
  return dv.getUint16(offset, true);
}

/**
 * Read an unsigned 16-bit big-endian integer from the DataView.
 *
 * @param dv - Source DataView.
 * @param offset - Byte offset to read from. Defaults to 0.
 * @returns Unsigned integer in range [0, 65535].
 * @throws {BeacioError} INVALID_PARAMETER if the DataView is too short for the read.
 */
export function readUint16BE(dv: DataView, offset = 0): number {
  assertReadable('readUint16BE', dv, offset, 2);
  return dv.getUint16(offset, false);
}

/**
 * Read a signed 16-bit little-endian integer from the DataView.
 * Common for temperature and other signed sensor values in BLE.
 *
 * @param dv - Source DataView.
 * @param offset - Byte offset to read from. Defaults to 0.
 * @returns Signed integer in range [-32768, 32767].
 * @throws {BeacioError} INVALID_PARAMETER if the DataView is too short for the read.
 */
export function readInt16LE(dv: DataView, offset = 0): number {
  assertReadable('readInt16LE', dv, offset, 2);
  return dv.getInt16(offset, true);
}

/**
 * Read an unsigned 32-bit little-endian integer from the DataView.
 *
 * @param dv - Source DataView.
 * @param offset - Byte offset to read from. Defaults to 0.
 * @returns Unsigned integer in range [0, 4294967295].
 * @throws {BeacioError} INVALID_PARAMETER if the DataView is too short for the read.
 */
export function readUint32LE(dv: DataView, offset = 0): number {
  assertReadable('readUint32LE', dv, offset, 4);
  return dv.getUint32(offset, true);
}

/**
 * Read a 32-bit little-endian IEEE 754 float from the DataView.
 *
 * @param dv - Source DataView.
 * @param offset - Byte offset to read from. Defaults to 0.
 * @returns 32-bit floating point number.
 * @throws {BeacioError} INVALID_PARAMETER if the DataView is too short for the read.
 */
export function readFloat32LE(dv: DataView, offset = 0): number {
  assertReadable('readFloat32LE', dv, offset, 4);
  return dv.getFloat32(offset, true);
}

/**
 * Decode the entire DataView contents as a UTF-8 string.
 * Useful for device name, serial number, and other string characteristics.
 *
 * @param dv - Source DataView.
 * @returns Decoded UTF-8 string.
 *
 * @example
 * ```typescript
 * const name = await device.read('generic_access', 'gap.device_name')
 * console.log(readUtf8(name)) // "Polar H10"
 * ```
 */
export function readUtf8(dv: DataView): string {
  return new TextDecoder().decode(dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength));
}

/**
 * Copy the DataView contents into a new `Uint8Array`.
 * Useful when you need to store, compare, or forward raw bytes.
 *
 * @param dv - Source DataView.
 * @returns New Uint8Array containing a copy of the DataView bytes.
 */
export function readBytes(dv: DataView): Uint8Array {
  return new Uint8Array(dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength));
}

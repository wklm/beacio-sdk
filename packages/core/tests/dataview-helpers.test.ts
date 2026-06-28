import { describe, expect, it } from '@jest/globals';
import {
  readUint8,
  readUint16LE,
  readUint16BE,
  readInt16LE,
  readUint32LE,
  readFloat32LE,
  readUtf8,
  readBytes,
} from '../src/dataview-helpers';
import { BeacioError } from '../src/errors';

function makeDataView(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

describe('readUint8', () => {
  it('reads value at default offset 0', () => {
    expect(readUint8(makeDataView([42]))).toBe(42);
  });

  it('reads value at explicit offset', () => {
    expect(readUint8(makeDataView([10, 20, 30]), 2)).toBe(30);
  });

  it('reads minimum value 0', () => {
    expect(readUint8(makeDataView([0]))).toBe(0);
  });

  it('reads maximum value 255', () => {
    expect(readUint8(makeDataView([255]))).toBe(255);
  });
});

describe('readUint16LE', () => {
  it('reads little-endian 16-bit value', () => {
    // 0x0100 LE = 256
    expect(readUint16LE(makeDataView([0x00, 0x01]))).toBe(256);
  });

  it('reads at explicit offset', () => {
    expect(readUint16LE(makeDataView([0xFF, 0x34, 0x12]), 1)).toBe(0x1234);
  });

  it('reads zero', () => {
    expect(readUint16LE(makeDataView([0x00, 0x00]))).toBe(0);
  });

  it('reads maximum value 65535', () => {
    expect(readUint16LE(makeDataView([0xFF, 0xFF]))).toBe(65535);
  });
});

describe('readUint16BE', () => {
  it('reads big-endian 16-bit value', () => {
    // 0x0100 BE = 256
    expect(readUint16BE(makeDataView([0x01, 0x00]))).toBe(256);
  });

  it('reads at explicit offset', () => {
    expect(readUint16BE(makeDataView([0xFF, 0x12, 0x34]), 1)).toBe(0x1234);
  });

  it('distinguishes from little-endian', () => {
    const dv = makeDataView([0x01, 0x02]);
    expect(readUint16BE(dv)).toBe(0x0102);
    expect(readUint16LE(dv)).toBe(0x0201);
  });
});

describe('readInt16LE', () => {
  it('reads positive signed value', () => {
    expect(readInt16LE(makeDataView([0x01, 0x00]))).toBe(1);
  });

  it('reads negative signed value', () => {
    // -1 in 16-bit signed LE = [0xFF, 0xFF]
    expect(readInt16LE(makeDataView([0xFF, 0xFF]))).toBe(-1);
  });

  it('reads minimum signed value -32768', () => {
    // -32768 = 0x8000 LE = [0x00, 0x80]
    expect(readInt16LE(makeDataView([0x00, 0x80]))).toBe(-32768);
  });

  it('reads maximum signed value 32767', () => {
    // 32767 = 0x7FFF LE = [0xFF, 0x7F]
    expect(readInt16LE(makeDataView([0xFF, 0x7F]))).toBe(32767);
  });

  it('reads at explicit offset', () => {
    expect(readInt16LE(makeDataView([0x00, 0xFE, 0xFF]), 1)).toBe(-2);
  });
});

describe('readUint32LE', () => {
  it('reads 32-bit little-endian value', () => {
    // 1 as LE uint32 = [0x01, 0x00, 0x00, 0x00]
    expect(readUint32LE(makeDataView([0x01, 0x00, 0x00, 0x00]))).toBe(1);
  });

  it('reads large value', () => {
    // 0xDEADBEEF LE = [0xEF, 0xBE, 0xAD, 0xDE]
    expect(readUint32LE(makeDataView([0xEF, 0xBE, 0xAD, 0xDE]))).toBe(0xDEADBEEF);
  });

  it('reads maximum uint32 value', () => {
    expect(readUint32LE(makeDataView([0xFF, 0xFF, 0xFF, 0xFF]))).toBe(4294967295);
  });

  it('reads at explicit offset', () => {
    expect(readUint32LE(makeDataView([0x00, 0x78, 0x56, 0x34, 0x12]), 1)).toBe(0x12345678);
  });
});

describe('readFloat32LE', () => {
  it('reads float value 1.0', () => {
    // IEEE 754: 1.0 = 0x3F800000 LE = [0x00, 0x00, 0x80, 0x3F]
    expect(readFloat32LE(makeDataView([0x00, 0x00, 0x80, 0x3F]))).toBeCloseTo(1.0);
  });

  it('reads negative float', () => {
    // -1.0 = 0xBF800000 LE = [0x00, 0x00, 0x80, 0xBF]
    expect(readFloat32LE(makeDataView([0x00, 0x00, 0x80, 0xBF]))).toBeCloseTo(-1.0);
  });

  it('reads zero', () => {
    expect(readFloat32LE(makeDataView([0x00, 0x00, 0x00, 0x00]))).toBe(0);
  });

  it('reads at explicit offset', () => {
    // offset 1, value = 1.0
    const result = readFloat32LE(makeDataView([0xFF, 0x00, 0x00, 0x80, 0x3F]), 1);
    expect(result).toBeCloseTo(1.0);
  });
});

describe('readUtf8', () => {
  it('decodes ASCII string', () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('Hello');
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(readUtf8(dv)).toBe('Hello');
  });

  it('decodes multibyte UTF-8 characters', () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('Polar H10');
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(readUtf8(dv)).toBe('Polar H10');
  });

  it('decodes empty DataView to empty string', () => {
    const dv = new DataView(new ArrayBuffer(0));
    expect(readUtf8(dv)).toBe('');
  });

  it('correctly handles DataView with non-zero byteOffset', () => {
    const backing = new Uint8Array([0, 0, 0x48, 0x69, 0, 0]); // "Hi" at offset 2
    const dv = new DataView(backing.buffer, 2, 2);
    expect(readUtf8(dv)).toBe('Hi');
  });
});

describe('readBytes', () => {
  it('copies bytes into a new Uint8Array', () => {
    const dv = makeDataView([1, 2, 3]);
    const result = readBytes(dv);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([1, 2, 3]);
  });

  it('returns an independent copy', () => {
    const original = new Uint8Array([10, 20, 30]);
    const dv = new DataView(original.buffer);
    const copy = readBytes(dv);
    copy[0] = 99;
    expect(original[0]).toBe(10);
  });

  it('handles empty DataView', () => {
    const dv = new DataView(new ArrayBuffer(0));
    const result = readBytes(dv);
    expect(result.length).toBe(0);
  });

  it('handles DataView with non-zero byteOffset', () => {
    const backing = new Uint8Array([0, 0, 5, 6, 7, 0]);
    const dv = new DataView(backing.buffer, 2, 3);
    const result = readBytes(dv);
    expect(Array.from(result)).toEqual([5, 6, 7]);
  });
});

describe('bounds checking — typed BeacioError, not raw RangeError', () => {
  // A short/torn BLE payload must surface a TYPED domain error so callers can
  // catch it programmatically, NOT leak a raw DataView RangeError ("Offset is
  // outside the bounds of the DataView").

  it('readUint8 throws a typed BeacioError on an empty DataView', () => {
    let thrown: unknown;
    try {
      readUint8(makeDataView([]));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BeacioError);
    expect(thrown).not.toBeInstanceOf(RangeError);
    expect((thrown as BeacioError).code).toBe('INVALID_PARAMETER');
  });

  it('readUint16LE throws a typed BeacioError on a 1-byte DataView (truncated uint16)', () => {
    let thrown: unknown;
    try {
      readUint16LE(makeDataView([0x1e]));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BeacioError);
    expect((thrown as BeacioError).code).toBe('INVALID_PARAMETER');
    expect((thrown as Error).message).toMatch(/readUint16LE/);
    expect((thrown as Error).message).toMatch(/1-byte DataView/);
  });

  it('readUint16BE throws a typed BeacioError on a 1-byte DataView', () => {
    expect(() => readUint16BE(makeDataView([0x00]))).toThrow(BeacioError);
  });

  it('readInt16LE throws a typed BeacioError on a 1-byte DataView', () => {
    expect(() => readInt16LE(makeDataView([0x00]))).toThrow(BeacioError);
  });

  it('readUint32LE throws a typed BeacioError on a 3-byte DataView', () => {
    expect(() => readUint32LE(makeDataView([0, 0, 0]))).toThrow(BeacioError);
  });

  it('readFloat32LE throws a typed BeacioError on a 3-byte DataView', () => {
    expect(() => readFloat32LE(makeDataView([0, 0, 0]))).toThrow(BeacioError);
  });

  it('throws when an explicit offset runs past the end of the DataView', () => {
    // 2-byte view, but reading a uint16 at offset 1 needs bytes [1,2] -> out of bounds
    let thrown: unknown;
    try {
      readUint16LE(makeDataView([0x01, 0x02]), 1);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BeacioError);
    expect((thrown as BeacioError).code).toBe('INVALID_PARAMETER');
  });

  it('throws on a negative offset', () => {
    expect(() => readUint8(makeDataView([1, 2, 3]), -1)).toThrow(BeacioError);
  });

  it('throws on a non-integer offset', () => {
    expect(() => readUint8(makeDataView([1, 2, 3]), 1.5)).toThrow(BeacioError);
  });

  it('still reads valid in-bounds values at an explicit offset (guard does not break the happy path)', () => {
    expect(readUint16LE(makeDataView([0xff, 0x34, 0x12]), 1)).toBe(0x1234);
    expect(readUint8(makeDataView([10, 20, 30]), 2)).toBe(30);
  });
});

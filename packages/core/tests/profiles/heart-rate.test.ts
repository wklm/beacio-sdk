import { describe, expect, it } from '@jest/globals';
import { parseHeartRate } from '../../src/profiles/heart-rate';

function makeDataView(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

describe('parseHeartRate', () => {
  it('parses 8-bit heart rate', () => {
    // flags=0x00 (8-bit, no contact, no energy, no RR)
    const result = parseHeartRate(makeDataView([0x00, 72]));
    expect(result.bpm).toBe(72);
    expect(result.contact).toBeNull();
    expect(result.energyExpended).toBeNull();
    expect(result.rrIntervals).toEqual([]);
  });

  it('parses 16-bit heart rate', () => {
    // flags=0x01 (16-bit), HR = 256 (0x00, 0x01 little-endian)
    const result = parseHeartRate(makeDataView([0x01, 0x00, 0x01]));
    expect(result.bpm).toBe(256);
  });

  it('parses contact detected', () => {
    // flags=0x06: bits 1+2 set → contact supported + detected, 8-bit HR
    const result = parseHeartRate(makeDataView([0x06, 80]));
    expect(result.contact).toBe(true);
  });

  it('parses contact not detected', () => {
    // flags=0x04: bit 2 set (supported) but bit 1 clear → not detected
    const result = parseHeartRate(makeDataView([0x04, 80]));
    expect(result.contact).toBe(false);
  });

  it('parses energy expended', () => {
    // flags=0x08: energy present, 8-bit HR
    // HR=60, energy=100 (0x64, 0x00 little-endian)
    const result = parseHeartRate(makeDataView([0x08, 60, 0x64, 0x00]));
    expect(result.energyExpended).toBe(100);
  });

  it('parses RR intervals', () => {
    // flags=0x10: RR present, 8-bit HR
    // HR=70, RR=1024 (=1.0 sec, encoded as 0x00 0x04 little-endian)
    const result = parseHeartRate(makeDataView([0x10, 70, 0x00, 0x04]));
    expect(result.rrIntervals).toHaveLength(1);
    expect(result.rrIntervals[0]).toBeCloseTo(1.0);
  });

  it('parses multiple RR intervals', () => {
    // flags=0x10, HR=70, two RR values: 1024 and 512
    const result = parseHeartRate(
      makeDataView([0x10, 70, 0x00, 0x04, 0x00, 0x02]),
    );
    expect(result.rrIntervals).toHaveLength(2);
    expect(result.rrIntervals[0]).toBeCloseTo(1.0);
    expect(result.rrIntervals[1]).toBeCloseTo(0.5);
  });

  it('parses combined flags', () => {
    // flags=0x1E: 8-bit HR + contact supported+detected + energy + RR
    // HR=80, energy=50 (0x32 0x00), RR=512 (0x00 0x02)
    const result = parseHeartRate(
      makeDataView([0x1E, 80, 0x32, 0x00, 0x00, 0x02]),
    );
    expect(result.bpm).toBe(80);
    expect(result.contact).toBe(true);
    expect(result.energyExpended).toBe(50);
    expect(result.rrIntervals).toHaveLength(1);
    expect(result.rrIntervals[0]).toBeCloseTo(0.5);
  });

  it('throws on empty (0-length) buffer', () => {
    // DataView with 0 bytes -- getUint8(0) should throw
    expect(() => parseHeartRate(makeDataView([]))).toThrow();
  });

  it('throws on 1-byte buffer (flags only, no heart rate value)', () => {
    // Only the flags byte, no HR value byte
    expect(() => parseHeartRate(makeDataView([0x00]))).toThrow();
  });

  it('throws on truncated 16-bit heart rate (flags say 16-bit but only 1 HR byte present)', () => {
    // flags=0x01 (16-bit HR), but only 1 byte of HR data
    expect(() => parseHeartRate(makeDataView([0x01, 0x48]))).toThrow();
  });

  it('parses 8-bit heart rate of 0 BPM', () => {
    const result = parseHeartRate(makeDataView([0x00, 0]));
    expect(result.bpm).toBe(0);
  });

  it('parses 8-bit heart rate at max value (255)', () => {
    const result = parseHeartRate(makeDataView([0x00, 255]));
    expect(result.bpm).toBe(255);
  });

  it('parses 16-bit heart rate at max value (65535)', () => {
    // flags=0x01 (16-bit), HR = 0xFFFF = 65535 (little-endian)
    const result = parseHeartRate(makeDataView([0x01, 0xFF, 0xFF]));
    expect(result.bpm).toBe(65535);
  });

  it('parses 16-bit heart rate with value fitting in 8 bits', () => {
    // flags=0x01 (16-bit), HR = 72 (0x48, 0x00 little-endian)
    const result = parseHeartRate(makeDataView([0x01, 0x48, 0x00]));
    expect(result.bpm).toBe(72);
  });

  it('parses energy expended with large value', () => {
    // flags=0x08 (energy present), 8-bit HR=60, energy=65535 (0xFF, 0xFF)
    const result = parseHeartRate(makeDataView([0x08, 60, 0xFF, 0xFF]));
    expect(result.energyExpended).toBe(65535);
  });

  it('parses energy expended of zero', () => {
    // flags=0x08 (energy present), 8-bit HR=60, energy=0
    const result = parseHeartRate(makeDataView([0x08, 60, 0x00, 0x00]));
    expect(result.energyExpended).toBe(0);
  });

  it('returns null for contact when sensor contact is not supported', () => {
    // flags=0x00: no contact bits set
    const result = parseHeartRate(makeDataView([0x00, 70]));
    expect(result.contact).toBeNull();
  });

  it('returns null for contact when only bit 1 is set (no support bit)', () => {
    // flags=0x02: bit 1 set but bit 2 (support) not set
    const result = parseHeartRate(makeDataView([0x02, 70]));
    expect(result.contact).toBeNull();
  });

  it('handles RR interval of zero', () => {
    // flags=0x10 (RR present), HR=70, RR=0 (0x00, 0x00)
    const result = parseHeartRate(makeDataView([0x10, 70, 0x00, 0x00]));
    expect(result.rrIntervals).toHaveLength(1);
    expect(result.rrIntervals[0]).toBe(0);
  });

  it('handles maximum RR interval value (65535/1024 seconds)', () => {
    // flags=0x10 (RR present), HR=70, RR=65535 (0xFF, 0xFF)
    const result = parseHeartRate(makeDataView([0x10, 70, 0xFF, 0xFF]));
    expect(result.rrIntervals).toHaveLength(1);
    expect(result.rrIntervals[0]).toBeCloseTo(65535 / 1024);
  });

  it('ignores trailing odd byte when RR flag is set', () => {
    // flags=0x10 (RR present), HR=70, one full RR (0x00 0x04=1024), plus a stray byte
    // The while loop condition `offset + 1 < dv.byteLength` should skip the lone trailing byte
    const result = parseHeartRate(makeDataView([0x10, 70, 0x00, 0x04, 0xFF]));
    expect(result.rrIntervals).toHaveLength(1);
    expect(result.rrIntervals[0]).toBeCloseTo(1.0);
  });

  it('parses three RR intervals', () => {
    // flags=0x10, HR=70, three RR values: 1024, 512, 768
    const result = parseHeartRate(
      makeDataView([0x10, 70, 0x00, 0x04, 0x00, 0x02, 0x00, 0x03]),
    );
    expect(result.rrIntervals).toHaveLength(3);
    expect(result.rrIntervals[0]).toBeCloseTo(1024 / 1024);
    expect(result.rrIntervals[1]).toBeCloseTo(512 / 1024);
    expect(result.rrIntervals[2]).toBeCloseTo(768 / 1024);
  });

  it('returns empty RR array when RR flag is not set', () => {
    // flags=0x00, no RR
    const result = parseHeartRate(makeDataView([0x00, 80]));
    expect(result.rrIntervals).toEqual([]);
  });

  it('parses 16-bit HR with energy and RR combined', () => {
    // flags=0x19: bit0 (16-bit) + bit3 (energy) + bit4 (RR)
    // HR=300 (0x2C, 0x01 LE), energy=200 (0xC8, 0x00 LE), RR=2048 (0x00, 0x08 LE)
    const result = parseHeartRate(
      makeDataView([0x19, 0x2C, 0x01, 0xC8, 0x00, 0x00, 0x08]),
    );
    expect(result.bpm).toBe(300);
    expect(result.energyExpended).toBe(200);
    expect(result.rrIntervals).toHaveLength(1);
    expect(result.rrIntervals[0]).toBeCloseTo(2048 / 1024);
  });

  it('parses all flags set: 16-bit HR + contact + energy + RR', () => {
    // flags=0x1F: all relevant bits set (16-bit HR, contact supported+detected, energy, RR)
    // HR=500 (0xF4, 0x01 LE), energy=1000 (0xE8, 0x03 LE), RR=1024 (0x00, 0x04 LE)
    const result = parseHeartRate(
      makeDataView([0x1F, 0xF4, 0x01, 0xE8, 0x03, 0x00, 0x04]),
    );
    expect(result.bpm).toBe(500);
    expect(result.contact).toBe(true);
    expect(result.energyExpended).toBe(1000);
    expect(result.rrIntervals).toHaveLength(1);
    expect(result.rrIntervals[0]).toBeCloseTo(1.0);
  });

  it('truncated energy field throws (energy flag set but insufficient bytes)', () => {
    // flags=0x08 (energy present), HR=60, but only 1 byte for energy instead of 2
    expect(() => parseHeartRate(makeDataView([0x08, 60, 0x64]))).toThrow();
  });
});

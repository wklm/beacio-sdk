import { describe, expect, it, jest } from '@jest/globals';
import {
  StorzBickelProfile,
  decodeTemperatureDeciCelsius,
  encodeTemperatureDeciCelsius,
  decodeBatteryPercent,
  STORZ_BICKEL_SERVICE,
  STORZ_BICKEL_CHARACTERISTICS,
  STORZ_BICKEL_SERVICES,
  STORZ_BICKEL_FAMILY_SERVICES,
  StorzBickel,
} from '../src/storz-bickel';
import {
  deriveOptionalServices,
  NUS_SERVICES,
  HEART_RATE_SERVICES,
  NordicUARTProfile,
  HeartRateProfile,
  StorzBickel as StorzBickelFromIndex,
  STORZ_BICKEL_SERVICES as STORZ_BICKEL_SERVICES_FROM_INDEX,
} from '../src';
import { BeacioError, type BeacioDevice } from '@beacio/core';

// --- Crafty/Mighty (Family A) GATT, byte-reversed 'STORZ&BICKEL' base. ---
const SERVICE = '00000001-4c45-4b43-4942-265a524f5453';
const CURRENT_TEMP = '00000011-4c45-4b43-4942-265a524f5453'; // read/notify, degC x10 LE
const TARGET_TEMP = '00000021-4c45-4b43-4942-265a524f5453'; // read/write, degC x10 LE
const BOOST_TEMP = '00000031-4c45-4b43-4942-265a524f5453'; // read/write, degC x10 LE
const BATTERY = '00000041-4c45-4b43-4942-265a524f5453'; // read/notify, uint16 percent

// Handles a W3C-pure profile must NEVER touch directly. The native layer owns
// notification enablement (startNotifications() covers CCCD 0x2902 notify and
// SCCD 0x2903 indicate); this profile must never write those descriptors.
const FORBIDDEN_HANDLES = ['0x2902', '2902', '0x2903', '2903'];

function makeDataView(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

/** uint16 little-endian byte pair for a raw register value. */
function le16(value: number): [number, number] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function createMockDevice(readResult: DataView = makeDataView([0, 0])): BeacioDevice {
  // NOTE: jest is imported from '@jest/globals' (per the repo typecheck gotcha),
  // whose strictly-typed jest.fn() infers its return type from the supplied
  // implementation. Chaining .mockResolvedValue() on a bare jest.fn() collapses
  // to `never`, so we provide the async implementation inline instead.
  return {
    connect: jest.fn(async () => undefined),
    read: jest.fn(async () => readResult),
    write: jest.fn(async () => undefined),
    writeWithoutResponse: jest.fn(async () => undefined),
    subscribe: jest.fn(() => jest.fn()),
    onCharacteristicOverflow: jest.fn(() => jest.fn()),
    getWriteLimits: jest.fn(async () => ({ withResponse: 512, withoutResponse: 512, mtu: 247 })),
    getMtu: jest.fn(async () => 247),
  } as unknown as BeacioDevice;
}

/** Collect every (service, characteristic) pair passed to any write/subscribe call. */
function collectHandleCalls(device: BeacioDevice): Array<[string, string]> {
  const calls: Array<[string, string]> = [];
  for (const fn of [device.write, device.writeWithoutResponse, device.subscribe]) {
    for (const call of (fn as jest.Mock).mock.calls) {
      calls.push([call[0] as string, call[1] as string]);
    }
  }
  return calls;
}

describe('Storz & Bickel UUID constants', () => {
  it('exposes the Crafty/Mighty primary data service as the canonical service', () => {
    expect(STORZ_BICKEL_SERVICE).toBe(SERVICE);
  });

  it('pins the HIGH-confidence characteristic UUIDs (regression guard against silent edits)', () => {
    expect(STORZ_BICKEL_CHARACTERISTICS.currentTemperature).toBe(CURRENT_TEMP);
    expect(STORZ_BICKEL_CHARACTERISTICS.targetTemperature).toBe(TARGET_TEMP);
    expect(STORZ_BICKEL_CHARACTERISTICS.boostTemperature).toBe(BOOST_TEMP);
    expect(STORZ_BICKEL_CHARACTERISTICS.batteryLevel).toBe(BATTERY);
  });
});

describe('decodeTemperatureDeciCelsius', () => {
  it('decodes the documented 182.2 C setpoint (raw 1822, LE)', () => {
    // 1822 = 0x071E -> LE bytes [0x1E, 0x07]
    expect(decodeTemperatureDeciCelsius(makeDataView([0x1e, 0x07]))).toBeCloseTo(182.2);
  });

  it('decodes a whole-degree value (200.0 C, raw 2000)', () => {
    expect(decodeTemperatureDeciCelsius(makeDataView(le16(2000)))).toBeCloseTo(200.0);
  });

  it('decodes zero', () => {
    expect(decodeTemperatureDeciCelsius(makeDataView([0x00, 0x00]))).toBe(0);
  });

  it('decodes a low setpoint (40.0 C, raw 400)', () => {
    expect(decodeTemperatureDeciCelsius(makeDataView(le16(400)))).toBeCloseTo(40.0);
  });

  it('is little-endian (does not byte-swap)', () => {
    // raw 0x0102 = 258 -> 25.8 C; big-endian misread would be 0x0201 = 513 -> 51.3
    expect(decodeTemperatureDeciCelsius(makeDataView([0x02, 0x01]))).toBeCloseTo(25.8);
  });
});

describe('decodeTemperatureDeciCelsius — short-payload guard (regression)', () => {
  // A temperature characteristic value is a 2-byte LE uint16. A malfunctioning
  // peripheral (or a torn notification frame) can deliver an empty or 1-byte
  // payload. The decoder must reject it with a TYPED domain error (BeacioError /
  // INVALID_PARAMETER, message saying the value is "too short") so callers can
  // catch it programmatically — NOT leak a raw DataView RangeError ("Offset is
  // outside the bounds of the DataView") from getUint16().

  it('throws a typed BeacioError (not a raw RangeError) on an empty (0-byte) DataView', () => {
    let thrown: unknown;
    try {
      decodeTemperatureDeciCelsius(makeDataView([]));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BeacioError);
    expect(thrown).not.toBeInstanceOf(RangeError);
    expect((thrown as BeacioError).code).toBe('INVALID_PARAMETER');
    expect((thrown as Error).message).toMatch(/too short/i);
  });

  it('throws a typed BeacioError on a 1-byte DataView (truncated uint16)', () => {
    let thrown: unknown;
    try {
      decodeTemperatureDeciCelsius(makeDataView([0x1e]));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BeacioError);
    expect((thrown as BeacioError).code).toBe('INVALID_PARAMETER');
    expect((thrown as Error).message).toMatch(/too short/i);
  });

  it('still decodes a valid 2-byte payload (guard does not break the happy path)', () => {
    // 1822 = 0x071E -> LE [0x1E, 0x07] -> 182.2 C
    expect(decodeTemperatureDeciCelsius(makeDataView([0x1e, 0x07]))).toBeCloseTo(182.2);
  });
});

describe('StorzBickelProfile temperature — short-payload guard (read + notify seams)', () => {
  it('currentTemperature() surfaces a typed BeacioError on a 1-byte read (not a raw RangeError)', async () => {
    const device = createMockDevice(makeDataView([0x1e])); // truncated: 1 byte
    const sb = new StorzBickelProfile(device);
    await expect(sb.currentTemperature()).rejects.toBeInstanceOf(BeacioError);
    await expect(sb.currentTemperature()).rejects.toMatchObject({ code: 'INVALID_PARAMETER' });
    await expect(sb.currentTemperature()).rejects.toThrow(/too short/i);
  });

  it('targetTemperature() surfaces a typed BeacioError on an empty (0-byte) read', async () => {
    const device = createMockDevice(makeDataView([])); // empty payload
    const sb = new StorzBickelProfile(device);
    await expect(sb.targetTemperature()).rejects.toBeInstanceOf(BeacioError);
    await expect(sb.targetTemperature()).rejects.toMatchObject({ code: 'INVALID_PARAMETER' });
  });

  it('boost() surfaces a typed BeacioError on a 1-byte read', async () => {
    const device = createMockDevice(makeDataView([0x96])); // truncated: 1 byte
    const sb = new StorzBickelProfile(device);
    await expect(sb.boost()).rejects.toBeInstanceOf(BeacioError);
    await expect(sb.boost()).rejects.toMatchObject({ code: 'INVALID_PARAMETER' });
  });

  it('still resolves a valid 2-byte currentTemperature read (control)', async () => {
    const device = createMockDevice(makeDataView([0x1e, 0x07])); // 1822 -> 182.2
    const sb = new StorzBickelProfile(device);
    await expect(sb.currentTemperature()).resolves.toBeCloseTo(182.2);
  });

  it('onCurrentTemperature notify path throws a typed BeacioError on a short pushed frame', () => {
    const device = createMockDevice();
    const sb = new StorzBickelProfile(device);
    sb.onCurrentTemperature(jest.fn());
    const cb = (device.subscribe as jest.Mock).mock.calls[0][2] as (dv: DataView) => void;

    let thrown: unknown;
    try {
      cb(makeDataView([0x1e])); // torn 1-byte notification
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BeacioError);
    expect(thrown).not.toBeInstanceOf(RangeError);
    expect((thrown as BeacioError).code).toBe('INVALID_PARAMETER');
  });
});

describe('encodeTemperatureDeciCelsius', () => {
  it('encodes 182.2 C to raw 1822 little-endian', () => {
    expect(Array.from(encodeTemperatureDeciCelsius(182.2))).toEqual([0x1e, 0x07]);
  });

  it('encodes 200 C to raw 2000 little-endian', () => {
    expect(Array.from(encodeTemperatureDeciCelsius(200))).toEqual(le16(2000));
  });

  it('rounds to the nearest 0.1 C (no truncation)', () => {
    // 180.25 -> 1802.5 -> rounds to 1803
    expect(Array.from(encodeTemperatureDeciCelsius(180.25))).toEqual(le16(1803));
  });

  it('round-trips through decode', () => {
    for (const c of [40, 100.5, 182.2, 210, 0]) {
      expect(decodeTemperatureDeciCelsius(makeDataView(Array.from(encodeTemperatureDeciCelsius(c))))).toBeCloseTo(c);
    }
  });

  it('produces exactly 2 bytes', () => {
    expect(encodeTemperatureDeciCelsius(182.2).byteLength).toBe(2);
  });
});

describe('decodeBatteryPercent', () => {
  it('decodes 80% (raw uint16 LE)', () => {
    expect(decodeBatteryPercent(makeDataView([0x50, 0x00]))).toBe(80);
  });

  it('decodes 100%', () => {
    expect(decodeBatteryPercent(makeDataView([0x64, 0x00]))).toBe(100);
  });

  it('decodes 0%', () => {
    expect(decodeBatteryPercent(makeDataView([0x00, 0x00]))).toBe(0);
  });
});

describe('decodeBatteryPercent — out-of-range guard (regression)', () => {
  // The battery characteristic is documented as a percentage in 0..100 where
  // only the LOW byte carries the value (high byte is spurious/padding). A
  // misbehaving peripheral can deliver a nonzero high byte (so the naive uint16
  // is > 100) or a low byte already above 100. The decoder MUST return a value
  // clamped into 0..100 so callers never see e.g. 356 or 200 percent battery.

  it('ignores a nonzero high byte (low byte = 100 -> 100, NOT uint16 356)', () => {
    // [0x64, 0x01] = uint16 356, low byte = 0x64 = 100
    expect(decodeBatteryPercent(makeDataView([0x64, 0x01]))).toBe(100);
  });

  it('clamps a low byte above 100 down to 100 (low byte = 200 -> 100)', () => {
    // [0xC8, 0x00] = uint16 200, low byte = 0xC8 = 200
    expect(decodeBatteryPercent(makeDataView([0xc8, 0x00]))).toBe(100);
  });

  it('still decodes a valid mid-range reading (low byte = 50 -> 50)', () => {
    // [0x32, 0x00] = uint16 50, low byte = 0x32 = 50
    expect(decodeBatteryPercent(makeDataView([0x32, 0x00]))).toBe(50);
  });

  it('never returns above 100 for the maximum uint16 (0xFFFF -> 100)', () => {
    expect(decodeBatteryPercent(makeDataView([0xff, 0xff]))).toBe(100);
  });

  it('throws a typed BeacioError (not a raw RangeError) on an empty (0-byte) DataView', () => {
    // Reading the documented low byte requires >=1 byte; a torn/empty frame
    // must surface INVALID_PARAMETER via the bounds-checked readUint8 reader,
    // not leak a raw DataView RangeError.
    let thrown: unknown;
    try {
      decodeBatteryPercent(makeDataView([]));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BeacioError);
    expect(thrown).not.toBeInstanceOf(RangeError);
    expect((thrown as BeacioError).code).toBe('INVALID_PARAMETER');
  });
});

describe('StorzBickelProfile battery — out-of-range guard (read + notify seams)', () => {
  it('batteryLevel() read seam clamps a high-byte-polluted reading to 0..100', async () => {
    // [0x64, 0x01] = uint16 356, low byte = 100 -> expect 100 (not 356)
    const device = createMockDevice(makeDataView([0x64, 0x01]));
    const sb = new StorzBickelProfile(device);
    const level = await sb.batteryLevel();
    expect(device.read).toHaveBeenCalledWith(SERVICE, BATTERY);
    expect(level).toBeLessThanOrEqual(100);
    expect(level).toBe(100);
  });

  it('batteryLevel() read seam clamps a low byte above 100 down to 100', async () => {
    // [0xC8, 0x00] = uint16 200 -> expect 100
    const device = createMockDevice(makeDataView([0xc8, 0x00]));
    const sb = new StorzBickelProfile(device);
    await expect(sb.batteryLevel()).resolves.toBe(100);
  });

  it('onBatteryLevel notify seam clamps a high-byte-polluted pushed frame to 0..100', () => {
    const device = createMockDevice();
    const sb = new StorzBickelProfile(device);
    const received: number[] = [];
    sb.onBatteryLevel((v) => received.push(v));
    const cb = (device.subscribe as jest.Mock).mock.calls[0][2] as (dv: DataView) => void;
    cb(makeDataView([0x64, 0x01])); // uint16 356, low byte 100 -> expect 100
    expect(received).toEqual([100]);
  });

  it('onBatteryLevel notify seam still decodes a valid mid-range pushed frame (50)', () => {
    const device = createMockDevice();
    const sb = new StorzBickelProfile(device);
    const received: number[] = [];
    sb.onBatteryLevel((v) => received.push(v));
    const cb = (device.subscribe as jest.Mock).mock.calls[0][2] as (dv: DataView) => void;
    cb(makeDataView([0x32, 0x00])); // uint16 50 -> 50
    expect(received).toEqual([50]);
  });
});

describe('StorzBickelProfile', () => {
  describe('connect', () => {
    it('delegates connect to the device', async () => {
      const device = createMockDevice();
      const sb = new StorzBickelProfile(device);
      await sb.connect();
      expect(device.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('currentTemperature', () => {
    it('reads + decodes the current temperature characteristic (0x...0011)', async () => {
      const device = createMockDevice(makeDataView([0x1e, 0x07])); // 1822 -> 182.2
      const sb = new StorzBickelProfile(device);
      const temp = await sb.currentTemperature();
      expect(device.read).toHaveBeenCalledWith(SERVICE, CURRENT_TEMP);
      expect(temp).toBeCloseTo(182.2);
    });
  });

  describe('targetTemperature / setTargetTemperature', () => {
    it('reads + decodes the setpoint characteristic (0x...0021)', async () => {
      const device = createMockDevice(makeDataView(le16(2000))); // 200.0
      const sb = new StorzBickelProfile(device);
      const temp = await sb.targetTemperature();
      expect(device.read).toHaveBeenCalledWith(SERVICE, TARGET_TEMP);
      expect(temp).toBeCloseTo(200.0);
    });

    it('encodes + writes the setpoint to the 0x...0021 characteristic', async () => {
      const device = createMockDevice();
      const sb = new StorzBickelProfile(device);
      await sb.setTargetTemperature(182.2);
      expect(device.write).toHaveBeenCalledTimes(1);
      const [service, characteristic, value] = (device.write as jest.Mock).mock.calls[0];
      expect(service).toBe(SERVICE);
      expect(characteristic).toBe(TARGET_TEMP);
      expect(Array.from(value as Uint8Array)).toEqual([0x1e, 0x07]);
    });
  });

  describe('boost / setBoost', () => {
    it('reads + decodes the boost-offset characteristic (0x...0031)', async () => {
      const device = createMockDevice(makeDataView(le16(150))); // +15.0 C
      const sb = new StorzBickelProfile(device);
      const boost = await sb.boost();
      expect(device.read).toHaveBeenCalledWith(SERVICE, BOOST_TEMP);
      expect(boost).toBeCloseTo(15.0);
    });

    it('encodes + writes the boost offset to the 0x...0031 characteristic', async () => {
      const device = createMockDevice();
      const sb = new StorzBickelProfile(device);
      await sb.setBoost(15);
      expect(device.write).toHaveBeenCalledTimes(1);
      const [service, characteristic, value] = (device.write as jest.Mock).mock.calls[0];
      expect(service).toBe(SERVICE);
      expect(characteristic).toBe(BOOST_TEMP);
      expect(Array.from(value as Uint8Array)).toEqual(le16(150));
    });
  });

  describe('batteryLevel / onBatteryLevel', () => {
    it('reads + decodes the battery characteristic (0x...0041)', async () => {
      const device = createMockDevice(makeDataView([0x50, 0x00])); // 80
      const sb = new StorzBickelProfile(device);
      const level = await sb.batteryLevel();
      expect(device.read).toHaveBeenCalledWith(SERVICE, BATTERY);
      expect(level).toBe(80);
    });

    it('subscribes to battery notifications and decodes the pushed value', () => {
      const device = createMockDevice();
      const sb = new StorzBickelProfile(device);
      const received: number[] = [];
      sb.onBatteryLevel((v) => received.push(v));
      expect(device.subscribe).toHaveBeenCalledWith(SERVICE, BATTERY, expect.any(Function));
      const cb = (device.subscribe as jest.Mock).mock.calls[0][2] as (dv: DataView) => void;
      cb(makeDataView([0x2a, 0x00])); // 42
      expect(received).toEqual([42]);
    });
  });

  describe('onCurrentTemperature (notify seam)', () => {
    it('subscribes to the current-temp characteristic and decodes the pushed value', () => {
      const device = createMockDevice();
      const sb = new StorzBickelProfile(device);
      const received: number[] = [];
      sb.onCurrentTemperature((v) => received.push(v));
      expect(device.subscribe).toHaveBeenCalledWith(SERVICE, CURRENT_TEMP, expect.any(Function));
      const cb = (device.subscribe as jest.Mock).mock.calls[0][2] as (dv: DataView) => void;
      cb(makeDataView([0x1e, 0x07])); // 182.2
      expect(received).toHaveLength(1);
      expect(received[0]).toBeCloseTo(182.2);
    });

    it('returns a callable unsubscribe function', () => {
      const device = createMockDevice();
      const sb = new StorzBickelProfile(device);
      const off = sb.onCurrentTemperature(jest.fn());
      expect(typeof off).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // SB-SDK-14 — overflow/staleness hook. Swift's bounded EventQueue emits
  // QUEUE_OVERFLOW under sustained high-frequency load; the polyfill re-surfaces
  // it as a `beacio:overflow` CustomEvent dispatched ON the characteristic. This
  // profile hook lets the S&B gauge re-read currentTemperature() to resync
  // rather than trusting the last (now-stale) notified value. Thin-JS: it only
  // surfaces the existing native signal — no Swift / flow-control change.
  // -------------------------------------------------------------------------
  describe('SB-SDK-14 — onCurrentTemperatureStale (overflow/staleness hook)', () => {
    /** A mock device whose onCharacteristicOverflow attaches to a real EventTarget. */
    function createOverflowDevice(): { device: BeacioDevice; target: EventTarget } {
      const target = new EventTarget();
      const device = {
        ...createMockDevice(),
        onCharacteristicOverflow: jest.fn(
          (_service: string, _characteristic: string, listener: (event: unknown) => void): (() => void) => {
            const handler = (event: Event) => listener(event);
            target.addEventListener('beacio:overflow', handler);
            return () => target.removeEventListener('beacio:overflow', handler);
          },
        ),
      } as unknown as BeacioDevice;
      return { device, target };
    }

    function dispatchOverflow(target: EventTarget, detail: Record<string, number>): void {
      target.dispatchEvent(new CustomEvent('beacio:overflow', { detail }));
    }

    it('registers the overflow hook on the current-temperature characteristic', () => {
      const { device } = createOverflowDevice();
      const sb = new StorzBickelProfile(device);
      sb.onCurrentTemperatureStale(jest.fn());
      expect(device.onCharacteristicOverflow).toHaveBeenCalledWith(
        SERVICE,
        CURRENT_TEMP,
        expect.any(Function),
      );
    });

    it('fires the staleness callback exactly once per beacio:overflow, preserving the metadata', () => {
      const { device, target } = createOverflowDevice();
      const sb = new StorzBickelProfile(device);
      const seen: Array<{ evictedCount?: number; queueCapacity?: number; seq?: number; timestamp?: number }> = [];
      sb.onCurrentTemperatureStale((e) => seen.push(e));

      dispatchOverflow(target, { evictedCount: 7, queueCapacity: 64, seq: 1234, timestamp: 42 });

      expect(seen).toHaveLength(1);
      expect(seen[0]).toEqual({ evictedCount: 7, queueCapacity: 64, seq: 1234, timestamp: 42 });
    });

    it('detaches the listener when the returned unsubscribe is called', () => {
      const { device, target } = createOverflowDevice();
      const sb = new StorzBickelProfile(device);
      const seen: unknown[] = [];
      const off = sb.onCurrentTemperatureStale((e) => seen.push(e));

      dispatchOverflow(target, { evictedCount: 1, queueCapacity: 64, seq: 1, timestamp: 1 });
      off();
      dispatchOverflow(target, { evictedCount: 2, queueCapacity: 64, seq: 2, timestamp: 2 });

      expect(seen).toHaveLength(1);
    });

    it('detaches the overflow listener on stop() (cleanup parity with subscribe)', () => {
      const { device, target } = createOverflowDevice();
      const sb = new StorzBickelProfile(device);
      const seen: unknown[] = [];
      sb.onCurrentTemperatureStale((e) => seen.push(e));

      sb.stop();
      dispatchOverflow(target, { evictedCount: 3, queueCapacity: 64, seq: 3, timestamp: 3 });

      expect(seen).toHaveLength(0);
    });
  });

  describe('subscribe-seam guard (notifications go through device.subscribe ONLY)', () => {
    it('enables current-temp notifications WITHOUT writing a CCCD/SCCD descriptor', () => {
      const device = createMockDevice();
      const sb = new StorzBickelProfile(device);
      sb.onCurrentTemperature(jest.fn());
      expect(device.subscribe).toHaveBeenCalledTimes(1);
      expect(device.write).not.toHaveBeenCalled();
      expect(device.writeWithoutResponse).not.toHaveBeenCalled();
    });

    it('enables battery notifications WITHOUT writing a CCCD/SCCD descriptor', () => {
      const device = createMockDevice();
      const sb = new StorzBickelProfile(device);
      sb.onBatteryLevel(jest.fn());
      expect(device.subscribe).toHaveBeenCalledTimes(1);
      expect(device.write).not.toHaveBeenCalled();
      expect(device.writeWithoutResponse).not.toHaveBeenCalled();
    });

    it('never passes a forbidden CCCD/SCCD handle to any write or subscribe call', async () => {
      const device = createMockDevice();
      const sb = new StorzBickelProfile(device);
      sb.onCurrentTemperature(jest.fn());
      sb.onBatteryLevel(jest.fn());
      await sb.setTargetTemperature(190);
      await sb.setBoost(10);

      const handles = collectHandleCalls(device).flat();
      for (const forbidden of FORBIDDEN_HANDLES) {
        expect(handles).not.toContain(forbidden);
      }
    });

    it('only ever touches the Storz & Bickel data service UUID', async () => {
      const device = createMockDevice();
      const sb = new StorzBickelProfile(device);
      sb.onCurrentTemperature(jest.fn());
      sb.onBatteryLevel(jest.fn());
      await sb.setTargetTemperature(190);
      await sb.setBoost(10);

      for (const [service] of collectHandleCalls(device)) {
        expect(service).toBe(SERVICE);
      }
    });
  });

  describe('write-with-response invariant', () => {
    it('uses write-with-response (not write-without-response) for the setpoint', async () => {
      const device = createMockDevice();
      const sb = new StorzBickelProfile(device);
      await sb.setTargetTemperature(190);
      expect(device.write).toHaveBeenCalledTimes(1);
      expect(device.writeWithoutResponse).not.toHaveBeenCalled();
    });
  });

  describe('stop / unsubscribe lifecycle', () => {
    it('invokes every registered unsubscribe exactly once on stop()', () => {
      const unsub = jest.fn();
      const device = {
        ...createMockDevice(),
        subscribe: jest.fn().mockReturnValue(unsub),
      } as unknown as BeacioDevice;
      const sb = new StorzBickelProfile(device);
      sb.onCurrentTemperature(jest.fn());
      sb.onBatteryLevel(jest.fn());
      sb.stop();
      expect(unsub).toHaveBeenCalledTimes(2);
    });

    it('unsubscribe returned by onCurrentTemperature invokes the underlying unsubscribe once', () => {
      const unsub = jest.fn();
      const device = {
        ...createMockDevice(),
        subscribe: jest.fn().mockReturnValue(unsub),
      } as unknown as BeacioDevice;
      const sb = new StorzBickelProfile(device);
      const off = sb.onCurrentTemperature(jest.fn());
      off();
      expect(unsub).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------
// SB-SDK-08 — per-profile SERVICES exports, deriveOptionalServices(),
// and the Storz & Bickel multi-family service bundle (StorzBickel.allServices()).
// ---------------------------------------------------------------------------

// Canonical lowercase vendor service UUIDs, pinned with provenance
// (captured/beautified/main.js:118-127). These are the regression guard: a
// silent edit to any family UUID (or accidentally fetching the excluded
// Volcano5) turns these RED.
const CRAFTY_SVC1 = '00000001-4c45-4b43-4942-265a524f5453'; // main.js:118 serviceUuidCrafty1
const CRAFTY_SVC2 = '00000002-4c45-4b43-4942-265a524f5453'; // main.js:119 serviceUuidCrafty2
const CRAFTY_SVC3 = '00000003-4c45-4b43-4942-265a524f5453'; // main.js:120 serviceUuidCrafty3
const VOLCANO_1 = '00000001-1989-0108-1234-123456789abc';   // main.js:121 serviceUuidVolcano1
const VOLCANO_2 = '01000002-1989-0108-1234-123456789abc';   // main.js:122 serviceUuidVolcano2
const VOLCANO_3 = '10100000-5354-4f52-5a26-4249434b454c';   // main.js:123 serviceUuidVolcano3
const VOLCANO_4 = '10110000-5354-4f52-5a26-4249434b454c';   // main.js:124 serviceUuidVolcano4
const VOLCANO_5_EXCLUDED = '10130000-5354-4f52-5a26-4249434b454c'; // main.js:125 — declared but NEVER getPrimaryService'd
const QVAP = '00000000-5354-4f52-5a26-4249434b454c';        // main.js:126 serviceUuidQvap
const QVAP_GENERIC_ACCESS = '00001800-0000-1000-8000-00805f9b34fb'; // main.js:127 serviceUuidQvap1 (generic_access)

const NUS = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const HEART_RATE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';

describe('SB-SDK-08 — per-profile SERVICES exports', () => {
  it('STORZ_BICKEL_SERVICES pins the 3 Crafty/Mighty family services (svc1/2/3), canonical lowercase', () => {
    expect(STORZ_BICKEL_SERVICES).toEqual([CRAFTY_SVC1, CRAFTY_SVC2, CRAFTY_SVC3]);
  });

  it('STORZ_BICKEL_SERVICE (the profile primary) is the first entry of STORZ_BICKEL_SERVICES', () => {
    expect(STORZ_BICKEL_SERVICES[0]).toBe(STORZ_BICKEL_SERVICE);
  });

  it('NUS_SERVICES pins the Nordic UART service', () => {
    expect(NUS_SERVICES).toEqual([NUS]);
  });

  it('HEART_RATE_SERVICES resolves the SIG heart_rate alias to its canonical 128-bit UUID', () => {
    expect(HEART_RATE_SERVICES).toEqual([HEART_RATE_UUID]);
  });

  it('every SERVICES array entry is a canonical lowercase 128-bit UUID', () => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const uuid of [...STORZ_BICKEL_SERVICES, ...NUS_SERVICES, ...HEART_RATE_SERVICES]) {
      expect(uuid).toMatch(uuidRe);
    }
  });

  it('re-exports the SERVICES arrays + StorzBickel from the package index', () => {
    expect(STORZ_BICKEL_SERVICES_FROM_INDEX).toEqual(STORZ_BICKEL_SERVICES);
    expect(StorzBickelFromIndex).toBe(StorzBickel);
  });
});

describe('SB-SDK-08 — deriveOptionalServices()', () => {
  it('deriveOptionalServices(StorzBickelProfile) === STORZ_BICKEL_SERVICES', () => {
    expect(deriveOptionalServices(StorzBickelProfile)).toEqual(STORZ_BICKEL_SERVICES);
  });

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
    const combined = deriveOptionalServices(StorzBickelProfile, NordicUARTProfile);
    expect(combined).toEqual([...STORZ_BICKEL_SERVICES, NUS]);
    expect(new Set(combined).size).toBe(combined.length);
  });

  it('mixes profiles and raw arrays, de-duping an overlapping UUID across the two', () => {
    const combined = deriveOptionalServices(NordicUARTProfile, [NUS, 'heart_rate']);
    // NUS appears in both the profile and the array; it must survive exactly once.
    expect(combined).toEqual([NUS, HEART_RATE_UUID]);
  });

  it('is order-preserving and idempotent (deriving an already-derived array is a no-op)', () => {
    const once = deriveOptionalServices(StorzBickel.allServices());
    const twice = deriveOptionalServices(once);
    expect(twice).toEqual(once);
  });
});

describe('SB-SDK-08 — StorzBickel.allServices() multi-family bundle', () => {
  it('equals the de-duped union of the three per-family SERVICES arrays (Crafty + Volcano + Veazy/Venty)', () => {
    const { crafty, volcano, veazyVenty } = STORZ_BICKEL_FAMILY_SERVICES;
    const expectedUnion = deriveOptionalServices(crafty, volcano, veazyVenty);
    expect(StorzBickel.allServices()).toEqual(expectedUnion);
  });

  it('contains every getPrimaryService-opened family service across all devices', () => {
    const all = StorzBickel.allServices();
    for (const uuid of [
      CRAFTY_SVC1, CRAFTY_SVC2, CRAFTY_SVC3,
      VOLCANO_1, VOLCANO_2, VOLCANO_3, VOLCANO_4,
      QVAP, QVAP_GENERIC_ACCESS,
    ]) {
      expect(all).toContain(uuid);
    }
  });

  it('EXCLUDES the intentionally-never-fetched Volcano5 service (10130000-…)', () => {
    expect(StorzBickel.allServices()).not.toContain(VOLCANO_5_EXCLUDED);
    // and it is not smuggled in via any per-family array either.
    expect(STORZ_BICKEL_FAMILY_SERVICES.volcano).not.toContain(VOLCANO_5_EXCLUDED);
  });

  it('is a deriveOptionalServices no-op (already a canonical, de-duped, flat string[])', () => {
    const all = StorzBickel.allServices();
    expect(deriveOptionalServices(all)).toEqual(all);
    expect(new Set(all).size).toBe(all.length);
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const uuid of all) expect(uuid).toMatch(uuidRe);
  });

  it('superset guard: every Crafty/Mighty profile service is in the vendor bundle', () => {
    const all = StorzBickel.allServices();
    for (const uuid of STORZ_BICKEL_SERVICES) {
      expect(all).toContain(uuid);
    }
  });
});

describe('SB-SDK-02 — Volcano family mixes TWO distinct UUID bases (provenance guard)', () => {
  // The 96-bit "base" of a 128-bit UUID is its trailing `…-XXXX-XXXX-XXXX-XXXXXXXXXXXX`
  // (everything after the leading 32-bit field). The vendor bundle's Volcano
  // services do NOT all share one base, contrary to a naive single-base reading:
  // volcano1/2 use a generic-vendor base and volcano3/4 use the big-endian S&B base.
  const baseOf = (uuid: string): string => uuid.slice(9); // drop "XXXXXXXX-"
  const GENERIC_VENDOR_BASE = '1989-0108-1234-123456789abc';
  const BIG_ENDIAN_SB_BASE = '5354-4f52-5a26-4249434b454c';

  it('volcano1/volcano2 use the generic-vendor base (1989-0108), NOT an S&B base', () => {
    expect(baseOf(STORZ_BICKEL_FAMILY_SERVICES.volcano[0])).toBe(GENERIC_VENDOR_BASE);
    expect(baseOf(STORZ_BICKEL_FAMILY_SERVICES.volcano[1])).toBe(GENERIC_VENDOR_BASE);
  });

  it('volcano3/volcano4 use the big-endian S&B base (ASCII STORZ&BICKEL)', () => {
    expect(baseOf(STORZ_BICKEL_FAMILY_SERVICES.volcano[2])).toBe(BIG_ENDIAN_SB_BASE);
    expect(baseOf(STORZ_BICKEL_FAMILY_SERVICES.volcano[3])).toBe(BIG_ENDIAN_SB_BASE);
  });

  it('the two Volcano bases are genuinely distinct (the array is NOT single-base)', () => {
    const bases = new Set(STORZ_BICKEL_FAMILY_SERVICES.volcano.map(baseOf));
    expect(bases).toEqual(new Set([GENERIC_VENDOR_BASE, BIG_ENDIAN_SB_BASE]));
    expect(GENERIC_VENDOR_BASE).not.toBe(BIG_ENDIAN_SB_BASE);
  });

  it('the big-endian S&B base is the byte-reverse of the Crafty (byte-reversed) base', () => {
    // Crafty primary service base, e.g. 00000001-4c45-4b43-4942-265a524f5453.
    const craftyBase = STORZ_BICKEL_SERVICE.slice(9); // 4c45-4b43-4942-265a524f5453
    const craftyHex = craftyBase.replace(/-/g, '');
    const sbHex = BIG_ENDIAN_SB_BASE.replace(/-/g, '');
    const reversedBytes = (craftyHex.match(/../g) ?? []).reverse().join('');
    expect(reversedBytes).toBe(sbHex);
  });
});

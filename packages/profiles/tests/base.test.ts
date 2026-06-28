import { describe, expect, it, jest } from '@jest/globals';
import { BaseProfile, defineProfile, parseRawBytes } from '../src/base';
import type { BeacioDevice, NativeOverflowEvent } from '@beacio/core';

type MockDevice = {
  connect: ReturnType<typeof jest.fn>;
  read: ReturnType<typeof jest.fn>;
  write: ReturnType<typeof jest.fn>;
  writeWithoutResponse: ReturnType<typeof jest.fn>;
  subscribe: ReturnType<typeof jest.fn>;
  onCharacteristicOverflow: ReturnType<typeof jest.fn>;
  disconnect: ReturnType<typeof jest.fn>;
  id: string;
  name: string;
  connected: boolean;
};

function makeMockDevice(): MockDevice {
  return {
    connect: jest.fn(async () => undefined),
    read: jest.fn(async () => new DataView(new Uint8Array([42]).buffer)),
    write: jest.fn(async () => undefined),
    writeWithoutResponse: jest.fn(async () => undefined),
    subscribe: jest.fn().mockReturnValue(jest.fn()),
    onCharacteristicOverflow: jest.fn().mockReturnValue(jest.fn()),
    disconnect: jest.fn(),
    id: 'test-device',
    name: 'Test Device',
    connected: true,
  };
}

describe('defineProfile', () => {
  const TestProfile = defineProfile({
    name: 'test',
    service: 'battery_service',
    characteristics: {
      level: {
        uuid: 'battery_level',
        capabilities: ['read', 'notify'],
        parse: (dv: DataView) => dv.getUint8(0),
      },
      command: {
        uuid: 'battery_level',
        capabilities: ['writeWithoutResponse'],
        serialize: (value: number) => new Uint8Array([value]),
      },
      config: {
        uuid: '2a00',
        capabilities: ['read', 'write'],
        parse: (dv: DataView) => dv.getUint8(0),
        serialize: (value: number) => new Uint8Array([value]),
      },
    },
  });

  it('parseRawBytes converts buffers into DataView', () => {
    const value = parseRawBytes(new Uint8Array([1, 2, 3]));
    expect(value).toBeInstanceOf(DataView);
    expect(value.getUint8(1)).toBe(2);
  });

  it('creates a profile class', () => {
    const device = makeMockDevice();
    const profile = new TestProfile(device as never);
    expect(profile).toBeDefined();
  });

  it('readChar calls device.read and parses result', async () => {
    const device = makeMockDevice();
    const profile = new TestProfile(device as never);
    const value = await profile.readChar('level');
    expect(value).toBe(42);
    expect(device.read).toHaveBeenCalled();
  });

  it('subscribeChar calls device.subscribe', () => {
    const device = makeMockDevice();
    const profile = new TestProfile(device as never);
    const cb = jest.fn();
    const unsub = profile.subscribeChar('level', cb);
    expect(device.subscribe).toHaveBeenCalled();
    expect(typeof unsub).toBe('function');
  });

  it('writeChar serializes values and delegates to device.write', async () => {
    const device = makeMockDevice();
    const profile = new TestProfile(device as never);

    await profile.writeChar('command', 9);

    expect(device.writeWithoutResponse).toHaveBeenCalledWith(
      'battery_service',
      'battery_level',
      new Uint8Array([9]),
      { mode: 'without-response' },
    );
  });

  it('writeChar supports explicit write mode selection', async () => {
    const device = makeMockDevice();
    const profile = new TestProfile(device as never);

    await profile.writeChar('command', 7, { mode: 'without-response' });

    expect(device.writeWithoutResponse).toHaveBeenCalledWith(
      'battery_service',
      'battery_level',
      new Uint8Array([7]),
      { mode: 'without-response' },
    );
  });

  it('writeChar defaults to with-response when supported', async () => {
    const device = makeMockDevice();
    const profile = new TestProfile(device as never);

    await profile.writeChar('config', 5);

    expect(device.write).toHaveBeenCalledWith(
      'battery_service',
      '2a00',
      new Uint8Array([5]),
      { mode: 'with-response' },
    );
  });

  it('rejects invalid profile definitions at definition time', () => {
    expect(() => defineProfile({
      name: 'invalid',
      service: 'battery_service',
      characteristics: {
        broken: {
          uuid: 'battery_level',
          capabilities: ['write'],
        },
      },
    } as never)).toThrow('Characteristic broken declares write capability but is missing serialize()');
  });

  it('connect delegates to device.connect', async () => {
    const device = makeMockDevice();
    const profile = new TestProfile(device as never);
    await profile.connect();
    expect(device.connect).toHaveBeenCalled();
  });

  it('stop cleans up subscriptions', () => {
    const unsubFn = jest.fn();
    const device = makeMockDevice();
    device.subscribe.mockReturnValue(unsubFn);
    const profile = new TestProfile(device as never);
    profile.subscribeChar('level', jest.fn());
    profile.stop();
    expect(unsubFn).toHaveBeenCalled();
  });

  it('dispose remains compatible with stop()', () => {
    const unsubFn = jest.fn();
    const device = makeMockDevice();
    device.subscribe.mockReturnValue(unsubFn);
    const profile = new TestProfile(device as never);

    profile.subscribeChar('level', jest.fn());
    profile.dispose();

    expect(unsubFn).toHaveBeenCalled();
  });

  it('exposes canonical service and characteristic metadata', () => {
    const device = makeMockDevice();
    const profile = new TestProfile(device as never);

    expect(profile.getServiceUUID()).toBe('battery_service');
    expect(profile.getCharacteristicUUID('config')).toBe('2a00');
    expect(profile.getCharacteristicCapabilities('level')).toEqual(['read', 'notify']);
  });
});

// ---------------------------------------------------------------------------
// SB-SDK-14 — BaseProfile.onOverflow base surface. The protected hook forwards
// to device.onCharacteristicOverflow, decodes the beacio:overflow event detail,
// and registers cleanup into the profile's cleanup set (parity with subscribe()).
// A minimal subclass exposes the protected hook publicly for the test.
// ---------------------------------------------------------------------------
describe('SB-SDK-14 — BaseProfile.onOverflow', () => {
  const SVC = '0000feed-0000-1000-8000-00805f9b34fb';
  const CHAR = '0000beef-0000-1000-8000-00805f9b34fb';

  class OverflowTestProfile extends BaseProfile {
    protected readonly service = SVC;
    watch(callback: (event: NativeOverflowEvent) => void): () => void {
      return this.onOverflow(CHAR, callback);
    }
  }

  /** A device whose onCharacteristicOverflow attaches to a real EventTarget. */
  function makeOverflowDevice(): { device: BeacioDevice; target: EventTarget; spy: ReturnType<typeof jest.fn> } {
    const target = new EventTarget();
    const spy = jest.fn(
      (_service: string, _characteristic: string, listener: (event: Event) => void): (() => void) => {
        target.addEventListener('beacio:overflow', listener as EventListener);
        return () => target.removeEventListener('beacio:overflow', listener as EventListener);
      },
    );
    const device = { ...makeMockDevice(), onCharacteristicOverflow: spy } as unknown as BeacioDevice;
    return { device, target, spy };
  }

  it('forwards onOverflow(char, cb) to device.onCharacteristicOverflow(service, char, fn)', () => {
    const { device, spy } = makeOverflowDevice();
    new OverflowTestProfile(device).watch(jest.fn());
    expect(spy).toHaveBeenCalledWith(SVC, CHAR, expect.any(Function));
  });

  it('decodes the beacio:overflow event detail into a typed NativeOverflowEvent', () => {
    const { device, target } = makeOverflowDevice();
    const seen: NativeOverflowEvent[] = [];
    new OverflowTestProfile(device).watch((e) => seen.push(e));

    target.dispatchEvent(new CustomEvent('beacio:overflow', { detail: { evictedCount: 9, queueCapacity: 64, seq: 5, timestamp: 7 } }));

    expect(seen).toEqual([{ evictedCount: 9, queueCapacity: 64, seq: 5, timestamp: 7 }]);
  });

  it('the returned unsubscribe detaches the listener exactly once', () => {
    const { device, target } = makeOverflowDevice();
    const seen: NativeOverflowEvent[] = [];
    const off = new OverflowTestProfile(device).watch((e) => seen.push(e));

    target.dispatchEvent(new CustomEvent('beacio:overflow', { detail: { evictedCount: 1 } }));
    off();
    target.dispatchEvent(new CustomEvent('beacio:overflow', { detail: { evictedCount: 2 } }));

    expect(seen).toHaveLength(1);
  });

  it('stop() detaches the overflow listener (cleanup parity with subscribe)', () => {
    const { device, target } = makeOverflowDevice();
    const seen: NativeOverflowEvent[] = [];
    const profile = new OverflowTestProfile(device);
    profile.watch((e) => seen.push(e));

    profile.stop();
    target.dispatchEvent(new CustomEvent('beacio:overflow', { detail: { evictedCount: 3 } }));

    expect(seen).toHaveLength(0);
  });

  it('dispose() detaches the overflow listener too', () => {
    const { device, target } = makeOverflowDevice();
    const seen: NativeOverflowEvent[] = [];
    const profile = new OverflowTestProfile(device);
    profile.watch((e) => seen.push(e));

    profile.dispose();
    target.dispatchEvent(new CustomEvent('beacio:overflow', { detail: { evictedCount: 4 } }));

    expect(seen).toHaveLength(0);
  });
});

import { BatteryProfile } from '../src/battery';
import type { WebBLEDevice } from '@ios-web-bluetooth/core';

function makeDataView(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

function createMockDevice(readResult: DataView): WebBLEDevice {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue(readResult),
    write: jest.fn().mockResolvedValue(undefined),
    writeWithoutResponse: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(jest.fn()),
    getWriteLimits: jest.fn().mockResolvedValue({ withResponse: 512, withoutResponse: 512 }),
    getMtu: jest.fn().mockResolvedValue(23),
  } as unknown as WebBLEDevice;
}

describe('BatteryProfile', () => {
  describe('readLevel', () => {
    it('reads battery level of 0%', async () => {
      const device = createMockDevice(makeDataView([0]));
      const battery = new BatteryProfile(device);
      const level = await battery.readLevel();
      expect(level).toBe(0);
    });

    it('reads battery level of 100%', async () => {
      const device = createMockDevice(makeDataView([100]));
      const battery = new BatteryProfile(device);
      const level = await battery.readLevel();
      expect(level).toBe(100);
    });

    it('reads mid-range battery level', async () => {
      const device = createMockDevice(makeDataView([57]));
      const battery = new BatteryProfile(device);
      const level = await battery.readLevel();
      expect(level).toBe(57);
    });

    it('reads max uint8 value (255) without error', async () => {
      const device = createMockDevice(makeDataView([255]));
      const battery = new BatteryProfile(device);
      const level = await battery.readLevel();
      expect(level).toBe(255);
    });

    it('calls device.read with correct service and characteristic', async () => {
      const device = createMockDevice(makeDataView([50]));
      const battery = new BatteryProfile(device);
      await battery.readLevel();
      expect(device.read).toHaveBeenCalledWith('battery_service', 'battery_level');
    });
  });

  describe('connect', () => {
    it('delegates connect to device', async () => {
      const device = createMockDevice(makeDataView([0]));
      const battery = new BatteryProfile(device);
      await battery.connect();
      expect(device.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('onLevelChange', () => {
    it('subscribes to battery_level notifications', () => {
      const device = createMockDevice(makeDataView([0]));
      const battery = new BatteryProfile(device);
      const callback = jest.fn();
      battery.onLevelChange(callback);
      expect(device.subscribe).toHaveBeenCalledWith(
        'battery_service',
        'battery_level',
        expect.any(Function),
      );
    });

    it('returns an unsubscribe function', () => {
      const mockUnsub = jest.fn();
      const device = {
        ...createMockDevice(makeDataView([0])),
        subscribe: jest.fn().mockReturnValue(mockUnsub),
      } as unknown as WebBLEDevice;
      const battery = new BatteryProfile(device);
      const unsub = battery.onLevelChange(jest.fn());
      expect(typeof unsub).toBe('function');
    });

    it('parses notification DataView and forwards level to callback', () => {
      const device = createMockDevice(makeDataView([0]));
      const battery = new BatteryProfile(device);
      const callback = jest.fn();
      battery.onLevelChange(callback);

      const subscribeCall = (device.subscribe as jest.Mock).mock.calls[0];
      const internalCb = subscribeCall[2];
      internalCb(makeDataView([73]));
      expect(callback).toHaveBeenCalledWith(73);
    });
  });

  describe('stop', () => {
    it('cleans up subscriptions on stop', () => {
      const mockUnsub = jest.fn();
      const device = {
        ...createMockDevice(makeDataView([0])),
        subscribe: jest.fn().mockReturnValue(mockUnsub),
      } as unknown as WebBLEDevice;
      const battery = new BatteryProfile(device);
      battery.onLevelChange(jest.fn());
      battery.stop();
      expect(mockUnsub).toHaveBeenCalledTimes(1);
    });
  });
});

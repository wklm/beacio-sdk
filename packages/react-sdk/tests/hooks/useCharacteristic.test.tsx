import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { BeacioProvider } from '../../src/core/BeacioProvider';
import { useCharacteristic } from '../../src/hooks/useCharacteristic';

function createMockDevice() {
  const characteristic = {
    uuid: 'char-uuid',
    service: { uuid: 'service-uuid' },
    properties: {
      read: true,
      write: true,
      writeWithoutResponse: true,
      notify: true,
      indicate: false,
      broadcast: false,
      authenticatedSignedWrites: false,
      reliableWrite: false,
      writableAuxiliaries: false,
    },
    getDescriptor: jest.fn().mockResolvedValue({ uuid: 'descriptor-1' }),
    getDescriptors: jest.fn().mockResolvedValue([{ uuid: 'descriptor-1' }]),
  };

  const service = {
    uuid: 'service-uuid',
    getCharacteristic: jest.fn().mockResolvedValue(characteristic),
  };

  const unsubscribe = jest.fn();

  const device = {
    id: 'device-1',
    name: 'Device',
    connected: true,
    raw: {
      gatt: {
        getPrimaryService: jest.fn().mockResolvedValue(service),
      },
    },
    getPrimaryServices: jest.fn().mockResolvedValue([service]),
    read: jest.fn().mockResolvedValue(new DataView(new Uint8Array([1, 2, 3]).buffer)),
    write: jest.fn().mockResolvedValue(undefined),
    writeWithoutResponse: jest.fn().mockResolvedValue(undefined),
    subscribeAsync: jest.fn().mockImplementation(async (_svc, _char, callback) => {
      callback(new DataView(new Uint8Array([9]).buffer));
      return unsubscribe;
    }),
  };

  return { device, characteristic, unsubscribe };
}

describe('useCharacteristic', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BeacioProvider>{children}</BeacioProvider>
  );

  it('resolves the characteristic from device and uuids', () => {
    const { device } = createMockDevice();
    const { result } = renderHook(() => useCharacteristic(device as never, 'service-uuid', 'char-uuid'), { wrapper });

    expect(result.current.characteristicUUID).toBe('char-uuid');
    expect(result.current.serviceUUID).toBe('service-uuid');
  });

  it('reads and writes through core device methods', async () => {
    const { device } = createMockDevice();
    const { result } = renderHook(() => useCharacteristic(device as never, 'service-uuid', 'char-uuid'), { wrapper });

    await act(async () => {
      await result.current.read();
      await result.current.write(new Uint8Array([4]));
      await result.current.writeWithoutResponse(new Uint8Array([5]));
    });

    expect(device.read).toHaveBeenCalledWith('service-uuid', 'char-uuid');
    expect(device.write).toHaveBeenCalledWith('service-uuid', 'char-uuid', expect.any(Uint8Array));
    expect(device.writeWithoutResponse).toHaveBeenCalledWith('service-uuid', 'char-uuid', expect.any(Uint8Array));
    expect(result.current.value?.getUint8(0)).toBe(1);
  });

  it('subscribes and unsubscribes using device.subscribe', async () => {
    const { device, unsubscribe } = createMockDevice();
    const handler = jest.fn();
    const { result } = renderHook(() => useCharacteristic(device as never, 'service-uuid', 'char-uuid'), { wrapper });

    await act(async () => {
      await result.current.subscribe(handler);
    });

    expect(device.subscribeAsync).toHaveBeenCalledWith('service-uuid', 'char-uuid', expect.any(Function));
    expect(handler).toHaveBeenCalled();
    expect(result.current.isNotifying).toBe(true);

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(unsubscribe).toHaveBeenCalled();
    expect(result.current.isNotifying).toBe(false);
  });

  it('sets error when read fails on a device', async () => {
    const { device } = createMockDevice();
    device.read = jest.fn().mockRejectedValue(new Error('GATT read failed'));

    const { result } = renderHook(() => useCharacteristic(device as never, 'service-uuid', 'char-uuid'), { wrapper });

    await act(async () => {
      const readResult = await result.current.read();
      expect(readResult).toBeNull();
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toMatch(/GATT read failed/);
  });

  it('sets error when write fails on a device', async () => {
    const { device } = createMockDevice();
    device.write = jest.fn().mockRejectedValue(new Error('Write rejected'));

    const { result } = renderHook(() => useCharacteristic(device as never, 'service-uuid', 'char-uuid'), { wrapper });

    await act(async () => {
      await result.current.write(new Uint8Array([1]));
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toMatch(/Write rejected/);
  });

  it('sets error when writeWithoutResponse fails', async () => {
    const { device } = createMockDevice();
    device.writeWithoutResponse = jest.fn().mockRejectedValue(new Error('WriteWR failed'));

    const { result } = renderHook(() => useCharacteristic(device as never, 'service-uuid', 'char-uuid'), { wrapper });

    await act(async () => {
      await result.current.writeWithoutResponse(new Uint8Array([1]));
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toMatch(/WriteWR failed/);
  });

  it('throws when no device is provided', async () => {
    const { result } = renderHook(() => useCharacteristic(null, 'service-uuid', 'char-uuid'), { wrapper });

    await act(async () => {
      const readResult = await result.current.read();
      expect(readResult).toBeNull();
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toMatch(/No characteristic target/);
  });

  it('throws when serviceUUID is missing', async () => {
    const { device } = createMockDevice();
    const { result } = renderHook(() => useCharacteristic(device as never, null, 'char-uuid'), { wrapper });

    await act(async () => {
      await result.current.read();
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toMatch(/No characteristic target/);
  });

  it('throws when characteristicUUID is missing', async () => {
    const { device } = createMockDevice();
    const { result } = renderHook(() => useCharacteristic(device as never, 'service-uuid', null), { wrapper });

    await act(async () => {
      await result.current.write(new Uint8Array([1]));
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toMatch(/No characteristic target/);
  });

  it('clears previous error on successful read', async () => {
    const { device } = createMockDevice();
    device.read = jest.fn()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce(new DataView(new Uint8Array([42]).buffer));

    const { result } = renderHook(() => useCharacteristic(device as never, 'service-uuid', 'char-uuid'), { wrapper });

    await act(async () => {
      await result.current.read();
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.read();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.value?.getUint8(0)).toBe(42);
  });

  it('updates value through subscription notifications', async () => {
    const { device } = createMockDevice();
    let emitNotification: ((dv: DataView) => void) | undefined;
    device.subscribeAsync = jest.fn().mockImplementation(async (_s, _c, callback) => {
      emitNotification = callback;
      return jest.fn();
    });

    const handler = jest.fn();
    const { result } = renderHook(() => useCharacteristic(device as never, 'service-uuid', 'char-uuid'), { wrapper });

    await act(async () => {
      await result.current.subscribe(handler);
    });

    expect(result.current.isNotifying).toBe(true);

    // Emit a notification value
    await act(async () => {
      emitNotification!(new DataView(new Uint8Array([77]).buffer));
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.current.value?.getUint8(0)).toBe(77);
  });

  it('sets error and isNotifying=false when subscribe fails', async () => {
    const { device } = createMockDevice();
    device.subscribeAsync = jest.fn().mockRejectedValue(new Error('Notification not supported'));

    const { result } = renderHook(() => useCharacteristic(device as never, 'service-uuid', 'char-uuid'), { wrapper });

    await act(async () => {
      await result.current.subscribe(jest.fn());
    });

    expect(result.current.isNotifying).toBe(false);
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toMatch(/Notification not supported/);
  });

  it('tears down old subscription when subscribing again', async () => {
    const { device } = createMockDevice();
    const unsub1 = jest.fn();
    const unsub2 = jest.fn();
    let callCount = 0;
    device.subscribeAsync = jest.fn().mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? unsub1 : unsub2;
    });

    const { result } = renderHook(() => useCharacteristic(device as never, 'service-uuid', 'char-uuid'), { wrapper });

    await act(async () => {
      await result.current.subscribe(jest.fn());
    });
    expect(result.current.isNotifying).toBe(true);

    // Subscribe again -- should tear down first subscription
    await act(async () => {
      await result.current.subscribe(jest.fn());
    });

    expect(unsub1).toHaveBeenCalled();
    expect(result.current.isNotifying).toBe(true);
  });

  it('cleans up subscription on unmount', async () => {
    const { device, unsubscribe } = createMockDevice();
    const { result, unmount } = renderHook(() => useCharacteristic(device as never, 'service-uuid', 'char-uuid'), { wrapper });

    await act(async () => {
      await result.current.subscribe(jest.fn());
    });
    expect(result.current.isNotifying).toBe(true);

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });

  it('returns null device when none is provided', () => {
    const { result } = renderHook(() => useCharacteristic(undefined, 'service-uuid', 'char-uuid'), { wrapper });
    expect(result.current.device).toBeNull();
  });

  it('returns null UUIDs when none are provided', () => {
    const { result } = renderHook(() => useCharacteristic(undefined, undefined, undefined), { wrapper });
    expect(result.current.serviceUUID).toBeNull();
    expect(result.current.characteristicUUID).toBeNull();
    expect(result.current.device).toBeNull();
  });
});

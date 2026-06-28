import { describe, expect, it, jest } from '@jest/globals';
import { BeacioDevice } from '../src/device';
import { BeacioError } from '../src/errors';
import { resolveUUID } from '../src/uuid';

type MockCharacteristic = {
  value: DataView | null;
  addEventListener: ReturnType<typeof jest.fn>;
  removeEventListener: ReturnType<typeof jest.fn>;
  readValue: ReturnType<typeof jest.fn>;
  startNotifications: ReturnType<typeof jest.fn>;
  stopNotifications: ReturnType<typeof jest.fn>;
  writeValueWithResponse: ReturnType<typeof jest.fn>;
  writeValueWithoutResponse: ReturnType<typeof jest.fn>;
};

type MockService = {
  uuid: string;
  getCharacteristic: ReturnType<typeof jest.fn>;
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushPromises(turns = 6): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

function createConnectedDevice(options?: {
  characteristicPromise?: Promise<MockCharacteristic>;
  startNotificationsPromise?: Promise<MockCharacteristic>;
  writeWithResponsePromise?: Promise<void>;
  writeWithoutResponsePromise?: Promise<void>;
  getMtu?: () => Promise<number | null>;
  getWriteLimits?: () => Promise<{ withResponse?: number | null; withoutResponse?: number | null; mtu?: number | null } | null>;
  getPrimaryServices?: () => Promise<MockService[]>;
}) {
  const addEventListener = jest.fn();
  const removeEventListener = jest.fn();

  const characteristic: MockCharacteristic = {
    value: null,
    addEventListener,
    removeEventListener,
    readValue: jest.fn(() => Promise.resolve(characteristic.value)),
    startNotifications: jest.fn(() => options?.startNotificationsPromise ?? Promise.resolve(characteristic)),
    stopNotifications: jest.fn(() => Promise.resolve()),
    writeValueWithResponse: jest.fn(() => options?.writeWithResponsePromise ?? Promise.resolve()),
    writeValueWithoutResponse: jest.fn(() => options?.writeWithoutResponsePromise ?? Promise.resolve()),
  };

  const service: MockService = {
    uuid: '0000180d-0000-1000-8000-00805f9b34fb',
    getCharacteristic: jest.fn(() => options?.characteristicPromise ?? Promise.resolve(characteristic)),
  };

  const server = {
    connected: true,
    disconnect: jest.fn(),
    getPrimaryService: jest.fn(() => Promise.resolve(service)),
    getPrimaryServices: jest.fn(() => options?.getPrimaryServices?.() ?? Promise.resolve([service])),
  };

  const rawDevice = {
    id: 'device-1',
    name: 'Test Device',
    gatt: {
      connect: jest.fn(() => Promise.resolve(server)),
      getMtu: options?.getMtu,
      getWriteLimits: options?.getWriteLimits,
    },
    addEventListener: jest.fn(),
  } as unknown as ConstructorParameters<typeof BeacioDevice>[0];

  const device = new BeacioDevice(rawDevice);

  return {
    device,
    characteristic,
    addEventListener,
    removeEventListener,
    stopNotifications: characteristic.stopNotifications,
    startNotifications: characteristic.startNotifications,
    writeValueWithResponse: characteristic.writeValueWithResponse,
    writeValueWithoutResponse: characteristic.writeValueWithoutResponse,
    getPrimaryService: server.getPrimaryService,
    getPrimaryServices: server.getPrimaryServices,
    service,
  };
}

describe('BeacioDevice.write', () => {
  it('rejects invalid timeout values', async () => {
    const { device } = createConnectedDevice();

    await device.connect();

    await expect(
      device.write('heart_rate', 'heart_rate_measurement', new Uint8Array([1]), { timeoutMs: 0 }),
    ).rejects.toThrow('Invalid timeoutMs');
  });

  it('writes with response by default', async () => {
    const { device, writeValueWithResponse, writeValueWithoutResponse } = createConnectedDevice();

    await device.connect();

    const value = new Uint8Array([1, 2, 3]);
    await device.write('heart_rate', 'heart_rate_measurement', value);

    expect(writeValueWithResponse).toHaveBeenCalledTimes(1);
    expect(writeValueWithResponse).toHaveBeenCalledWith(value);
    expect(writeValueWithoutResponse).not.toHaveBeenCalled();
  });

  it('times out write with response when timeoutMs elapses first', async () => {
    jest.useFakeTimers();
    try {
      const never = new Promise<void>(() => {});
      const { device } = createConnectedDevice({ writeWithResponsePromise: never });

      await device.connect();

      const promise = device.write('heart_rate', 'heart_rate_measurement', new Uint8Array([1]), { timeoutMs: 25 });
      const assertion = expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
      await jest.advanceTimersByTimeAsync(25);

      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  it('preserves native rejection when write fails before timeout', async () => {
    jest.useFakeTimers();
    try {
      const nativeError = new Error('write failed');
      const { device } = createConnectedDevice({ writeWithResponsePromise: Promise.reject(nativeError) });

      await device.connect();

      const promise = device.write('heart_rate', 'heart_rate_measurement', new Uint8Array([1]), { timeoutMs: 50 });
      await Promise.resolve();

      await expect(promise).rejects.toMatchObject({ code: 'GATT_OPERATION_FAILED' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('supports the unified write API for writes without response', async () => {
    const { device, writeValueWithResponse, writeValueWithoutResponse } = createConnectedDevice();

    await device.connect();

    const value = new Uint8Array([4, 5, 6]);
    await device.write('heart_rate', 'heart_rate_measurement', value, { mode: 'without-response' });

    expect(writeValueWithoutResponse).toHaveBeenCalledTimes(1);
    expect(writeValueWithoutResponse).toHaveBeenCalledWith(value);
    expect(writeValueWithResponse).not.toHaveBeenCalled();
  });

  it('keeps writeWithoutResponse as a backward-compatible alias', async () => {
    const { device, writeValueWithResponse, writeValueWithoutResponse } = createConnectedDevice();

    await device.connect();

    const value = new Uint8Array([7, 8, 9]);
    await device.writeWithoutResponse('heart_rate', 'heart_rate_measurement', value);

    expect(writeValueWithoutResponse).toHaveBeenCalledTimes(1);
    expect(writeValueWithoutResponse).toHaveBeenCalledWith(value);
    expect(writeValueWithResponse).not.toHaveBeenCalled();
  });

  it('supports timeoutMs on writeWithoutResponse alias', async () => {
    jest.useFakeTimers();
    try {
      const never = new Promise<void>(() => {});
      const { device } = createConnectedDevice({ writeWithoutResponsePromise: never });

      await device.connect();

      const promise = device.writeWithoutResponse(
        'heart_rate',
        'heart_rate_measurement',
        new Uint8Array([1]),
        { timeoutMs: 30 },
      );
      const assertion = expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
      await jest.advanceTimersByTimeAsync(30);

      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  it('writes large payloads in chunks and returns transfer metadata', async () => {
    const { device, writeValueWithResponse } = createConnectedDevice({
      getWriteLimits: async () => ({ withResponse: 5 }),
    });

    await device.connect();

    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const result = await device.writeLarge('heart_rate', 'heart_rate_measurement', payload);

    expect(writeValueWithResponse).toHaveBeenCalledTimes(2);
    expect((writeValueWithResponse.mock.calls[0]?.[0] as Uint8Array).byteLength).toBe(5);
    expect((writeValueWithResponse.mock.calls[1]?.[0] as Uint8Array).byteLength).toBe(4);
    expect(result).toEqual({
      bytesWritten: 9,
      totalBytes: 9,
      chunkSize: 5,
      chunkCount: 2,
    });
  });

  it('throws WRITE_INCOMPLETE when a later chunk fails', async () => {
    const { device, writeValueWithResponse } = createConnectedDevice({
      getWriteLimits: async () => ({ withResponse: 4 }),
    });

    await device.connect();

    writeValueWithResponse
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => Promise.reject(new Error('link dropped')));

    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
    await expect(
      device.writeLarge('heart_rate', 'heart_rate_measurement', payload),
    ).rejects.toMatchObject({ code: 'WRITE_INCOMPLETE' });
  });
});

describe('BeacioDevice.getWriteLimits', () => {
  it('returns null limits when the underlying platform exposes no transport metadata', async () => {
    const { device } = createConnectedDevice();

    await device.connect();

    await expect(device.getWriteLimits()).resolves.toEqual({
      withResponse: null,
      withoutResponse: null,
      mtu: null,
    });
    await expect(device.getMtu()).resolves.toBeNull();
  });

  it('uses platform-reported write limits when available', async () => {
    const { device } = createConnectedDevice({
      getWriteLimits: async () => ({ withResponse: 185, withoutResponse: 182, mtu: 185 }),
    });

    await device.connect();

    await expect(device.getWriteLimits()).resolves.toEqual({
      withResponse: 185,
      withoutResponse: 182,
      mtu: 185,
    });
    await expect(device.getMtu()).resolves.toBe(185);
  });

  it('falls back to getMtu when only MTU is exposed', async () => {
    const { device } = createConnectedDevice({ getMtu: async () => 247 });

    await device.connect();

    await expect(device.getWriteLimits()).resolves.toEqual({
      withResponse: null,
      withoutResponse: null,
      mtu: 247,
    });
  });

  it('requires an active connection', async () => {
    const { device } = createConnectedDevice();

    await expect(device.getWriteLimits()).rejects.toMatchObject({ code: 'DEVICE_DISCONNECTED' });
  });
});

describe('BeacioDevice.subscribe', () => {
  it('does not keep a stale callback when unsubscribed before characteristic resolution completes', async () => {
    const characteristicDeferred = deferred<MockCharacteristic>();
    const { device, characteristic, addEventListener, startNotifications } = createConnectedDevice({
      characteristicPromise: characteristicDeferred.promise,
    });

    await device.connect();

    const staleCallback = jest.fn();
    const activeCallback = jest.fn();

    const unsubscribeStale = device.subscribe('heart_rate', 'heart_rate_measurement', staleCallback);
    unsubscribeStale();

    characteristicDeferred.resolve(characteristic);
    await flushPromises();

    expect(startNotifications).not.toHaveBeenCalled();
    expect(addEventListener).not.toHaveBeenCalled();

    device.subscribe('heart_rate', 'heart_rate_measurement', activeCallback);
    await flushPromises();

    expect(startNotifications).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledTimes(1);

    const listener = addEventListener.mock.calls[0]?.[1] as (event: Event) => void;
    characteristic.value = new DataView(new Uint8Array([72]).buffer);
    listener({ target: characteristic } as unknown as Event);

    expect(staleCallback).not.toHaveBeenCalled();
    expect(activeCallback).toHaveBeenCalledTimes(1);
  });

  it('cleans up notification startup when unsubscribe happens before startup settles', async () => {
    const startupDeferred = deferred<MockCharacteristic>();
    const { device, characteristic, addEventListener, removeEventListener, startNotifications, stopNotifications } = createConnectedDevice({
      startNotificationsPromise: startupDeferred.promise,
    });

    await device.connect();

    const callback = jest.fn();
    const unsubscribe = device.subscribe('heart_rate', 'heart_rate_measurement', callback);
    await flushPromises();

    expect(startNotifications).toHaveBeenCalledTimes(1);

    unsubscribe();
    unsubscribe();

    startupDeferred.resolve(characteristic);
    await flushPromises(12);

    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(stopNotifications).toHaveBeenCalledTimes(1);

    const listener = addEventListener.mock.calls[0]?.[1] as (event: Event) => void;
    characteristic.value = new DataView(new Uint8Array([91]).buffer);
    listener({ target: characteristic } as unknown as Event);
    expect(callback).not.toHaveBeenCalled();
  });

  it('shares one native notification lifecycle between subscribe and notifications', async () => {
    const { device, characteristic, addEventListener, removeEventListener, startNotifications, stopNotifications } = createConnectedDevice();

    await device.connect();

    const callback = jest.fn();
    const unsubscribe = device.subscribe('heart_rate', 'heart_rate_measurement', callback);
    const iterator = device.notifications('heart_rate', 'heart_rate_measurement', { maxQueueSize: 16 })[Symbol.asyncIterator]();

    await flushPromises();

    expect(startNotifications).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledTimes(1);

    const listener = addEventListener.mock.calls[0]?.[1] as (event: Event) => void;
    const firstValue = new DataView(new Uint8Array([72]).buffer);
    const firstNext = iterator.next();

    characteristic.value = firstValue;
    listener({ target: characteristic } as unknown as Event);

    await expect(firstNext).resolves.toEqual({ value: firstValue, done: false });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith(firstValue);

    unsubscribe();
    await flushPromises();

    expect(removeEventListener).not.toHaveBeenCalled();
    expect(stopNotifications).not.toHaveBeenCalled();

    const secondValue = new DataView(new Uint8Array([73]).buffer);
    const secondNext = iterator.next();

    characteristic.value = secondValue;
    listener({ target: characteristic } as unknown as Event);

    await expect(secondNext).resolves.toEqual({ value: secondValue, done: false });
    expect(callback).toHaveBeenCalledTimes(1);

    if (!iterator.return) throw new Error('Async iterator is missing return()');
    await iterator.return(undefined);
    await flushPromises(12);

    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(stopNotifications).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate delivery after re-subscribing to the same characteristic', async () => {
    const { device, characteristic, addEventListener, removeEventListener, startNotifications, stopNotifications } = createConnectedDevice();

    await device.connect();

    const firstCallback = jest.fn();
    const unsubscribeFirst = device.subscribe('heart_rate', 'heart_rate_measurement', firstCallback);
    await flushPromises();

    expect(startNotifications).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledTimes(1);

    const firstListener = addEventListener.mock.calls[0]?.[1] as (event: Event) => void;
    characteristic.value = new DataView(new Uint8Array([80]).buffer);
    firstListener({ target: characteristic } as unknown as Event);
    expect(firstCallback).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    await flushPromises();

    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(stopNotifications).toHaveBeenCalledTimes(1);

    const secondCallback = jest.fn();
    device.subscribe('heart_rate', 'heart_rate_measurement', secondCallback);
    await flushPromises();

    expect(startNotifications).toHaveBeenCalledTimes(2);
    expect(addEventListener).toHaveBeenCalledTimes(2);

    const secondListener = addEventListener.mock.calls[1]?.[1] as (event: Event) => void;
    characteristic.value = new DataView(new Uint8Array([81]).buffer);
    secondListener({ target: characteristic } as unknown as Event);

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenCalledTimes(1);
  });

  it('enables autoRecover by default', async () => {
    const { device } = createConnectedDevice();
    await device.connect();

    const unsubscribe = device.subscribe('heart_rate', 'heart_rate_measurement', jest.fn());
    const registrySize = (device as unknown as { recoveryRegistry: Map<string, unknown> }).recoveryRegistry.size;

    expect(registrySize).toBe(1);
    unsubscribe();
  });

  it('surfaces subscribe startup errors via onError callback', async () => {
    const startupError = new Error('start failed');
    const { device } = createConnectedDevice({
      startNotificationsPromise: Promise.reject(startupError),
    });

    await device.connect();

    const onError = jest.fn();
    device.subscribe('heart_rate', 'heart_rate_measurement', jest.fn(), { onError });
    await flushPromises(12);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ code: 'GATT_OPERATION_FAILED' });
  });
});

describe('BeacioDevice.notifications', () => {
  it('throws on queue overflow by default', async () => {
    const { device, characteristic, addEventListener } = createConnectedDevice();
    await device.connect();

    const iterator = device.notifications('heart_rate', 'heart_rate_measurement', { maxQueueSize: 1 })[Symbol.asyncIterator]();
    const bootstrap = iterator.next();
    await flushPromises();

    const listener = addEventListener.mock.calls[0]?.[1] as (event: Event) => void;
    characteristic.value = new DataView(new Uint8Array([1]).buffer);
    listener({ target: characteristic } as unknown as Event);
    await expect(bootstrap).resolves.toEqual({ value: characteristic.value, done: false });

    characteristic.value = new DataView(new Uint8Array([2]).buffer);
    listener({ target: characteristic } as unknown as Event);
    characteristic.value = new DataView(new Uint8Array([3]).buffer);
    listener({ target: characteristic } as unknown as Event);

    await expect(iterator.next()).rejects.toMatchObject({
      message: expect.stringContaining('Notification queue overflowed'),
    });

    if (!iterator.return) throw new Error('Async iterator is missing return()');
    await iterator.return(undefined);
  });

  it('supports drop-oldest overflow strategy with callback', async () => {
    const { device, characteristic, addEventListener } = createConnectedDevice();
    await device.connect();

    const onOverflow = jest.fn();
    const iterator = device.notifications('heart_rate', 'heart_rate_measurement', {
      maxQueueSize: 1,
      overflowStrategy: 'drop-oldest',
      onOverflow,
    })[Symbol.asyncIterator]();
    const bootstrap = iterator.next();
    await flushPromises();

    const listener = addEventListener.mock.calls[0]?.[1] as (event: Event) => void;
    const first = new DataView(new Uint8Array([1]).buffer);
    const second = new DataView(new Uint8Array([2]).buffer);
    const third = new DataView(new Uint8Array([3]).buffer);

    characteristic.value = first;
    listener({ target: characteristic } as unknown as Event);
    await expect(bootstrap).resolves.toEqual({ value: first, done: false });

    characteristic.value = second;
    listener({ target: characteristic } as unknown as Event);
    characteristic.value = third;
    listener({ target: characteristic } as unknown as Event);

    await expect(iterator.next()).resolves.toEqual({ value: third, done: false });
    expect(onOverflow).toHaveBeenCalledTimes(1);

    if (!iterator.return) throw new Error('Async iterator is missing return()');
    await iterator.return(undefined);
  });

  it('defaults notifications() to a bounded queue when maxQueueSize is omitted', async () => {
    const { device, characteristic, addEventListener } = createConnectedDevice();
    await device.connect();

    const iterator = device.notifications('heart_rate', 'heart_rate_measurement')[Symbol.asyncIterator]();
    const pending = iterator.next();
    await flushPromises();

    const listener = addEventListener.mock.calls[0]?.[1] as (event: Event) => void;
    characteristic.value = new DataView(new Uint8Array([55]).buffer);
    listener({ target: characteristic } as unknown as Event);

    await expect(pending).resolves.toEqual({ value: characteristic.value, done: false });
    if (!iterator.return) throw new Error('Async iterator is missing return()');
    await iterator.return(undefined);
  });

  it('emits queue-overflow and rejects the next iterator pull after overflow', async () => {
    const { device, characteristic, addEventListener } = createConnectedDevice();
    await device.connect();

    const overflowListener = jest.fn();
    device.on('queue-overflow', overflowListener);

    const iterator = device.notifications('heart_rate', 'heart_rate_measurement', { maxQueueSize: 1 })[Symbol.asyncIterator]();
    const bootstrap = iterator.next();
    await flushPromises();

    const listener = addEventListener.mock.calls[0]?.[1] as (event: Event) => void;
    characteristic.value = new DataView(new Uint8Array([1]).buffer);
    listener({ target: characteristic } as unknown as Event);
    await expect(bootstrap).resolves.toEqual({ value: characteristic.value, done: false });

    characteristic.value = new DataView(new Uint8Array([2]).buffer);
    listener({ target: characteristic } as unknown as Event);
    characteristic.value = new DataView(new Uint8Array([3]).buffer);
    listener({ target: characteristic } as unknown as Event);
    characteristic.value = new DataView(new Uint8Array([4]).buffer);
    listener({ target: characteristic } as unknown as Event);

    await expect(iterator.next()).rejects.toMatchObject({
      message: expect.stringContaining('Notification queue overflowed'),
    });
    expect(overflowListener).toHaveBeenCalledTimes(1);

    if (!iterator.return) throw new Error('Async iterator is missing return()');
    await iterator.return(undefined);
  });
});

describe('BeacioDevice.connect and disconnect lifecycle', () => {
  it('resolves an existing reconnect gate even when reconnect recovery fails', async () => {
    const characteristicDeferred = deferred<MockCharacteristic>();
    const { device } = createConnectedDevice({ characteristicPromise: characteristicDeferred.promise });
    await device.connect();

    const lostListener = jest.fn();
    device.on('subscription-lost', lostListener);
    device.subscribe('heart_rate', 'heart_rate_measurement', jest.fn());
    await flushPromises();

    const disconnectHandler = (device as unknown as { handleDisconnect: () => void }).handleDisconnect.bind(device);
    disconnectHandler();

    const reconnectPromise = device.connect();
    characteristicDeferred.reject(new Error('service changed'));

    await expect(reconnectPromise).resolves.toBeUndefined();

    const reconnectGate = (device as unknown as { reconnectGate: { promise: Promise<void> } | null }).reconnectGate;
    expect(reconnectGate).toBeNull();
    expect(lostListener).toHaveBeenCalledTimes(1);
  });

  it('tracks the last disconnect reason', async () => {
    const { device } = createConnectedDevice();
    await device.connect();

    device.disconnect();
    expect(device.getLastDisconnectReason()).toBe('intentional');

    const disconnectHandler = (device as unknown as { handleDisconnect: () => void }).handleDisconnect.bind(device);
    (device as unknown as { intentionalDisconnect: boolean }).intentionalDisconnect = false;
    disconnectHandler();

    expect(device.getLastDisconnectReason()).toBe('unexpected');
  });
});

describe('BeacioDevice advanced APIs', () => {
  it('returns effective MTU from write limits when available', async () => {
    const { device } = createConnectedDevice({
      getWriteLimits: async () => ({ withResponse: 185, withoutResponse: 182, mtu: 188 }),
    });
    await device.connect();

    await expect(device.getEffectiveMtu()).resolves.toBe(188);
  });

  it('falls back to ATT default MTU when transport metadata is unavailable', async () => {
    const { device } = createConnectedDevice();
    await device.connect();

    await expect(device.getEffectiveMtu()).resolves.toBe(23);
  });

  it('returns recovery-only subscriptions from getActiveSubscriptions', async () => {
    const { device } = createConnectedDevice();
    await device.connect();

    const callback = jest.fn();
    device.subscribe('heart_rate', 'heart_rate_measurement', callback);
    await flushPromises();

    const disconnectHandler = (device as unknown as { handleDisconnect: () => void }).handleDisconnect.bind(device);
    (device as unknown as { intentionalDisconnect: boolean }).intentionalDisconnect = false;
    disconnectHandler();

    expect(device.getActiveSubscriptions()).toEqual([
      expect.objectContaining({
        service: '0000180d-0000-1000-8000-00805f9b34fb',
        characteristic: '00002a37-0000-1000-8000-00805f9b34fb',
        callbackCount: 1,
        autoRecovering: true,
        nativeActive: false,
      }),
    ]);
  });

  it('emits subscription-lost when recovery cannot restore a characteristic', async () => {
    const characteristicDeferred = deferred<MockCharacteristic>();
    const { device } = createConnectedDevice({ characteristicPromise: characteristicDeferred.promise });
    await device.connect();

    const lostListener = jest.fn();
    device.on('subscription-lost', lostListener);
    device.subscribe('heart_rate', 'heart_rate_measurement', jest.fn());
    await flushPromises();

    const disconnectHandler = (device as unknown as { handleDisconnect: () => void }).handleDisconnect.bind(device);
    (device as unknown as { intentionalDisconnect: boolean }).intentionalDisconnect = false;
    disconnectHandler();

    const reconnectPromise = device.connect();
    characteristicDeferred.reject(new Error('characteristic not found'));
    await expect(reconnectPromise).resolves.toBeUndefined();

    expect(lostListener).toHaveBeenCalledTimes(1);
    expect(lostListener.mock.calls[0]?.[0]).toMatchObject({
      service: 'heart_rate',
      characteristic: 'heart_rate_measurement',
      error: expect.objectContaining({ code: 'CHARACTERISTIC_NOT_FOUND' }),
    });
  });

  it('routes notification callback failures through addErrorListener', async () => {
    const { device, characteristic, addEventListener } = createConnectedDevice();
    await device.connect();

    const errorListener = jest.fn();
    device.addErrorListener(errorListener);
    device.subscribe('heart_rate', 'heart_rate_measurement', () => {
      throw new Error('callback blew up');
    });
    await flushPromises();

    const listener = addEventListener.mock.calls[0]?.[1] as (event: Event) => void;
    characteristic.value = new DataView(new Uint8Array([7]).buffer);
    listener({ target: characteristic } as unknown as Event);

    expect(errorListener).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'callback blew up' }),
      expect.objectContaining({ operation: 'device.notification-callback' }),
    );
  });

  it('removes error listeners cleanly', async () => {
    const { device, characteristic, addEventListener } = createConnectedDevice();
    await device.connect();

    const errorListener = jest.fn();
    device.addErrorListener(errorListener);
    device.removeErrorListener(errorListener);
    device.subscribe('heart_rate', 'heart_rate_measurement', () => {
      throw new Error('callback blew up');
    });
    await flushPromises();

    const listener = addEventListener.mock.calls[0]?.[1] as (event: Event) => void;
    characteristic.value = new DataView(new Uint8Array([7]).buffer);
    listener({ target: characteristic } as unknown as Event);

    expect(errorListener).not.toHaveBeenCalled();
  });

  it('reuses cached primary services consistently', async () => {
    const primaryService = {
      uuid: '0000180d-0000-1000-8000-00805f9b34fb',
      getCharacteristic: jest.fn(),
    };
    const { device, getPrimaryService, getPrimaryServices } = createConnectedDevice({
      getPrimaryServices: async () => [primaryService],
    });
    await device.connect();

    const services = await device.getPrimaryServices();
    await device.read('heart_rate', 'heart_rate_measurement').catch(() => undefined);

    expect(services[0]).toBe(primaryService);
    expect(getPrimaryServices).toHaveBeenCalledTimes(1);
    expect(getPrimaryService).not.toHaveBeenCalled();
  });

  it('supports async parse functions for typed reads', async () => {
    const { device, characteristic } = createConnectedDevice();
    const rawValue = new DataView(new Uint8Array([42]).buffer);
    characteristic.value = rawValue;

    characteristic.readValue = jest.fn(() => Promise.resolve(rawValue));
    await device.connect();

    const parsed = await device.read('heart_rate', 'heart_rate_measurement', async (value) => ({
      bpm: value.getUint8(0),
    }));

    expect(parsed).toEqual({ bpm: 42 });
  });

  it('returns retry metadata from writeFragmented and preserves WRITE_INCOMPLETE on partial failure', async () => {
    const { device, writeValueWithResponse } = createConnectedDevice({
      getWriteLimits: async () => ({ withResponse: 3 }),
    });
    await device.connect();

    writeValueWithResponse
      .mockImplementationOnce(() => Promise.reject(new Error('busy')))
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => Promise.resolve());

    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const result = await device.writeFragmented('heart_rate', 'heart_rate_measurement', payload, { maxRetries: 1 });

    expect(result).toEqual({
      bytesWritten: 5,
      totalBytes: 5,
      chunkSize: 3,
      chunkCount: 2,
      retryCount: 1,
    });

    writeValueWithResponse.mockReset();
    writeValueWithResponse
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => Promise.reject(new Error('link dropped')));

    await expect(
      device.writeFragmented('heart_rate', 'heart_rate_measurement', new Uint8Array([1, 2, 3, 4, 5, 6]), { maxRetries: 0 }),
    ).rejects.toMatchObject({ code: 'WRITE_INCOMPLETE', retryAfterMs: 1000 });
  });
});

// AIDEV-NOTE: White-box tests added for cleanup item 144 (god-class split into
// write-chunker + notification-manager). These lock in the load-bearing behaviors
// across the extraction: reconcile ordering, the reconnect-gate lifecycle, the
// notifications() pause/resume on disconnect, and in-flight write abort cleanup.
describe('BeacioDevice god-class split invariants', () => {
  it('reconciles concurrent subscribe/unsubscribe/re-subscribe to a single active native lifecycle', async () => {
    const { device, characteristic, addEventListener, startNotifications, stopNotifications } = createConnectedDevice();
    await device.connect();

    const firstCallback = jest.fn();
    const secondCallback = jest.fn();

    // Fire all three transitions in the same tick so they queue onto the
    // single serialized reconcilePromise chain for this characteristic.
    const unsubscribeFirst = device.subscribe('heart_rate', 'heart_rate_measurement', firstCallback);
    unsubscribeFirst();
    device.subscribe('heart_rate', 'heart_rate_measurement', secondCallback);

    await flushPromises(20);

    // Final state: exactly one active native subscription; the surviving
    // callback receives values, the unsubscribed one does not.
    // AIDEV-NOTE: notificationStates moved onto NotificationManager in the
    // cleanup-144 split; read it via the manager's read accessor.
    const states = (device as unknown as {
      notificationManager: { getNotificationStates: () => Map<string, { nativeActive: boolean; callbacks: Set<unknown> }> };
    }).notificationManager.getNotificationStates();
    expect(states.size).toBe(1);
    const [state] = [...states.values()];
    expect(state.nativeActive).toBe(true);
    expect(state.callbacks.size).toBe(1);
    expect(startNotifications.mock.calls.length).toBeGreaterThanOrEqual(1);

    const listener = addEventListener.mock.calls[addEventListener.mock.calls.length - 1]?.[1] as (event: Event) => void;
    characteristic.value = new DataView(new Uint8Array([99]).buffer);
    listener({ target: characteristic } as unknown as Event);

    expect(secondCallback).toHaveBeenCalledTimes(1);
    expect(firstCallback).not.toHaveBeenCalled();
    expect(stopNotifications).not.toHaveBeenCalled();
  });

  it('pauses the notifications() iterator on unexpected disconnect and resumes after reconnect', async () => {
    const { device, characteristic, addEventListener } = createConnectedDevice();
    await device.connect();

    const iterator = device.notifications('heart_rate', 'heart_rate_measurement', { maxQueueSize: 16 })[Symbol.asyncIterator]();
    const bootstrap = iterator.next();
    await flushPromises();

    const firstListener = addEventListener.mock.calls[addEventListener.mock.calls.length - 1]?.[1] as (event: Event) => void;
    const firstValue = new DataView(new Uint8Array([1]).buffer);
    characteristic.value = firstValue;
    firstListener({ target: characteristic } as unknown as Event);
    await expect(bootstrap).resolves.toEqual({ value: firstValue, done: false });

    // Unexpected disconnect: handleDisconnect creates the reconnect gate
    // (recoveryRegistry is non-empty because notifications() auto-registers).
    const disconnectHandler = (device as unknown as { handleDisconnect: () => void }).handleDisconnect.bind(device);
    (device as unknown as { intentionalDisconnect: boolean }).intentionalDisconnect = false;

    // Pull next() first so the iterator is parked on the queue promise, then
    // disconnect — the iterator should pause (not terminate) on the gate.
    const pendingNext = iterator.next();
    disconnectHandler();

    const gate = (device as unknown as { reconnectGate: { promise: Promise<void> } | null }).reconnectGate;
    expect(gate).not.toBeNull();

    // Reconnect resolves the gate; recoverSubscriptions re-registers the callback.
    await device.connect();
    await flushPromises(20);

    const resumedListener = addEventListener.mock.calls[addEventListener.mock.calls.length - 1]?.[1] as (event: Event) => void;
    const resumedValue = new DataView(new Uint8Array([2]).buffer);
    characteristic.value = resumedValue;
    resumedListener({ target: characteristic } as unknown as Event);

    await expect(pendingNext).resolves.toEqual({ value: resumedValue, done: false });

    if (!iterator.return) throw new Error('Async iterator is missing return()');
    await iterator.return(undefined);
  });

  it('has a non-null reconnect gate while disconnect listeners run (created before fire)', async () => {
    const { device } = createConnectedDevice();
    await device.connect();

    // A recovery registration is required for handleDisconnect to create the gate.
    device.subscribe('heart_rate', 'heart_rate_measurement', jest.fn());
    await flushPromises();

    let gateDuringListener: unknown = 'unset';
    device.on('disconnected', () => {
      gateDuringListener = (device as unknown as { reconnectGate: unknown }).reconnectGate;
    });

    const disconnectHandler = (device as unknown as { handleDisconnect: () => void }).handleDisconnect.bind(device);
    (device as unknown as { intentionalDisconnect: boolean }).intentionalDisconnect = false;
    disconnectHandler();

    expect(gateDuringListener).not.toBeNull();
    expect(gateDuringListener).not.toBe('unset');
  });

  it('rejects writeLarge with WRITE_INCOMPLETE when a disconnect aborts a mid-transfer chunk', async () => {
    const writeDeferred = deferred<void>();
    const { device, characteristic } = createConnectedDevice({
      getWriteLimits: async () => ({ withResponse: 4 }),
    });
    await device.connect();

    let call = 0;
    characteristic.writeValueWithResponse = jest.fn(() => {
      call += 1;
      // First chunk succeeds, second chunk hangs until the disconnect aborts it.
      return call === 1 ? Promise.resolve() : writeDeferred.promise;
    });

    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7]); // 2 chunks of size 4
    const promise = device.writeLarge('heart_rate', 'heart_rate_measurement', payload);
    // Attach the rejection assertion before triggering the rejection so the
    // promise always has a handler (avoids unhandled-rejection worker crash).
    const assertion = expect(promise).rejects.toMatchObject({ code: 'WRITE_INCOMPLETE' });
    // Keep a handler on the hung chunk's underlying promise so rejecting it
    // never surfaces as an unhandled rejection (it is the source of truth that
    // the write() finalizer converts into WRITE_INCOMPLETE via the aborted flag).
    writeDeferred.promise.catch(() => undefined);
    await flushPromises(20);

    // The second chunk must be in-flight before we disconnect.
    // AIDEV-NOTE: inFlightWrites lives on the injected WriteChunker after the
    // cleanup-144 split; behavior is identical, only the owning object moved.
    const inFlight = (device as unknown as { writeChunker: { inFlightWrites: Map<symbol, unknown> } }).writeChunker.inFlightWrites;
    expect(inFlight.size).toBe(1);

    // Unexpected disconnect mid-transfer marks the in-flight write aborted.
    const disconnectHandler = (device as unknown as { handleDisconnect: () => void }).handleDisconnect.bind(device);
    (device as unknown as { intentionalDisconnect: boolean }).intentionalDisconnect = false;
    disconnectHandler();
    writeDeferred.reject(new Error('link dropped'));

    await assertion;
  });

  it('rejects all concurrent writes on disconnect and clears in-flight state', async () => {
    const firstDeferred = deferred<void>();
    const secondDeferred = deferred<void>();
    const { device, characteristic } = createConnectedDevice();
    await device.connect();

    let call = 0;
    characteristic.writeValueWithResponse = jest.fn(() => {
      call += 1;
      return call === 1 ? firstDeferred.promise : secondDeferred.promise;
    });

    const firstWrite = device.write('heart_rate', 'heart_rate_measurement', new Uint8Array([1]));
    const secondWrite = device.write('heart_rate', 'heart_rate_measurement', new Uint8Array([2]));
    // Attach rejection assertions before rejecting to keep handlers in place.
    const firstAssertion = expect(firstWrite).rejects.toMatchObject({ code: 'WRITE_INCOMPLETE' });
    const secondAssertion = expect(secondWrite).rejects.toMatchObject({ code: 'WRITE_INCOMPLETE' });
    // Guard the underlying hung promises against unhandled-rejection crashes.
    firstDeferred.promise.catch(() => undefined);
    secondDeferred.promise.catch(() => undefined);
    await flushPromises();

    // AIDEV-NOTE: inFlightWrites moved onto WriteChunker in the cleanup-144 split.
    const inFlight = (device as unknown as { writeChunker: { inFlightWrites: Map<symbol, unknown> } }).writeChunker.inFlightWrites;
    expect(inFlight.size).toBe(2);

    const disconnectHandler = (device as unknown as { handleDisconnect: () => void }).handleDisconnect.bind(device);
    (device as unknown as { intentionalDisconnect: boolean }).intentionalDisconnect = false;
    disconnectHandler();
    firstDeferred.reject(new Error('link dropped'));
    secondDeferred.reject(new Error('link dropped'));

    await firstAssertion;
    await secondAssertion;

    expect(inFlight.size).toBe(0);
  });
});

// SB-SDK-05 AC3 + AC4: every DOMException @beacio/core throws on the
// navigator.bluetooth path must carry a complete plain-English .message. The
// dominant real failure for a vanilla site (S&B) is forgetting to declare a
// service in requestDevice({ optionalServices }): WebKit then rejects
// getPrimaryService with a SecurityError, and today device.getService rethrows it
// as a GENERIC PERMISSION_DENIED BeacioError that DROPS the offending UUID — the
// one detail the operator needs to fix the call. This pins the remediation:
// getService must throw a SecurityError DOMException whose .message NAMES the
// in-scope service UUID and states it must be added to optionalServices (mirroring
// SUGGESTIONS.SERVICE_NOT_FOUND), with no leaked stack and no competitor name.
// AC4 control: the existing BeacioError.code/.suggestion mappings must NOT regress.
describe('SB-SDK-05 @beacio/core surfaces human DOMException messages on the bluetooth path', () => {
  // A custom 128-bit service UUID an operator would pass to requestDevice — not a
  // SIG-registered name — so getService reaches server.getPrimaryService (no cache
  // hit) and the canonical resolved form is what the message must name.
  const SB_SERVICE = '00000001-5354-4f52-5a26-4249434b454c';

  it('AC3: a missing-optionalServices SecurityError names the offending UUID + optionalServices remedy (no stack, no Bluefy)', async () => {
    const { device, getPrimaryService } = createConnectedDevice();
    await device.connect();

    // WebKit's real shape when a service is not in optionalServices: a
    // SecurityError DOMException with terse, jargon-laden, UUID-less text.
    getPrimaryService.mockImplementationOnce(() =>
      Promise.reject(
        new DOMException(
          `Origin is not allowed to access the service. Tip: Add the service UUID to 'optionalServices' in requestDevice() options. https://goo.gl/HxfxSQ`,
          'SecurityError'
        )
      )
    );

    let thrown: unknown;
    try {
      await device.read(SB_SERVICE, 'battery_level');
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(Error);
    const err = thrown as Error & { message: string; name: string };

    // (1) It is a SecurityError DOMException — the W3C-correct class the demo's
    // raw `catch` already special-cases — not flattened to a generic Error.
    expect(err.name).toBe('SecurityError');
    expect(err).toBeInstanceOf(DOMException);

    // (2) The message NAMES the offending service UUID in its canonical resolved
    // form (whatever case resolveUUID produces), so the operator knows WHICH
    // service to declare.
    const canonical = resolveUUID(SB_SERVICE);
    const haystack = err.message.toLowerCase();
    expect(haystack).toContain(canonical.toLowerCase());

    // (3) It states the optionalServices remedy in plain English.
    expect(err.message).toMatch(/optionalServices/);
    expect(err.message).toMatch(/requestDevice/);

    // (4) No leaked stack frames, no WebKit jargon dump, no competitor names.
    expect(err.message).not.toMatch(/Bluefy/i);
    expect(err.message).not.toContain('\n    at ');
    expect(err.message).not.toMatch(/goo\.gl|HxfxSQ/);
  });

  // AC6: drive the enumerated simulated failures through the real device.read()
  // seam (not just BeacioError.from in isolation) and assert the surfaced
  // error.toString() — what a raw catch(e){alert(e.toString())} would show — leaks
  // no stack frame and no competitor name. The native rejection deliberately
  // carries a multi-line stack + a competitor name + a native URL, mimicking
  // WebKit/the polyfill bridge.
  it('AC6: a dirty mid-operation disconnect surfaced by device.read() has a clean error.toString()', async () => {
    const dirtyDisconnect = new DOMException(
      "GATT Server is disconnected. via Bluefy https://webkit.example/x\n    at z (crafty.js:518:13)",
      'NetworkError'
    );
    const { device } = createConnectedDevice({ characteristicPromise: Promise.reject(dirtyDisconnect) });
    await device.connect();

    let thrown: unknown;
    try {
      await device.read('heart_rate', 'heart_rate_measurement');
    } catch (e) {
      thrown = e;
    }
    const str = (thrown as Error).toString();
    expect(str).not.toMatch(/Bluefy/i);
    expect(str).not.toContain('\n    at ');
    expect(str).not.toMatch(/\bat\s+\S+\.js:\d+:\d+/);
    expect(str).not.toContain('webkit://');
    expect(str).not.toContain('https://');
    expect(str).not.toContain('undefined');
  });

  it('AC4 (no regression): BeacioError.code/.suggestion mappings are unchanged', () => {
    // Spot-check the mappings SB-SDK-05 must not disturb while refining the
    // SecurityError message (these mirror errors.test.ts).
    const disconnected = new BeacioError('DEVICE_DISCONNECTED');
    expect(disconnected.code).toBe('DEVICE_DISCONNECTED');
    expect(disconnected.suggestion).toBe('Call device.connect() before performing GATT operations.');
    expect(disconnected.isRetriable).toBe(true);

    const serviceNotFound = new BeacioError('SERVICE_NOT_FOUND');
    expect(serviceNotFound.code).toBe('SERVICE_NOT_FOUND');
    expect(serviceNotFound.suggestion).toMatch(/requestDevice filters|service UUID/);

    // BeacioError.from still maps a plain SecurityError (with no service context)
    // to PERMISSION_DENIED — the general path is preserved.
    const generic = BeacioError.from(new DOMException('not allowed', 'SecurityError'));
    expect(generic.code).toBe('PERMISSION_DENIED');
  });
});

// ---------------------------------------------------------------------------
// SB-SDK-14 — BeacioDevice.onCharacteristicOverflow. The native bounded
// EventQueue surfaces evictions as a `beacio:overflow` CustomEvent dispatched on
// the W3C characteristic; this seam resolves that characteristic (via the same
// cached getCharacteristic lookup) and forwards the raw event to the listener.
// The returned unsubscribe detaches the listener. Uses a REAL EventTarget for
// the characteristic so add/remove/dispatch behave as in the browser.
// ---------------------------------------------------------------------------
describe('SB-SDK-14 — BeacioDevice.onCharacteristicOverflow', () => {
  function createOverflowDevice() {
    const characteristic = Object.assign(new EventTarget(), {
      uuid: '0000beef-0000-1000-8000-00805f9b34fb',
      readValue: jest.fn(() => Promise.resolve(new DataView(new Uint8Array([0]).buffer))),
    });
    const service = {
      uuid: '0000feed-0000-1000-8000-00805f9b34fb',
      getCharacteristic: jest.fn(() => Promise.resolve(characteristic)),
    };
    const server = {
      connected: true,
      disconnect: jest.fn(),
      getPrimaryService: jest.fn(() => Promise.resolve(service)),
      getPrimaryServices: jest.fn(() => Promise.resolve([service])),
    };
    const rawDevice = {
      id: 'device-overflow',
      name: 'Overflow Device',
      gatt: { connect: jest.fn(() => Promise.resolve(server)) },
      addEventListener: jest.fn(),
    } as unknown as ConstructorParameters<typeof BeacioDevice>[0];
    return { device: new BeacioDevice(rawDevice), characteristic };
  }

  it('forwards a beacio:overflow event on the characteristic to the listener exactly once', async () => {
    const { device, characteristic } = createOverflowDevice();
    await device.connect();

    const listener = jest.fn();
    device.onCharacteristicOverflow('0000feed-0000-1000-8000-00805f9b34fb', '0000beef-0000-1000-8000-00805f9b34fb', listener);
    await flushPromises();

    const event = new CustomEvent('beacio:overflow', { detail: { evictedCount: 7, queueCapacity: 64, seq: 1234, timestamp: 42 } });
    characteristic.dispatchEvent(event);

    expect(listener).toHaveBeenCalledTimes(1);
    const received = listener.mock.calls[0]?.[0] as CustomEvent;
    expect(received.type).toBe('beacio:overflow');
    expect(received.detail).toEqual({ evictedCount: 7, queueCapacity: 64, seq: 1234, timestamp: 42 });
  });

  it('the returned unsubscribe detaches the listener (no further calls)', async () => {
    const { device, characteristic } = createOverflowDevice();
    await device.connect();

    const listener = jest.fn();
    const off = device.onCharacteristicOverflow('0000feed-0000-1000-8000-00805f9b34fb', '0000beef-0000-1000-8000-00805f9b34fb', listener);
    await flushPromises();

    characteristic.dispatchEvent(new CustomEvent('beacio:overflow', { detail: { evictedCount: 1 } }));
    off();
    characteristic.dispatchEvent(new CustomEvent('beacio:overflow', { detail: { evictedCount: 2 } }));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribing before the characteristic resolves never attaches the listener', async () => {
    const { device, characteristic } = createOverflowDevice();
    await device.connect();

    const listener = jest.fn();
    const off = device.onCharacteristicOverflow('0000feed-0000-1000-8000-00805f9b34fb', '0000beef-0000-1000-8000-00805f9b34fb', listener);
    off(); // cancel before the async getCharacteristic resolves
    await flushPromises();

    characteristic.dispatchEvent(new CustomEvent('beacio:overflow', { detail: { evictedCount: 9 } }));

    expect(listener).not.toHaveBeenCalled();
  });
});

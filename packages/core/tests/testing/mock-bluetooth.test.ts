import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import {
  createMockBluetooth,
  installMockBluetooth,
  MockDescriptor,
  BLE_UUIDS,
  devices,
} from '../../src/testing';

describe('MockBluetooth', () => {
  let mock: ReturnType<typeof createMockBluetooth>;

  beforeEach(() => {
    mock = createMockBluetooth();
  });

  afterEach(() => {
    mock.reset();
  });

  test('reports availability', async () => {
    expect(await mock.getAvailability()).toBe(true);
    mock.setAvailable(false);
    expect(await mock.getAvailability()).toBe(false);
  });

  test('throws when Bluetooth unavailable', async () => {
    mock.setAvailable(false);
    await expect(mock.requestDevice()).rejects.toThrow('not available');
  });

  test('requestDevice finds matching device by service', async () => {
    mock.addDevice(devices.heartRate());
    const device = await mock.requestDevice({
      filters: [{ services: [BLE_UUIDS.services.HEART_RATE] }],
    });
    expect(device.name).toBe('Mock HR Sensor');
  });

  test('requestDevice throws when no match', async () => {
    mock.addDevice(devices.heartRate());
    await expect(
      mock.requestDevice({
        filters: [{ services: ['nonexistent-uuid'] }],
      })
    ).rejects.toThrow('No devices found');
  });

  test('requestDevice with acceptAllDevices returns all', async () => {
    mock.addDevice(devices.heartRate());
    mock.addDevice(devices.battery());
    const device = await mock.requestDevice({ acceptAllDevices: true });
    expect(device).toBeDefined();
  });

  test('getDevices returns registered devices', async () => {
    mock.addDevice(devices.heartRate());
    mock.addDevice(devices.battery());
    const allDevices = await mock.getDevices();
    expect(allDevices).toHaveLength(2);
  });

  test('filter by name prefix', async () => {
    mock.addDevice(devices.heartRate('Polar H10'));
    mock.addDevice(devices.battery('Samsung Watch'));
    const device = await mock.requestDevice({
      filters: [{ namePrefix: 'Polar' }],
    });
    expect(device.name).toBe('Polar H10');
  });

  test('reset clears all state', async () => {
    mock.addDevice(devices.heartRate());
    mock.reset();
    const allDevices = await mock.getDevices();
    expect(allDevices).toHaveLength(0);
    expect(await mock.getAvailability()).toBe(true);
  });
});

describe('MockBleDevice GATT operations', () => {
  let mock: ReturnType<typeof createMockBluetooth>;

  beforeEach(() => {
    mock = createMockBluetooth();
  });

  afterEach(() => {
    mock.reset();
  });

  test('connect and read characteristic', async () => {
    mock.addDevice(devices.heartRate());
    const btDevice = await mock.requestDevice({
      filters: [{ services: [BLE_UUIDS.services.HEART_RATE] }],
    });

    const server = await btDevice.gatt!.connect();
    expect(server.connected).toBe(true);

    const service = await server.getPrimaryService(
      BLE_UUIDS.services.HEART_RATE
    );
    const char = await service.getCharacteristic(
      BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT
    );
    const value = await char.readValue();
    expect(value.getUint8(1)).toBe(72); // 72 bpm
  });

  test('write characteristic stores value', async () => {
    const device = mock.addDevice({
      name: 'Write Test',
      serviceUUIDs: ['test-service'],
      services: [
        {
          uuid: 'test-service',
          characteristics: [
            {
              uuid: 'test-char',
              properties: { read: true, write: true },
              value: new Uint8Array([0]),
            },
          ],
        },
      ],
    });

    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService('test-service');
    const char = await service.getCharacteristic('test-char');

    await char.writeValue(new Uint8Array([42]).buffer);
    const value = await char.readValue();
    expect(value.getUint8(0)).toBe(42);
  });

  test('notification pump delivers events', async () => {
    const device = mock.addDevice(devices.heartRate());
    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();

    const service = await btDevice.gatt!.getPrimaryService(
      BLE_UUIDS.services.HEART_RATE
    );
    const char = await service.getCharacteristic(
      BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT
    );

    await char.startNotifications();

    const received: number[] = [];
    char.addEventListener('characteristicvaluechanged', ((event: Event) => {
      const target = (event as Event & { target: { value: DataView } }).target;
      received.push(target.value.getUint8(1));
    }) as EventListener);

    // Pump notifications via mock device
    const mockChar = device.gatt
      .getService(BLE_UUIDS.services.HEART_RATE)
      ?.getChar(BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT);

    mockChar!.emitNotification(new Uint8Array([0x00, 80]));
    mockChar!.emitNotification(new Uint8Array([0x00, 85]));
    mockChar!.emitNotification(new Uint8Array([0x00, 90]));

    expect(received).toEqual([80, 85, 90]);
  });

  test('disconnect emits event', async () => {
    const device = mock.addDevice(devices.heartRate());
    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();

    let disconnected = false;
    btDevice.addEventListener('gattserverdisconnected', () => {
      disconnected = true;
    });

    device.simulateDisconnect();
    expect(disconnected).toBe(true);
    expect(btDevice.gatt!.connected).toBe(false);
  });

  test('GATT operations throw when disconnected', async () => {
    const device = mock.addDevice(devices.heartRate());
    const btDevice = device.asBluetoothDevice();

    // Not connected yet — getPrimaryService should throw
    await expect(
      btDevice.gatt!.getPrimaryService(BLE_UUIDS.services.HEART_RATE)
    ).rejects.toThrow('disconnected');
  });

  test('service not found throws', async () => {
    const device = mock.addDevice(devices.heartRate());
    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();

    await expect(
      btDevice.gatt!.getPrimaryService('nonexistent')
    ).rejects.toThrow('No Services matching');
  });

  test('read on non-readable characteristic throws', async () => {
    const device = mock.addDevice({
      name: 'No Read',
      serviceUUIDs: ['svc'],
      services: [
        {
          uuid: 'svc',
          characteristics: [
            {
              uuid: 'chr',
              properties: { read: false, notify: true },
            },
          ],
        },
      ],
    });

    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService('svc');
    const char = await service.getCharacteristic('chr');

    await expect(char.readValue()).rejects.toThrow('does not support read');
  });
});

describe('installMockBluetooth', () => {
  test('installs on navigator.bluetooth', () => {
    const mock = installMockBluetooth({ available: true });
    expect((navigator as { bluetooth?: object }).bluetooth).toBe(mock);
    mock.uninstall();
    mock.reset();
  });

  test('mock.install and uninstall restore navigator.bluetooth', () => {
    const original = (navigator as { bluetooth?: object }).bluetooth;
    const mock = createMockBluetooth();

    mock.install();
    expect((navigator as { bluetooth?: object }).bluetooth).toBe(mock);

    mock.uninstall();
    expect((navigator as { bluetooth?: object }).bluetooth).toBe(original);
  });
});

describe('Advertisement simulation', () => {
  let mock: ReturnType<typeof createMockBluetooth>;

  beforeEach(() => {
    mock = createMockBluetooth();
  });

  afterEach(() => {
    mock.reset();
  });

  test('requestLEScan receives matching advertisement events', async () => {
    const matching = mock.addDevice(devices.heartRate('Polar H10'));
    const other = mock.addDevice(devices.battery('Battery Pack'));
    const events: Array<{ name: string | undefined | null; rssi: number | undefined }> = [];

    mock.addEventListener('advertisementreceived', ((event: Event) => {
      const adv = event as Event & {
        device?: BluetoothDevice;
        rssi?: number;
      };
      events.push({ name: adv.device?.name, rssi: adv.rssi });
    }) as EventListener);

    const scan = await mock.requestLEScan({
      filters: [{ services: [BLE_UUIDS.services.HEART_RATE] }],
      keepRepeatedDevices: true,
    });

    other.emitAdvertisement({ rssi: -80 });
    matching.emitAdvertisement({ rssi: -44 });

    expect(scan.keepRepeatedDevices).toBe(true);
    expect(events).toEqual([{ name: 'Polar H10', rssi: -44 }]);

    scan.stop();
    expect((scan as { active: boolean }).active).toBe(false);
  });

  test('watchAdvertisements receives per-device advertisement events', async () => {
    const device = mock.addDevice(devices.heartRate('Polar H10'));
    const btDevice = device.asBluetoothDevice();
    const seen: number[] = [];

    btDevice.addEventListener('advertisementreceived', ((event: Event) => {
      const adv = event as Event & { rssi?: number };
      seen.push(adv.rssi ?? 0);
    }) as EventListener);

    await btDevice.watchAdvertisements();
    expect((btDevice as unknown as { watchingAdvertisements: boolean; unwatchAdvertisements: () => Promise<void> }).watchingAdvertisements).toBe(true);

    device.emitAdvertisement({ rssi: -51 });
    device.emitAdvertisement({ rssi: -49 });
    expect(seen).toEqual([-51, -49]);

    await (btDevice as unknown as { watchingAdvertisements: boolean; unwatchAdvertisements: () => Promise<void> }).unwatchAdvertisements();
    device.emitAdvertisement({ rssi: -47 });
    expect((btDevice as unknown as { watchingAdvertisements: boolean; unwatchAdvertisements: () => Promise<void> }).watchingAdvertisements).toBe(false);
    expect(seen).toEqual([-51, -49]);
  });
});

describe('MockDescriptor', () => {
  let mock: ReturnType<typeof createMockBluetooth>;

  beforeEach(() => {
    mock = createMockBluetooth();
  });

  afterEach(() => {
    mock.reset();
  });

  test('getDescriptor returns matching descriptor', async () => {
    const device = mock.addDevice({
      name: 'Desc Test',
      serviceUUIDs: ['svc'],
      services: [
        {
          uuid: 'svc',
          characteristics: [
            {
              uuid: 'chr',
              properties: { read: true },
              descriptors: [
                {
                  uuid: BLE_UUIDS.descriptors.CCCD,
                  value: new Uint8Array([0x01, 0x00]),
                },
              ],
            },
          ],
        },
      ],
    });

    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService('svc');
    const char = await service.getCharacteristic('chr');
    const desc = await char.getDescriptor(BLE_UUIDS.descriptors.CCCD);
    expect(desc.uuid).toBe(BLE_UUIDS.descriptors.CCCD);
    const value = await desc.readValue();
    expect(value.getUint8(0)).toBe(0x01);
  });

  test('getDescriptor throws NotFoundError for missing descriptor', async () => {
    const device = mock.addDevice({
      name: 'No Desc',
      serviceUUIDs: ['svc'],
      services: [
        {
          uuid: 'svc',
          characteristics: [
            {
              uuid: 'chr',
              properties: { read: true },
            },
          ],
        },
      ],
    });

    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService('svc');
    const char = await service.getCharacteristic('chr');

    await expect(char.getDescriptor('nonexistent')).rejects.toThrow(
      'No Descriptors matching'
    );
    try {
      await char.getDescriptor('nonexistent');
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException);
      expect((e as DOMException).name).toBe('NotFoundError');
    }
  });

  test('getDescriptors returns all descriptors', async () => {
    const device = mock.addDevice({
      name: 'Multi Desc',
      serviceUUIDs: ['svc'],
      services: [
        {
          uuid: 'svc',
          characteristics: [
            {
              uuid: 'chr',
              properties: { read: true },
              descriptors: [
                { uuid: BLE_UUIDS.descriptors.CCCD, value: new Uint8Array([0]) },
                { uuid: BLE_UUIDS.descriptors.USER_DESCRIPTION, value: new Uint8Array([72, 82]) },
              ],
            },
          ],
        },
      ],
    });

    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService('svc');
    const char = await service.getCharacteristic('chr');
    const descs = await char.getDescriptors();
    expect(descs).toHaveLength(2);
  });

  test('getDescriptors with filter returns matching only', async () => {
    const device = mock.addDevice({
      name: 'Filter Desc',
      serviceUUIDs: ['svc'],
      services: [
        {
          uuid: 'svc',
          characteristics: [
            {
              uuid: 'chr',
              properties: { read: true },
              descriptors: [
                { uuid: BLE_UUIDS.descriptors.CCCD },
                { uuid: BLE_UUIDS.descriptors.USER_DESCRIPTION },
              ],
            },
          ],
        },
      ],
    });

    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService('svc');
    const char = await service.getCharacteristic('chr');
    const descs = await char.getDescriptors(BLE_UUIDS.descriptors.CCCD);
    expect(descs).toHaveLength(1);
    expect(descs[0].uuid).toBe(BLE_UUIDS.descriptors.CCCD);
  });

  test('descriptor writeValue stores data', async () => {
    const device = mock.addDevice({
      name: 'Write Desc',
      serviceUUIDs: ['svc'],
      services: [
        {
          uuid: 'svc',
          characteristics: [
            {
              uuid: 'chr',
              properties: { read: true },
              descriptors: [
                { uuid: BLE_UUIDS.descriptors.CCCD, value: new Uint8Array([0x00, 0x00]) },
              ],
            },
          ],
        },
      ],
    });

    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService('svc');
    const char = await service.getCharacteristic('chr');
    const desc = await char.getDescriptor(BLE_UUIDS.descriptors.CCCD);

    await desc.writeValue(new Uint8Array([0x01, 0x00]).buffer);
    const value = await desc.readValue();
    expect(value.getUint8(0)).toBe(0x01);
  });

  test('MockDescriptor.setValue updates value via test control', () => {
    const desc = new MockDescriptor({
      uuid: BLE_UUIDS.descriptors.CCCD,
      value: new Uint8Array([0]),
    });
    expect(desc.value.getUint8(0)).toBe(0);
    desc.setValue(new Uint8Array([0xff]));
    expect(desc.value.getUint8(0)).toBe(0xff);
  });
});

describe('Characteristic properties and write variants', () => {
  let mock: ReturnType<typeof createMockBluetooth>;

  beforeEach(() => {
    mock = createMockBluetooth();
  });

  afterEach(() => {
    mock.reset();
  });

  test('full characteristic properties are exposed', async () => {
    const device = mock.addDevice({
      name: 'Props Test',
      serviceUUIDs: ['svc'],
      services: [
        {
          uuid: 'svc',
          characteristics: [
            {
              uuid: 'chr',
              properties: {
                broadcast: true,
                read: true,
                write: true,
                writeWithoutResponse: true,
                notify: true,
                indicate: true,
                authenticatedSignedWrites: true,
                reliableWrite: true,
                writableAuxiliaries: true,
              },
            },
          ],
        },
      ],
    });

    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService('svc');
    const char = await service.getCharacteristic('chr');

    expect(char.properties.broadcast).toBe(true);
    expect(char.properties.read).toBe(true);
    expect(char.properties.write).toBe(true);
    expect(char.properties.writeWithoutResponse).toBe(true);
    expect(char.properties.notify).toBe(true);
    expect(char.properties.indicate).toBe(true);
    expect(char.properties.authenticatedSignedWrites).toBe(true);
    expect(char.properties.reliableWrite).toBe(true);
    expect(char.properties.writableAuxiliaries).toBe(true);
  });

  test('properties default to false except read', async () => {
    const device = mock.addDevice({
      name: 'Defaults',
      serviceUUIDs: ['svc'],
      services: [
        {
          uuid: 'svc',
          characteristics: [{ uuid: 'chr' }],
        },
      ],
    });

    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService('svc');
    const char = await service.getCharacteristic('chr');

    expect(char.properties.read).toBe(true);
    expect(char.properties.write).toBe(false);
    expect(char.properties.writeWithoutResponse).toBe(false);
    expect(char.properties.notify).toBe(false);
    expect(char.properties.indicate).toBe(false);
    expect(char.properties.broadcast).toBe(false);
    expect(char.properties.authenticatedSignedWrites).toBe(false);
    expect(char.properties.reliableWrite).toBe(false);
    expect(char.properties.writableAuxiliaries).toBe(false);
  });

  test('writeValueWithResponse throws NotSupportedError without write property', async () => {
    const device = mock.addDevice({
      name: 'No Write',
      serviceUUIDs: ['svc'],
      services: [
        {
          uuid: 'svc',
          characteristics: [
            { uuid: 'chr', properties: { read: true, write: false } },
          ],
        },
      ],
    });

    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService('svc');
    const char = await service.getCharacteristic('chr');

    try {
      await char.writeValueWithResponse(new Uint8Array([1]).buffer);
      throw new Error('Expected DOMException to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException);
      expect((e as DOMException).name).toBe('NotSupportedError');
    }
  });

  test('writeValueWithoutResponse throws NotSupportedError without writeWithoutResponse property', async () => {
    const device = mock.addDevice({
      name: 'No WWR',
      serviceUUIDs: ['svc'],
      services: [
        {
          uuid: 'svc',
          characteristics: [
            { uuid: 'chr', properties: { read: true, write: true, writeWithoutResponse: false } },
          ],
        },
      ],
    });

    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService('svc');
    const char = await service.getCharacteristic('chr');

    try {
      await char.writeValueWithoutResponse(new Uint8Array([1]).buffer);
      throw new Error('Expected DOMException to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException);
      expect((e as DOMException).name).toBe('NotSupportedError');
    }
  });

  test('writeValueWithResponse succeeds with write property', async () => {
    const device = mock.addDevice({
      name: 'Write OK',
      serviceUUIDs: ['svc'],
      services: [
        {
          uuid: 'svc',
          characteristics: [
            { uuid: 'chr', properties: { read: true, write: true }, value: new Uint8Array([0]) },
          ],
        },
      ],
    });

    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService('svc');
    const char = await service.getCharacteristic('chr');

    await char.writeValueWithResponse(new Uint8Array([99]).buffer);
    const value = await char.readValue();
    expect(value.getUint8(0)).toBe(99);
  });

  test('writeValueWithoutResponse succeeds with writeWithoutResponse property', async () => {
    const device = mock.addDevice({
      name: 'WWR OK',
      serviceUUIDs: ['svc'],
      services: [
        {
          uuid: 'svc',
          characteristics: [
            { uuid: 'chr', properties: { read: true, writeWithoutResponse: true }, value: new Uint8Array([0]) },
          ],
        },
      ],
    });

    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService('svc');
    const char = await service.getCharacteristic('chr');

    await char.writeValueWithoutResponse(new Uint8Array([55]).buffer);
    const value = await char.readValue();
    expect(value.getUint8(0)).toBe(55);
  });

  test('startNotifications throws NotSupportedError without notify/indicate', async () => {
    const device = mock.addDevice({
      name: 'No Notify',
      serviceUUIDs: ['svc'],
      services: [
        {
          uuid: 'svc',
          characteristics: [
            { uuid: 'chr', properties: { read: true, notify: false, indicate: false } },
          ],
        },
      ],
    });

    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService('svc');
    const char = await service.getCharacteristic('chr');

    try {
      await char.startNotifications();
      throw new Error('Expected DOMException to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException);
      expect((e as DOMException).name).toBe('NotSupportedError');
    }
  });
});

describe('DOMException error names', () => {
  let mock: ReturnType<typeof createMockBluetooth>;

  beforeEach(() => {
    mock = createMockBluetooth();
  });

  afterEach(() => {
    mock.reset();
  });

  test('GATT operations throw NetworkError when disconnected', async () => {
    const device = mock.addDevice(devices.heartRate());
    const btDevice = device.asBluetoothDevice();

    try {
      await btDevice.gatt!.getPrimaryService(BLE_UUIDS.services.HEART_RATE);
      throw new Error('Expected DOMException to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException);
      expect((e as DOMException).name).toBe('NetworkError');
    }
  });

  test('missing service throws NotFoundError', async () => {
    const device = mock.addDevice(devices.heartRate());
    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();

    try {
      await btDevice.gatt!.getPrimaryService('nonexistent');
      throw new Error('Expected DOMException to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException);
      expect((e as DOMException).name).toBe('NotFoundError');
    }
  });

  test('missing characteristic throws NotFoundError', async () => {
    const device = mock.addDevice(devices.heartRate());
    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService(
      BLE_UUIDS.services.HEART_RATE
    );

    try {
      await service.getCharacteristic('nonexistent');
      throw new Error('Expected DOMException to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException);
      expect((e as DOMException).name).toBe('NotFoundError');
    }
  });

  test('read on non-readable throws NotSupportedError', async () => {
    const device = mock.addDevice({
      name: 'No Read',
      serviceUUIDs: ['svc'],
      services: [
        {
          uuid: 'svc',
          characteristics: [
            { uuid: 'chr', properties: { read: false, write: true } },
          ],
        },
      ],
    });

    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();
    const service = await btDevice.gatt!.getPrimaryService('svc');
    const char = await service.getCharacteristic('chr');

    try {
      await char.readValue();
      throw new Error('Expected DOMException to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException);
      expect((e as DOMException).name).toBe('NotSupportedError');
    }
  });
});

describe('device factories', () => {
  test('heartRate factory produces valid config', () => {
    const config = devices.heartRate();
    expect(config.name).toBe('Mock HR Sensor');
    expect(config.serviceUUIDs).toContain(BLE_UUIDS.services.HEART_RATE);
    expect(config.services![0].characteristics).toHaveLength(2);
  });

  test('battery factory produces valid config', () => {
    const config = devices.battery();
    expect(config.name).toBe('Mock Battery Device');
    expect(config.services![0].characteristics).toHaveLength(1);
  });

  test('full factory has multiple services', () => {
    const config = devices.full();
    expect(config.services).toHaveLength(3);
    expect(config.serviceUUIDs).toHaveLength(3);
  });
});

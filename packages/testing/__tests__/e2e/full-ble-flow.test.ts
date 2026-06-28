import {
  createMockBluetooth,
  MockBluetooth,
  MockBleDevice,
  BLE_UUIDS,
  devices,
} from '../../src';

describe('E2E: Full BLE Flow', () => {
  let mock: MockBluetooth;

  beforeEach(() => {
    mock = createMockBluetooth();
  });

  afterEach(() => {
    mock.reset();
  });

  describe('Heart Rate Monitor Lifecycle', () => {
    test('discover → connect → read → notify → disconnect', async () => {
      const device = mock.addDevice(devices.heartRate());

      // Discover
      const btDevice = await mock.requestDevice({
        filters: [{ services: [BLE_UUIDS.services.HEART_RATE] }],
      });
      expect(btDevice.name).toBe('Mock HR Sensor');

      // Connect
      const server = await btDevice.gatt!.connect();
      expect(server.connected).toBe(true);

      // Get service + characteristic
      const service = await server.getPrimaryService(BLE_UUIDS.services.HEART_RATE);
      const char = await service.getCharacteristic(
        BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT
      );

      // Read initial value
      const initial = await char.readValue();
      expect(initial.getUint8(1)).toBe(72);

      // Start notifications
      await char.startNotifications();
      const readings: number[] = [];
      char.addEventListener('characteristicvaluechanged', ((e: Event) => {
        readings.push((e as any).target.value.getUint8(1));
      }) as EventListener);

      // Pump heart rate values
      const mockChar = device.gatt
        .getService(BLE_UUIDS.services.HEART_RATE)!
        .getChar(BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT)!;

      mockChar.emitNotification(new Uint8Array([0x00, 75]));
      mockChar.emitNotification(new Uint8Array([0x00, 80]));
      mockChar.emitNotification(new Uint8Array([0x00, 85]));

      expect(readings).toEqual([75, 80, 85]);

      // Disconnect
      let disconnected = false;
      btDevice.addEventListener('gattserverdisconnected', () => {
        disconnected = true;
      });
      device.simulateDisconnect();

      expect(disconnected).toBe(true);
      expect(server.connected).toBe(false);
    });

    test('read body sensor location', async () => {
      const device = mock.addDevice(devices.heartRate());
      const btDevice = device.asBluetoothDevice();
      await btDevice.gatt!.connect();

      const service = await btDevice.gatt!.getPrimaryService(BLE_UUIDS.services.HEART_RATE);
      const char = await service.getCharacteristic(
        BLE_UUIDS.characteristics.BODY_SENSOR_LOCATION
      );
      const value = await char.readValue();
      expect(value.getUint8(0)).toBe(1); // Chest
    });
  });

  describe('Multi-Device', () => {
    test('connect two devices sequentially', async () => {
      const hrDevice = mock.addDevice(devices.heartRate());
      const battDevice = mock.addDevice(devices.battery());

      // Connect heart rate
      const hrBt = await mock.requestDevice({
        filters: [{ services: [BLE_UUIDS.services.HEART_RATE] }],
      });
      const hrServer = await hrBt.gatt!.connect();
      expect(hrServer.connected).toBe(true);

      // Connect battery
      const battBt = await mock.requestDevice({
        filters: [{ services: [BLE_UUIDS.services.BATTERY] }],
      });
      const battServer = await battBt.gatt!.connect();
      expect(battServer.connected).toBe(true);

      // Read from both
      const hrService = await hrServer.getPrimaryService(BLE_UUIDS.services.HEART_RATE);
      const hrChar = await hrService.getCharacteristic(
        BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT
      );
      const hrValue = await hrChar.readValue();
      expect(hrValue.getUint8(1)).toBe(72);

      const battService = await battServer.getPrimaryService(BLE_UUIDS.services.BATTERY);
      const battChar = await battService.getCharacteristic(
        BLE_UUIDS.characteristics.BATTERY_LEVEL
      );
      const battValue = await battChar.readValue();
      expect(battValue.getUint8(0)).toBe(85);

      // Disconnect one, other stays connected
      hrDevice.simulateDisconnect();
      expect(hrServer.connected).toBe(false);
      expect(battServer.connected).toBe(true);
    });

    test('full device with multiple services', async () => {
      mock.addDevice(devices.full());
      const btDevice = await mock.requestDevice({ acceptAllDevices: true });
      const server = await btDevice.gatt!.connect();

      // Access all three services
      const hrService = await server.getPrimaryService(BLE_UUIDS.services.HEART_RATE);
      const battService = await server.getPrimaryService(BLE_UUIDS.services.BATTERY);
      const infoService = await server.getPrimaryService(BLE_UUIDS.services.DEVICE_INFO);

      expect(hrService).toBeDefined();
      expect(battService).toBeDefined();
      expect(infoService).toBeDefined();

      // Read manufacturer name
      const mfgChar = await infoService.getCharacteristic(
        BLE_UUIDS.characteristics.MANUFACTURER_NAME
      );
      const mfgValue = await mfgChar.readValue();
      const bytes = new Uint8Array(mfgValue.buffer);
      const name = String.fromCharCode(...bytes);
      expect(name).toBe('Beacio Test Corp');
    });

    test('two peers can advertise independently while one remains connected', async () => {
      const connectedPeer = mock.addDevice(devices.heartRate('Connected Peer'));
      const beaconPeer = mock.addDevice(devices.battery('Beacon Peer'));
      const seen: string[] = [];

      mock.addEventListener('advertisementreceived', ((event: Event) => {
        const adv = event as Event & { device?: BluetoothDevice };
        if (adv.device?.name) {
          seen.push(adv.device.name);
        }
      }) as EventListener);

      const scan = await mock.requestLEScan({ acceptAllAdvertisements: true });

      const btDevice = connectedPeer.asBluetoothDevice();
      const server = await btDevice.gatt!.connect();
      expect(server.connected).toBe(true);

      beaconPeer.emitAdvertisement({ rssi: -62 });
      connectedPeer.emitAdvertisement({ rssi: -47 });

      expect(seen).toEqual(['Beacon Peer', 'Connected Peer']);
      expect(server.connected).toBe(true);

      scan.stop();
    });
  });

  describe('Error Handling', () => {
    test('bluetooth unavailable throws NotFoundError', async () => {
      mock.setAvailable(false);
      await expect(
        mock.requestDevice({ acceptAllDevices: true })
      ).rejects.toThrow('not available');
    });

    test('device not found throws NotFoundError', async () => {
      await expect(
        mock.requestDevice({
          filters: [{ services: ['nonexistent-service'] }],
        })
      ).rejects.toThrow('No devices found');
    });

    test('disconnect during GATT operation', async () => {
      const device = mock.addDevice(devices.heartRate());
      const btDevice = device.asBluetoothDevice();
      await btDevice.gatt!.connect();

      // Disconnect
      device.simulateDisconnect();

      // GATT operations should fail
      await expect(
        btDevice.gatt!.getPrimaryService(BLE_UUIDS.services.HEART_RATE)
      ).rejects.toThrow('disconnected');
    });

    test('service not found after connect', async () => {
      const device = mock.addDevice(devices.heartRate());
      const btDevice = device.asBluetoothDevice();
      await btDevice.gatt!.connect();

      await expect(
        btDevice.gatt!.getPrimaryService(BLE_UUIDS.services.BATTERY)
      ).rejects.toThrow('No Services matching');
    });

    test('characteristic not found', async () => {
      const device = mock.addDevice(devices.heartRate());
      const btDevice = device.asBluetoothDevice();
      await btDevice.gatt!.connect();
      const service = await btDevice.gatt!.getPrimaryService(BLE_UUIDS.services.HEART_RATE);

      await expect(
        service.getCharacteristic('nonexistent-char')
      ).rejects.toThrow('No Characteristics matching');
    });
  });

  describe('Write Operations', () => {
    test('write and read-back', async () => {
      const device = mock.addDevice({
        name: 'Writable Device',
        serviceUUIDs: ['test-svc'],
        services: [
          {
            uuid: 'test-svc',
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
      const service = await btDevice.gatt!.getPrimaryService('test-svc');
      const char = await service.getCharacteristic('test-char');

      // Write
      await char.writeValue(new Uint8Array([0xAB, 0xCD]).buffer);

      // Read back
      const value = await char.readValue();
      expect(value.getUint8(0)).toBe(0xAB);
      expect(value.getUint8(1)).toBe(0xCD);
    });

    test('writeValueWithResponse', async () => {
      const device = mock.addDevice({
        name: 'Write Response Device',
        serviceUUIDs: ['svc'],
        services: [
          {
            uuid: 'svc',
            characteristics: [
              {
                uuid: 'chr',
                properties: { read: true, write: true },
                value: new Uint8Array([0]),
              },
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

    test('write to non-writable characteristic throws', async () => {
      const device = mock.addDevice(devices.heartRate());
      const btDevice = device.asBluetoothDevice();
      await btDevice.gatt!.connect();
      const service = await btDevice.gatt!.getPrimaryService(BLE_UUIDS.services.HEART_RATE);
      const char = await service.getCharacteristic(
        BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT
      );

      await expect(
        char.writeValue(new Uint8Array([0]).buffer)
      ).rejects.toThrow('does not support write');
    });
  });
});

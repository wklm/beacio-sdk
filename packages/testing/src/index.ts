/**
 * @beacio/testing — Mock Bluetooth API for testing BLE web apps
 *
 * Provides stateful mocks for the Web Bluetooth API:
 * - MockBluetooth: drop-in replacement for navigator.bluetooth
 * - MockBleDevice: stateful device with GATT services/characteristics
 * - MockCharacteristic: value simulation and notification pump
 * - Advertisement simulation for requestLEScan/watchAdvertisements tests
 *
 * Usage:
 *   import { createMockBluetooth, installMockBluetooth } from '@beacio/testing'
 *
 *   // Option A: Create and install on navigator.bluetooth
 *   const mock = installMockBluetooth({ available: true })
 *
 *   // Option B: Create without installing (for custom setups)
 *   const mock = createMockBluetooth()
 *
 *   // Add test devices
 *   const device = mock.addDevice({
 *     name: 'HR Sensor',
 *     failConnectAttempts: 1,
 *     writeLimits: { withResponse: 20, mtu: 23 },
 *     serviceUUIDs: ['0000180d-0000-1000-8000-00805f9b34fb'],
 *     services: [{
 *       uuid: '0000180d-0000-1000-8000-00805f9b34fb',
 *       characteristics: [{
 *         uuid: '00002a37-0000-1000-8000-00805f9b34fb',
 *         properties: { notify: true, read: true },
 *         value: new Uint8Array([0x00, 72]),
 *       }],
 *     }],
 *   })
 *
 *   // Pump notifications in tests
 *   const char = device.gatt.getService('0000180d-...')?.getChar('00002a37-...')
 *   char?.emitNotification(new Uint8Array([0x00, 80]))
 *
 *   // Emit advertisements for scan/beacon-style tests
 *   device.emitAdvertisement({ rssi: -42 })
 *
 *   // Reset between tests
 *   mock.reset()
 */

export {
  MockBluetooth,
  createMockBluetooth,
  installMockBluetooth,
  type MockBluetoothOptions,
  type MockAdvertisementOptions,
} from './mocks/bluetooth';

export {
  MockBleDevice,
  type MockDeviceOptions,
} from './mocks/device';

export {
  MockGATTServer,
  MockService,
  MockCharacteristic,
  MockDescriptor,
  type MockServiceConfig,
  type MockCharacteristicConfig,
  type MockDescriptorConfig,
} from './mocks/characteristics';

/** Common Bluetooth SIG UUIDs for test convenience */
export const BLE_UUIDS = {
  services: {
    HEART_RATE: '0000180d-0000-1000-8000-00805f9b34fb',
    BATTERY: '0000180f-0000-1000-8000-00805f9b34fb',
    DEVICE_INFO: '0000180a-0000-1000-8000-00805f9b34fb',
    ENVIRONMENTAL_SENSING: '0000181a-0000-1000-8000-00805f9b34fb',
  },
  characteristics: {
    HEART_RATE_MEASUREMENT: '00002a37-0000-1000-8000-00805f9b34fb',
    BODY_SENSOR_LOCATION: '00002a38-0000-1000-8000-00805f9b34fb',
    BATTERY_LEVEL: '00002a19-0000-1000-8000-00805f9b34fb',
    MANUFACTURER_NAME: '00002a29-0000-1000-8000-00805f9b34fb',
    MODEL_NUMBER: '00002a24-0000-1000-8000-00805f9b34fb',
    TEMPERATURE: '00002a6e-0000-1000-8000-00805f9b34fb',
  },
  descriptors: {
    /** Client Characteristic Configuration Descriptor */
    CCCD: '00002902-0000-1000-8000-00805f9b34fb',
    /** Characteristic User Description */
    USER_DESCRIPTION: '00002901-0000-1000-8000-00805f9b34fb',
    /** Characteristic Presentation Format */
    PRESENTATION_FORMAT: '00002904-0000-1000-8000-00805f9b34fb',
  },
} as const;

/** Pre-configured device factories for common test scenarios */
export const devices = {
  /** Heart rate sensor with notification support */
  heartRate(name = 'Mock HR Sensor'): import('./mocks/device').MockDeviceOptions {
    return {
      name,
      serviceUUIDs: [BLE_UUIDS.services.HEART_RATE],
      services: [
        {
          uuid: BLE_UUIDS.services.HEART_RATE,
          characteristics: [
            {
              uuid: BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT,
              properties: { read: true, notify: true },
              value: new Uint8Array([0x00, 72]), // 72 bpm
            },
            {
              uuid: BLE_UUIDS.characteristics.BODY_SENSOR_LOCATION,
              properties: { read: true },
              value: new Uint8Array([1]), // Chest
            },
          ],
        },
      ],
    };
  },

  /** Battery service device */
  battery(name = 'Mock Battery Device'): import('./mocks/device').MockDeviceOptions {
    return {
      name,
      serviceUUIDs: [BLE_UUIDS.services.BATTERY],
      services: [
        {
          uuid: BLE_UUIDS.services.BATTERY,
          characteristics: [
            {
              uuid: BLE_UUIDS.characteristics.BATTERY_LEVEL,
              properties: { read: true, notify: true },
              value: new Uint8Array([85]), // 85%
            },
          ],
        },
      ],
    };
  },

  /** Device with multiple services */
  full(name = 'Mock Full Device'): import('./mocks/device').MockDeviceOptions {
    return {
      name,
      serviceUUIDs: [
        BLE_UUIDS.services.HEART_RATE,
        BLE_UUIDS.services.BATTERY,
        BLE_UUIDS.services.DEVICE_INFO,
      ],
      services: [
        {
          uuid: BLE_UUIDS.services.HEART_RATE,
          characteristics: [
            {
              uuid: BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT,
              properties: { read: true, notify: true },
              value: new Uint8Array([0x00, 72]),
            },
          ],
        },
        {
          uuid: BLE_UUIDS.services.BATTERY,
          characteristics: [
            {
              uuid: BLE_UUIDS.characteristics.BATTERY_LEVEL,
              properties: { read: true, notify: true },
              value: new Uint8Array([100]),
            },
          ],
        },
        {
          uuid: BLE_UUIDS.services.DEVICE_INFO,
          characteristics: [
            {
              uuid: BLE_UUIDS.characteristics.MANUFACTURER_NAME,
              properties: { read: true },
              value: Uint8Array.from(Array.from('Beacio Test Corp').map(c => c.charCodeAt(0))),
            },
            {
              uuid: BLE_UUIDS.characteristics.MODEL_NUMBER,
              properties: { read: true },
              value: Uint8Array.from(Array.from('WBT-001').map(c => c.charCodeAt(0))),
            },
          ],
        },
      ],
    };
  },
};

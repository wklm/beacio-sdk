/**
 * Mock Bluetooth API — drop-in replacement for navigator.bluetooth
 *
 * Provides a stateful mock that tracks devices, manages connections,
 * and can be configured for various test scenarios.
 */

import {
  MockBleDevice,
  type MockAdvertisementOptions,
  type MockDeviceOptions,
} from './device';
import type {
  MockCharacteristicConfig,
  MockServiceConfig,
} from './characteristics';

export interface MockBluetoothOptions {
  /** Whether Bluetooth is available (default: true) */
  available?: boolean;
  /** Pre-registered devices that will appear in scans */
  devices?: MockDeviceOptions[];
}

const unsupportedExtensionApi = (): Promise<never> =>
  Promise.reject(new DOMException('Beacio extension API not implemented in MockBluetooth', 'NotSupportedError'));

const noop = (): void => {};

export class MockBluetooth {
  private _available: boolean;
  private _devices: Map<string, MockBleDevice> = new Map();
  private _listeners: Map<string, Set<EventListener>> = new Map();
  private _scanActive = false;
  private _installedNavigatorBluetooth?: unknown;
  private _lastScanOptions?: BluetoothLEScanOptions;

  readonly backgroundSync = {
    requestPermission: unsupportedExtensionApi,
    requestBackgroundConnection: unsupportedExtensionApi,
    registerCharacteristicNotifications: unsupportedExtensionApi,
    registerBeaconScanning: unsupportedExtensionApi,
    getRegistrations: unsupportedExtensionApi,
    unregister: unsupportedExtensionApi,
    update: unsupportedExtensionApi,
    connect: unsupportedExtensionApi,
    subscribe: unsupportedExtensionApi,
    scan: unsupportedExtensionApi,
    list: unsupportedExtensionApi,
    destroy: noop,
  };

  readonly peripheral = {
    advertising: false,
    advertise: unsupportedExtensionApi,
    stopAdvertising: unsupportedExtensionApi,
    send: unsupportedExtensionApi,
    destroy: noop,
    addEventListener: noop,
    removeEventListener: noop,
    onwriterequest: null,
    onsubscriptionchange: null,
    onconnectionstatechange: null,
    onadvertisingstatechange: null,
  };

  constructor(options: MockBluetoothOptions = {}) {
    this._available = options.available ?? true;
    if (options.devices) {
      for (const opts of options.devices) {
        const device = new MockBleDevice(opts);
        device.setAdvertisementSink(this._handleAdvertisement);
        this._devices.set(device.id, device);
      }
    }
  }

  // --- Public API (matches navigator.bluetooth) ---

  async getAvailability(): Promise<boolean> {
    return this._available;
  }

  async requestDevice(
    options?: RequestDeviceOptions
  ): Promise<BluetoothDevice> {
    if (!this._available) {
      throw new DOMException(
        'Bluetooth adapter not available',
        'NotFoundError'
      );
    }

    const matching = this._findMatchingDevices(options as Record<string, unknown>);
    if (matching.length === 0) {
      throw new DOMException(
        'No devices found matching the filter criteria',
        'NotFoundError'
      );
    }

    // Return the first matching device (simulates user picking)
    return matching[0].asBluetoothDevice();
  }

  async getDevices(): Promise<BluetoothDevice[]> {
    return Array.from(this._devices.values()).map((d) =>
      d.asBluetoothDevice()
    );
  }

  async requestLEScan(
    options?: BluetoothLEScanOptions
  ): Promise<BluetoothLEScan> {
    if (this._scanActive) {
      throw new DOMException('Scan already in progress', 'InvalidStateError');
    }
    this._scanActive = true;
    this._lastScanOptions = options;
    const scan = {
      active: true,
      keepRepeatedDevices: options?.keepRepeatedDevices ?? false,
      acceptAllAdvertisements: options?.acceptAllAdvertisements ?? false,
      stop: () => {
        this._scanActive = false;
        this._lastScanOptions = undefined;
        scan.active = false;
      },
    } as BluetoothLEScan & { active: boolean };
    return scan as BluetoothLEScan;
  }

  addEventListener(type: string, listener: EventListener): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this._listeners.get(type)?.delete(listener);
  }

  // --- Test helpers ---

  /** Add a device to the mock registry */
  addDevice(options: MockDeviceOptions): MockBleDevice {
    const device = new MockBleDevice(options);
    device.setAdvertisementSink(this._handleAdvertisement);
    this._devices.set(device.id, device);
    return device;
  }

  /** Remove a device from the registry */
  removeDevice(id: string): void {
    const device = this._devices.get(id);
    if (device) {
      device.setAdvertisementSink(undefined);
      device.simulateDisconnect();
      this._devices.delete(id);
    }
  }

  /** Get a mock device by ID for test assertions */
  getDevice(id: string): MockBleDevice | undefined {
    return this._devices.get(id);
  }

  /** Set Bluetooth availability */
  setAvailable(available: boolean): void {
    this._available = available;
  }

  /** Install this mock instance onto navigator.bluetooth */
  install(): this {
    if (typeof globalThis.navigator === 'undefined') {
      return this;
    }

    this._installedNavigatorBluetooth = (globalThis.navigator as Navigator & {
      bluetooth?: unknown;
    }).bluetooth;

    Object.defineProperty(globalThis.navigator, 'bluetooth', {
      value: this,
      writable: true,
      configurable: true,
    });
    return this;
  }

  /** Restore the previous navigator.bluetooth value */
  uninstall(): void {
    if (typeof globalThis.navigator === 'undefined') {
      return;
    }

    Object.defineProperty(globalThis.navigator, 'bluetooth', {
      value: this._installedNavigatorBluetooth,
      writable: true,
      configurable: true,
    });
    this._installedNavigatorBluetooth = undefined;
  }

  /** Emit a Bluetooth-level advertisementreceived event */
  emitAdvertisement(
    deviceId: string,
    options: MockAdvertisementOptions = {}
  ): void {
    const device = this._devices.get(deviceId);
    if (!device) {
      throw new Error(`Unknown mock device: ${deviceId}`);
    }

    this._handleAdvertisement(device, options);
  }

  /** Reset all state */
  reset(): void {
    for (const device of this._devices.values()) {
      device.setAdvertisementSink(undefined);
      device.simulateDisconnect();
    }
    this._devices.clear();
    this._listeners.clear();
    this._scanActive = false;
    this._lastScanOptions = undefined;
    this._available = true;
  }

  // --- Internal ---

  private _findMatchingDevices(
    options?: Record<string, unknown>
  ): MockBleDevice[] {
    if (!options || (options as { acceptAllDevices?: boolean }).acceptAllDevices) {
      return Array.from(this._devices.values());
    }

    const filters = ((options as { filters?: BluetoothLEScanFilter[] }).filters) ?? [];
    return Array.from(this._devices.values()).filter((device) =>
      filters.some((filter: BluetoothLEScanFilter) => device.matchesFilter(filter))
    );
  }

  private readonly _handleAdvertisement = (
    device: MockBleDevice,
    options: MockAdvertisementOptions
  ): void => {
    device.dispatchAdvertisementEvent(options);

    if (!this._scanActive) {
      return;
    }

    if (!this._matchesScan(device)) {
      return;
    }

    const event = device.createAdvertisementEvent(device.asBluetoothDevice(), options);
    const listeners = this._listeners.get('advertisementreceived');
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  };

  private _matchesScan(device: MockBleDevice): boolean {
    const options = this._lastScanOptions;
    if (!options) {
      return true;
    }

    if (options.acceptAllAdvertisements) {
      return true;
    }

    const filters = options.filters ?? [];
    if (filters.length === 0) {
      return true;
    }

    return filters.some((filter) => device.matchesFilter(filter));
  }
}

/**
 * Install mock Bluetooth API on the global navigator object.
 * Returns a MockBluetooth instance for test control.
 */
export function createMockBluetooth(
  options?: MockBluetoothOptions
): MockBluetooth {
  return new MockBluetooth(options);
}

/**
 * Install mock Bluetooth on navigator.bluetooth.
 * Returns the mock instance for control.
 */
export function installMockBluetooth(
  options?: MockBluetoothOptions
): MockBluetooth {
  const mock = createMockBluetooth(options);
  return mock.install();
}

export type {
  MockServiceConfig,
  MockCharacteristicConfig,
  MockAdvertisementOptions,
};

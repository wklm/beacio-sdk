/**
 * Mock BLE Device — stateful device with GATT server, services, characteristics
 */

import {
  MockGATTServer,
  type MockServiceConfig,
} from './characteristics';

let deviceIdCounter = 0;

export interface MockDeviceOptions {
  /** Device ID (auto-generated if not provided) */
  id?: string;
  /** Device name */
  name?: string;
  /** Advertised service UUIDs */
  serviceUUIDs?: string[];
  /** GATT service configurations */
  services?: MockServiceConfig[];
  /** Initial RSSI value */
  rssi?: number;
  /** Fail the first N connect() attempts with a NetworkError. */
  failConnectAttempts?: number;
/** Optional platform-reported write limits for MTU-aware write tests. */
  writeLimits?: {
    withResponse?: number | null;
    withoutResponse?: number | null;
    mtu?: number | null;
  };
}

export interface MockAdvertisementOptions {
  /** Override RSSI for this advertisement */
  rssi?: number;
  /** Optional TX power value */
  txPower?: number;
  /** Override advertised UUIDs for this advertisement */
  uuids?: string[];
  /** Optional manufacturer data payloads */
  manufacturerData?: Map<number, DataView>;
  /** Optional service data payloads */
  serviceData?: Map<string, DataView>;
}

interface ExtendedGatt extends BluetoothRemoteGATTServer {
  getMtu?: () => Promise<number | null>;
  getWriteLimits?: () => Promise<Record<string, number | null>>;
}

export class MockBleDevice {
  readonly id: string;
  readonly name: string | undefined;
  private _serviceUUIDs: string[];
  private _gatt: MockGATTServer;
  private _listeners: Map<string, Set<EventListener>> = new Map();
  private _rssi: number;
  private _watchingAdvertisements = false;
  private _advertisementSink?: (
    device: MockBleDevice,
    options: MockAdvertisementOptions
  ) => void;
  private _remainingConnectFailures: number;
  private _writeLimits: {
    withResponse: number | null;
    withoutResponse: number | null;
    mtu: number | null;
  };

  constructor(options: MockDeviceOptions = {}) {
    this.id = options.id ?? `mock-device-${++deviceIdCounter}`;
    this.name = options.name;
    this._serviceUUIDs = options.serviceUUIDs ?? [];
    this._gatt = new MockGATTServer(this, options.services ?? []);
    this._rssi = options.rssi ?? -60;
    this._remainingConnectFailures = options.failConnectAttempts ?? 0;
    this._writeLimits = {
      withResponse: options.writeLimits?.withResponse ?? null,
      withoutResponse: options.writeLimits?.withoutResponse ?? null,
      mtu: options.writeLimits?.mtu ?? null,
    };
  }

  /** Check if this device matches a scan filter */
  matchesFilter(filter: BluetoothLEScanFilter): boolean {
    if (filter.services) {
      const hasService = filter.services.some((uuid) =>
        this._serviceUUIDs.includes(String(uuid))
      );
      if (!hasService) return false;
    }
    if (filter.name && filter.name !== this.name) return false;
    if (filter.namePrefix && !this.name?.startsWith(filter.namePrefix))
      return false;
    return true;
  }

  /** Return a Web Bluetooth-compatible BluetoothDevice object */
  asBluetoothDevice(): BluetoothDevice {
    const self = this;
    // Build the device proxy first, then wire up gatt to avoid circular calls
    const proxy = {
      id: this.id,
      name: this.name ?? null,
      gatt: null as unknown as BluetoothRemoteGATTServer,
      watchAdvertisements: async (options?: { signal?: AbortSignal }) => {
        self._watchingAdvertisements = true;
        if (options?.signal) {
          if (options.signal.aborted) {
            self._watchingAdvertisements = false;
            return;
          }

          options.signal.addEventListener(
            'abort',
            () => {
              self._watchingAdvertisements = false;
            },
            { once: true }
          );
        }
      },
      addEventListener: (type: string, listener: EventListener) => {
        self._addListener(type, listener);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        self._removeListener(type, listener);
      },
      dispatchEvent: (_event: Event) => true,
      get watchingAdvertisements() {
        return self._watchingAdvertisements;
      },
      unwatchAdvertisements: async () => {
        self._watchingAdvertisements = false;
      },
      forget: async () => {},
      onadvertisementreceived: null,
      ongattserverdisconnected: null,
      oncharacteristicvaluechanged: null,
      onserviceadded: null,
      onservicechanged: null,
      onserviceremoved: null,
    } as object as BluetoothDevice;
    // Wire gatt with a back-reference to the proxy (no recursion)
    (proxy as { gatt: ExtendedGatt }).gatt = this._gatt.asBluetoothRemoteGATTServer(proxy) as ExtendedGatt;
    (proxy as { gatt: ExtendedGatt }).gatt.getMtu = async () => this._writeLimits.mtu;
    (proxy as { gatt: ExtendedGatt }).gatt.getWriteLimits = async () => ({ ...this._writeLimits });

    return proxy;
  }

  shouldFailConnect(): boolean {
    if (this._remainingConnectFailures <= 0) {
      return false;
    }
    this._remainingConnectFailures -= 1;
    return true;
  }

  /** Simulate a disconnect event */
  simulateDisconnect(): void {
    this._gatt.disconnect();
    this._emit('gattserverdisconnected', new Event('gattserverdisconnected'));
  }

  /** Get the mock GATT server for direct test control */
  get gatt(): MockGATTServer {
    return this._gatt;
  }

  get serviceUUIDs(): readonly string[] {
    return this._serviceUUIDs;
  }

  get rssi(): number {
    return this._rssi;
  }

  /** Emit an advertisement for requestLEScan()/watchAdvertisements() tests */
  emitAdvertisement(options: MockAdvertisementOptions = {}): void {
    if (this._advertisementSink) {
      this._advertisementSink(this, options);
      return;
    }

    this.dispatchAdvertisementEvent(options);
  }

  /** Update RSSI between advertisements */
  setRSSI(rssi: number): void {
    this._rssi = rssi;
  }

  /** Internal hook used by MockBluetooth to receive advertisement pumps */
  setAdvertisementSink(
    sink: ((device: MockBleDevice, options: MockAdvertisementOptions) => void) | undefined
  ): void {
    this._advertisementSink = sink;
  }

  /** Internal bridge for watchAdvertisements() listeners */
  dispatchAdvertisementEvent(options: MockAdvertisementOptions = {}): void {
    if (!this._watchingAdvertisements) {
      return;
    }

    this._emit(
      'advertisementreceived',
      this.createAdvertisementEvent(this.asBluetoothDevice(), options)
    );
  }

  /** Build a Web Bluetooth-style advertisementreceived event */
  createAdvertisementEvent(
    deviceProxy: BluetoothDevice,
    options: MockAdvertisementOptions = {}
  ): Event {
    const event = new Event('advertisementreceived') as Event & {
      device?: BluetoothDevice;
      name?: string;
      uuids?: string[];
      rssi?: number;
      txPower?: number;
      manufacturerData?: Map<number, DataView>;
      serviceData?: Map<string, DataView>;
    };

    Object.defineProperties(event, {
      device: { value: deviceProxy, writable: false },
      name: { value: this.name, writable: false },
      uuids: {
        value: [...(options.uuids ?? this._serviceUUIDs)],
        writable: false,
      },
      rssi: { value: options.rssi ?? this._rssi, writable: false },
      txPower: { value: options.txPower, writable: false },
      manufacturerData: {
        value: options.manufacturerData ?? new Map<number, DataView>(),
        writable: false,
      },
      serviceData: {
        value: options.serviceData ?? new Map<string, DataView>(),
        writable: false,
      },
    });

    return event;
  }

  // --- Internal ---

  private _addListener(type: string, listener: EventListener): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }

  private _removeListener(type: string, listener: EventListener): void {
    this._listeners.get(type)?.delete(listener);
  }

  private _emit(type: string, event: Event): void {
    const listeners = this._listeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }
  }
}

/**
 * Mock GATT Server, Services, and Characteristics
 *
 * Stateful mocks that simulate real BLE behavior:
 * - Characteristic reads return configured values
 * - Writes store values
 * - Notifications can be pumped programmatically
 */

import type { MockBleDevice } from './device';

export interface MockCharacteristicConfig {
  /** Characteristic UUID */
  uuid: string;
  /** Characteristic properties (all default to false except read) */
  properties?: {
    broadcast?: boolean;
    read?: boolean;
    write?: boolean;
    writeWithoutResponse?: boolean;
    notify?: boolean;
    indicate?: boolean;
    authenticatedSignedWrites?: boolean;
    reliableWrite?: boolean;
    writableAuxiliaries?: boolean;
  };
  /** Initial value (DataView or Uint8Array) */
  value?: ArrayBuffer | Uint8Array;
  /** Descriptors for this characteristic */
  descriptors?: MockDescriptorConfig[];
}

export interface MockServiceConfig {
  /** Service UUID */
  uuid: string;
  /** Whether this is a primary service (default: true) */
  isPrimary?: boolean;
  /** Characteristics in this service */
  characteristics?: MockCharacteristicConfig[];
}

export interface MockDescriptorConfig {
  /** Descriptor UUID */
  uuid: string;
  /** Initial value */
  value?: ArrayBuffer | Uint8Array;
}

// --- Mock GATT Server ---

export class MockGATTServer {
  private _connected = false;
  private _device: MockBleDevice;
  private _services: Map<string, MockService> = new Map();

  constructor(device: MockBleDevice, configs: MockServiceConfig[]) {
    this._device = device;
    for (const config of configs) {
      this._services.set(
        config.uuid,
        new MockService(device, config)
      );
    }
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<BluetoothRemoteGATTServer> {
    if (this._device.shouldFailConnect()) {
      throw new DOMException('Simulated transient connection failure', 'NetworkError');
    }
    this._connected = true;
    return this.asBluetoothRemoteGATTServer();
  }

  disconnect(): void {
    this._connected = false;
    // Stop all notifications
    for (const service of this._services.values()) {
      service.stopAllNotifications();
    }
  }

  async getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTService> {
    this._assertConnected();
    const service = this._services.get(uuid);
    if (!service) {
      throw new DOMException(
        `No Services matching UUID ${uuid} found`,
        'NotFoundError'
      );
    }
    return service.asBluetoothRemoteGATTService();
  }

  async getPrimaryServices(
    uuid?: string
  ): Promise<BluetoothRemoteGATTService[]> {
    this._assertConnected();
    const services = uuid
      ? [this._services.get(uuid)].filter(Boolean)
      : Array.from(this._services.values());
    return (services as MockService[]).map((s) =>
      s.asBluetoothRemoteGATTService()
    );
  }

  /** Get a mock service for test control */
  getService(uuid: string): MockService | undefined {
    return this._services.get(uuid);
  }

  asBluetoothRemoteGATTServer(deviceProxy?: BluetoothDevice): BluetoothRemoteGATTServer {
    const self = this;
    const server = {
      get connected() {
        return self._connected;
      },
      get device() {
        return deviceProxy!;
      },
      connect: () => self.connect(),
      disconnect: () => self.disconnect(),
      getPrimaryService: (uuid: string) =>
        self.getPrimaryService(uuid),
      getPrimaryServices: (uuid?: string) =>
        self.getPrimaryServices(uuid),
    } as unknown as BluetoothRemoteGATTServer;
    return server;
  }

  private _assertConnected(): void {
    if (!this._connected) {
      throw new DOMException(
        'GATT Server is disconnected. Cannot perform GATT operations.',
        'NetworkError'
      );
    }
  }
}

// --- Mock Service ---

export class MockService {
  readonly uuid: string;
  readonly isPrimary: boolean;
  private _characteristics: Map<string, MockCharacteristic> = new Map();

  constructor(_device: MockBleDevice, config: MockServiceConfig) {
    this.uuid = config.uuid;
    this.isPrimary = config.isPrimary ?? true;
    for (const charConfig of config.characteristics ?? []) {
      this._characteristics.set(
        charConfig.uuid,
        new MockCharacteristic(charConfig)
      );
    }
  }

  async getCharacteristic(
    uuid: string
  ): Promise<BluetoothRemoteGATTCharacteristic> {
    const char = this._characteristics.get(uuid);
    if (!char) {
      throw new DOMException(
        `No Characteristics matching UUID ${uuid} found`,
        'NotFoundError'
      );
    }
    return char.asBluetoothRemoteGATTCharacteristic(
      this.asBluetoothRemoteGATTService()
    );
  }

  async getCharacteristics(
    uuid?: string
  ): Promise<BluetoothRemoteGATTCharacteristic[]> {
    const chars = uuid
      ? [this._characteristics.get(uuid)].filter(Boolean)
      : Array.from(this._characteristics.values());
    const service = this.asBluetoothRemoteGATTService();
    return (chars as MockCharacteristic[]).map((c) =>
      c.asBluetoothRemoteGATTCharacteristic(service)
    );
  }

  /** Get a mock characteristic for test control */
  getChar(uuid: string): MockCharacteristic | undefined {
    return this._characteristics.get(uuid);
  }

  stopAllNotifications(): void {
    for (const char of this._characteristics.values()) {
      char.stopNotifications();
    }
  }

  asBluetoothRemoteGATTService(deviceProxy?: BluetoothDevice): BluetoothRemoteGATTService {
    const self = this;
    return {
      uuid: this.uuid,
      isPrimary: this.isPrimary,
      get device() {
        return deviceProxy!;
      },
      getCharacteristic: (uuid: string) => self.getCharacteristic(uuid),
      getCharacteristics: (uuid?: string) =>
        self.getCharacteristics(uuid),
      getIncludedService: async () => {
        throw new DOMException('Not implemented', 'NotSupportedError');
      },
      getIncludedServices: async () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
      oncharacteristicvaluechanged: null,
      onserviceadded: null,
      onservicechanged: null,
      onserviceremoved: null,
    } as unknown as BluetoothRemoteGATTService;
  }
}

// --- Mock Characteristic ---

export class MockCharacteristic {
  readonly uuid: string;
  private _properties: {
    broadcast: boolean;
    read: boolean;
    write: boolean;
    writeWithoutResponse: boolean;
    notify: boolean;
    indicate: boolean;
    authenticatedSignedWrites: boolean;
    reliableWrite: boolean;
    writableAuxiliaries: boolean;
  };
  private _value: DataView;
  private _notifying = false;
  private _listeners: Map<string, Set<EventListener>> = new Map();
  private _descriptors: Map<string, MockDescriptor> = new Map();

  constructor(config: MockCharacteristicConfig) {
    this.uuid = config.uuid;
    this._properties = {
      broadcast: config.properties?.broadcast ?? false,
      read: config.properties?.read ?? true,
      write: config.properties?.write ?? false,
      writeWithoutResponse: config.properties?.writeWithoutResponse ?? false,
      notify: config.properties?.notify ?? false,
      indicate: config.properties?.indicate ?? false,
      authenticatedSignedWrites: config.properties?.authenticatedSignedWrites ?? false,
      reliableWrite: config.properties?.reliableWrite ?? false,
      writableAuxiliaries: config.properties?.writableAuxiliaries ?? false,
    };

    if (config.value) {
      const buffer =
        config.value instanceof Uint8Array
          ? config.value.buffer.slice(
              config.value.byteOffset,
              config.value.byteOffset + config.value.byteLength
            )
          : config.value;
      this._value = new DataView(buffer);
    } else {
      this._value = new DataView(new ArrayBuffer(0));
    }

    for (const descConfig of config.descriptors ?? []) {
      this._descriptors.set(descConfig.uuid, new MockDescriptor(descConfig));
    }
  }

  /** Set the characteristic value (for test setup) */
  setValue(data: ArrayBuffer | Uint8Array): void {
    const buffer =
      data instanceof Uint8Array
        ? data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength
          )
        : data;
    this._value = new DataView(buffer);
  }

  /** Pump a notification to all listeners */
  emitNotification(data: ArrayBuffer | Uint8Array): void {
    const buffer =
      data instanceof Uint8Array
        ? data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength
          )
        : data;
    this._value = new DataView(buffer);

    const event = new Event('characteristicvaluechanged');
    Object.defineProperty(event, 'target', {
      value: { value: this._value },
      writable: false,
    });

    const listeners = this._listeners.get('characteristicvaluechanged');
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }
  }

  stopNotifications(): void {
    this._notifying = false;
  }

  get isNotifying(): boolean {
    return this._notifying;
  }

  /** Get a mock descriptor for test control */
  getDesc(uuid: string): MockDescriptor | undefined {
    return this._descriptors.get(uuid);
  }

  asBluetoothRemoteGATTCharacteristic(
    service: BluetoothRemoteGATTService
  ): BluetoothRemoteGATTCharacteristic {
    const self = this;
    return {
      uuid: this.uuid,
      service,
      properties: {
        broadcast: this._properties.broadcast,
        read: this._properties.read,
        writeWithoutResponse: this._properties.writeWithoutResponse,
        write: this._properties.write,
        notify: this._properties.notify,
        indicate: this._properties.indicate,
        authenticatedSignedWrites: this._properties.authenticatedSignedWrites,
        reliableWrite: this._properties.reliableWrite,
        writableAuxiliaries: this._properties.writableAuxiliaries,
      },
      get value() {
        return self._value;
      },
      readValue: async () => {
        if (!self._properties.read) {
          throw new DOMException(
            'Characteristic does not support read',
            'NotSupportedError'
          );
        }
        return self._value;
      },
      writeValue: async (value: BufferSource) => {
        if (!self._properties.write) {
          throw new DOMException(
            'Characteristic does not support write',
            'NotSupportedError'
          );
        }
        self._writeValue(value);
      },
      writeValueWithResponse: async (value: BufferSource) => {
        if (!self._properties.write) {
          throw new DOMException(
            'Characteristic does not support write',
            'NotSupportedError'
          );
        }
        self._writeValue(value);
      },
      writeValueWithoutResponse: async (value: BufferSource) => {
        if (!self._properties.writeWithoutResponse) {
          throw new DOMException(
            'Characteristic does not support write without response',
            'NotSupportedError'
          );
        }
        self._writeValue(value);
      },
      startNotifications: async function () {
        if (!self._properties.notify && !self._properties.indicate) {
          throw new DOMException(
            'Characteristic does not support notifications',
            'NotSupportedError'
          );
        }
        self._notifying = true;
        return this;
      },
      stopNotifications: async function () {
        self._notifying = false;
        return this;
      },
      addEventListener: (type: string, listener: EventListener) => {
        if (!self._listeners.has(type)) {
          self._listeners.set(type, new Set());
        }
        self._listeners.get(type)!.add(listener);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        self._listeners.get(type)?.delete(listener);
      },
      dispatchEvent: () => true,
      getDescriptor: async (uuid: string) => {
        const desc = self._descriptors.get(uuid);
        if (!desc) {
          throw new DOMException(
            `No Descriptors matching UUID ${uuid} found`,
            'NotFoundError'
          );
        }
        return desc.asBluetoothRemoteGATTDescriptor(
          self.asBluetoothRemoteGATTCharacteristic(service)
        );
      },
      getDescriptors: async (uuid?: string) => {
        const descriptors = uuid
          ? [self._descriptors.get(uuid)].filter(Boolean)
          : Array.from(self._descriptors.values());
        const charProxy = self.asBluetoothRemoteGATTCharacteristic(service);
        return (descriptors as MockDescriptor[]).map((d) =>
          d.asBluetoothRemoteGATTDescriptor(charProxy)
        );
      },
      oncharacteristicvaluechanged: null,
    } as unknown as BluetoothRemoteGATTCharacteristic;
  }

  private _writeValue(value: BufferSource): void {
    const buffer =
      value instanceof ArrayBuffer
        ? value
        : (value as DataView).buffer ?? (value as Uint8Array).buffer;
    this._value = new DataView(buffer);
  }
}

// --- Mock Descriptor ---

export class MockDescriptor {
  readonly uuid: string;
  private _value: DataView;

  constructor(config: MockDescriptorConfig) {
    this.uuid = config.uuid;
    if (config.value) {
      const buffer =
        config.value instanceof Uint8Array
          ? config.value.buffer.slice(
              config.value.byteOffset,
              config.value.byteOffset + config.value.byteLength
            )
          : config.value;
      this._value = new DataView(buffer);
    } else {
      this._value = new DataView(new ArrayBuffer(0));
    }
  }

  /** Set the descriptor value (for test setup) */
  setValue(data: ArrayBuffer | Uint8Array): void {
    const buffer =
      data instanceof Uint8Array
        ? data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength
          )
        : data;
    this._value = new DataView(buffer);
  }

  /** Get the current value */
  get value(): DataView {
    return this._value;
  }

  asBluetoothRemoteGATTDescriptor(
    characteristic: BluetoothRemoteGATTCharacteristic
  ): BluetoothRemoteGATTDescriptor {
    const self = this;
    return {
      uuid: this.uuid,
      characteristic,
      get value() {
        return self._value;
      },
      readValue: async () => {
        return self._value;
      },
      writeValue: async (value: BufferSource) => {
        const buffer =
          value instanceof ArrayBuffer
            ? value
            : (value as DataView).buffer ?? (value as Uint8Array).buffer;
        self._value = new DataView(buffer);
      },
    } as unknown as BluetoothRemoteGATTDescriptor;
  }
}

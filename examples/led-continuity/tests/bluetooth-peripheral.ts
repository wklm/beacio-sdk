// Browser boundary double for the real peripheral's normal FFF0/FFF1 profile.
// It never simulates iOS background scheduling or claims to prove radio timing.
export function installPeripheral(): void {
  const serviceUUID = '0000fff0-0000-1000-8000-00805f9b34fb';
  const characteristicUUID = '0000fff1-0000-1000-8000-00805f9b34fb';
  const state = {
    writes: [] as number[][],
    programs: [] as unknown[],
    order: [] as string[],
    userActivation: false,
    requestOptions: null as unknown,
    registered: false,
    failRegistration: false,
    failUnregister: false,
    failRegistrationLookup: false,
    echo: true,
    reads: 0,
    connected: false
  };

  class Characteristic extends EventTarget {
    readonly id = 'peripheral-characteristic-instance';
    readonly uuid = characteristicUUID;
    readonly properties = { read: true, write: true, writeWithoutResponse: true, notify: true };
    value = new DataView(new Uint8Array([0xbe, 0xac]).buffer);
    notifying = false;

    async readValue(): Promise<DataView> {
      if (!state.connected) throw new DOMException('Disconnected', 'NetworkError');
      state.reads += 1;
      return this.value;
    }

    async writeValueWithResponse(data: BufferSource): Promise<void> {
      if (!state.connected) throw new DOMException('Disconnected', 'NetworkError');
      const bytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data);
      state.writes.push(Array.from(bytes));
      state.order.push(`write:${bytes[0]}`);
      this.value = new DataView(bytes.slice().buffer);
      if (state.echo && this.notifying) this.dispatchEvent(new Event('characteristicvaluechanged'));
    }

    async writeValue(data: BufferSource): Promise<void> { await this.writeValueWithResponse(data); }
    async startNotifications(): Promise<this> { this.notifying = true; return this; }
    async stopNotifications(): Promise<this> { this.notifying = false; return this; }
  }

  const characteristic = new Characteristic();
  const service = {
    uuid: serviceUUID,
    getCharacteristic: async () => characteristic,
    getCharacteristics: async () => [characteristic]
  };
  const device = new EventTarget() as EventTarget & { id: string; name: string; gatt: unknown };
  device.id = 'peripheral-device';
  device.name = 'EmulatedPeripheral';
  const server = {
    device,
    get connected() { return state.connected; },
    connect: async () => { state.connected = true; return server; },
    disconnect: () => {
      state.connected = false;
      device.dispatchEvent(new Event('gattserverdisconnected'));
    },
    getPrimaryServices: async () => [service],
    getPrimaryService: async () => service
  };
  device.gatt = server;

  const registration = {
    id: 'peripheral-registration', type: 'connection', createdAt: Date.now(),
    unregister: async () => {
      state.order.push('unregister');
      if (state.failUnregister) throw new DOMException('App unreachable', 'NetworkError');
      state.registered = false;
    }
  };
  const backgroundSync = {
    // Presence identifies program support, rather than an older connection-only API.
    declareProgram: async () => ({ window: 'armed', away: 'unavailable' }),
    requestBackgroundConnection: async (options: unknown) => {
      state.programs.push(structuredClone(options));
      state.order.push('register');
      if (state.failRegistration) throw new DOMException('Open beacio first', 'NotSupportedError');
      state.registered = true;
      return registration;
    },
    getRegistrations: async () => {
      if (state.failRegistrationLookup) throw new DOMException('Registration status unavailable', 'NetworkError');
      return state.registered ? [registration] : [];
    },
    unregister: async () => registration.unregister()
  };
  const bluetooth = {
    __beacio: true,
    backgroundSync,
    requestDevice: async (options: unknown) => {
      state.requestOptions = options;
      state.userActivation = navigator.userActivation.isActive;
      return device;
    },
    getAvailability: async () => true,
    getDevices: async () => [device]
  };

  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: bluetooth });
  Object.defineProperty(navigator, 'beacio', { configurable: true, value: bluetooth });
  Object.assign(window, {
    __peripheral: state,
    __dropPeripheral: () => server.disconnect(),
    __removeNativeAPI: () => { Reflect.deleteProperty(backgroundSync, 'declareProgram'); }
  });
}

export interface PeripheralState {
  writes: number[][];
  programs: unknown[];
  order: string[];
  userActivation: boolean;
  requestOptions: unknown;
  registered: boolean;
  failRegistration: boolean;
  failUnregister: boolean;
  failRegistrationLookup: boolean;
  echo: boolean;
  reads: number;
  connected: boolean;
}

declare global {
  interface Window {
    __peripheral: PeripheralState;
    __dropPeripheral(): void;
    __removeNativeAPI(): void;
  }
}

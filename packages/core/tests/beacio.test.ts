import { describe, expect, it, jest } from '@jest/globals';
import { Beacio } from '../src/beacio';

type MockBluetooth = {
  requestDevice: ReturnType<typeof jest.fn>;
  getAvailability: ReturnType<typeof jest.fn>;
  getDevices?: ReturnType<typeof jest.fn>;
};

/** Shape of the options object forwarded to navigator.bluetooth.requestDevice. */
type RequestForward = {
  filters?: Array<{ services?: string[]; namePrefix?: string; name?: string }>;
  exclusionFilters?: Array<{ services?: string[]; namePrefix?: string; name?: string }>;
  optionalServices?: string[];
  acceptAllDevices?: boolean;
};

function setNavigatorBluetooth(bluetooth: MockBluetooth) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: { bluetooth },
  });
}

describe('Beacio.requestDevice', () => {
  it('normalizes service UUID fields before forwarding request options', async () => {
    const requestDevice = jest.fn(async () => ({ id: 'device-1', addEventListener: jest.fn(), gatt: { connect: jest.fn() } }));
    setNavigatorBluetooth({ requestDevice, getAvailability: jest.fn() });

    const ble = new Beacio();
    await ble.requestDevice({
      filters: [{ services: ['heart_rate', '180F'], namePrefix: 'HR' }],
      exclusionFilters: [{ services: ['0000180D', '12345678-1234-1234-1234-ABCDEFABCDEF'], name: 'Skip' }],
      optionalServices: ['battery_service', '12345678-1234-1234-1234-ABCDEFABCDEF'],
      optionalManufacturerData: [0x004C],
    });

    const firstCall = requestDevice.mock.calls[0] as unknown as [unknown] | undefined;
    expect(firstCall?.[0]).toEqual({
      filters: [{
        services: [
          '0000180d-0000-1000-8000-00805f9b34fb',
          '0000180f-0000-1000-8000-00805f9b34fb',
        ],
        namePrefix: 'HR',
      }],
      exclusionFilters: [{
        services: [
          '0000180d-0000-1000-8000-00805f9b34fb',
          '12345678-1234-1234-1234-abcdefabcdef',
        ],
        name: 'Skip',
      }],
      optionalServices: [
        '0000180f-0000-1000-8000-00805f9b34fb',
        '12345678-1234-1234-1234-abcdefabcdef',
      ],
      optionalManufacturerData: [0x004C],
    });
  });

  it('keeps default acceptAllDevices behavior when options are omitted', async () => {
    const requestDevice = jest.fn(async () => ({ id: 'device-2', addEventListener: jest.fn(), gatt: { connect: jest.fn() } }));
    setNavigatorBluetooth({ requestDevice, getAvailability: jest.fn() });

    const ble = new Beacio();
    await ble.requestDevice();

    const firstCall = requestDevice.mock.calls[0] as unknown as [unknown] | undefined;
    expect(firstCall?.[0]).toEqual({ acceptAllDevices: true });
  });
});

describe('Beacio.registerServices / defaultOptionalServices (SB-SDK-08)', () => {
  // Canonical lowercase 128-bit forms the SDK normalizes these aliases to.
  const HEART_RATE = '0000180d-0000-1000-8000-00805f9b34fb';
  const BATTERY = '0000180f-0000-1000-8000-00805f9b34fb';
  const DEVICE_INFO = '0000180a-0000-1000-8000-00805f9b34fb';
  const SB_SERVICE = '00000001-4c45-4b43-4942-265a524f5453';

  function mockBluetooth() {
    const requestDevice = jest.fn(async () => ({ id: 'device-reg', addEventListener: jest.fn(), gatt: { connect: jest.fn() } }));
    setNavigatorBluetooth({ requestDevice, getAvailability: jest.fn() });
    return requestDevice;
  }

  function forwardedOptions(requestDevice: ReturnType<typeof jest.fn>): RequestForward {
    const firstCall = requestDevice.mock.calls[0] as unknown as [RequestForward] | undefined;
    return firstCall?.[0] ?? ({} as RequestForward);
  }

  it('(a) empty registry is a no-op: forwarded options are unchanged from today', async () => {
    const requestDevice = mockBluetooth();
    const ble = new Beacio();

    await ble.requestDevice({ filters: [{ services: ['heart_rate'] }] });

    const forwarded = forwardedOptions(requestDevice);
    // No optionalServices synthesized when nothing is registered and caller passed none.
    expect(forwarded.optionalServices).toBeUndefined();
    expect(forwarded.filters).toEqual([{ services: [HEART_RATE] }]);
  });

  it('(b) registry-only: registered defaults become optionalServices even when the caller passes filters but no optionalServices', async () => {
    const requestDevice = mockBluetooth();
    const ble = new Beacio();
    ble.registerServices(['battery_service', SB_SERVICE]);

    await ble.requestDevice({ filters: [{ services: ['heart_rate'] }] });

    const forwarded = forwardedOptions(requestDevice);
    expect(forwarded.optionalServices).toEqual([BATTERY, SB_SERVICE]);
    // Filters are forwarded untouched (registry must not fold services into the picker).
    expect(forwarded.filters).toEqual([{ services: [HEART_RATE] }]);
  });

  it('(b2) defaultOptionalServices constructor option seeds the registry', async () => {
    const requestDevice = mockBluetooth();
    const ble = new Beacio({ defaultOptionalServices: ['battery_service'] });

    await ble.requestDevice({ acceptAllDevices: true });

    expect(forwardedOptions(requestDevice).optionalServices).toEqual([BATTERY]);
  });

  it('(c) caller + registry: effective optionalServices is the de-duped UNION (caller entries first), never a replacement', async () => {
    const requestDevice = mockBluetooth();
    const ble = new Beacio();
    ble.registerServices(['battery_service', 'device_information']);

    await ble.requestDevice({
      // 'battery_service' overlaps the registry and must NOT be duplicated.
      optionalServices: ['heart_rate', 'battery_service'],
      filters: [{ namePrefix: 'HR' }],
    });

    const forwarded = forwardedOptions(requestDevice);
    expect(forwarded.optionalServices).toEqual([HEART_RATE, BATTERY, DEVICE_INFO]);
  });

  it('(d) name aliases and hex forms in the registry resolve via resolveUUID to canonical lowercase 128-bit', async () => {
    const requestDevice = mockBluetooth();
    const ble = new Beacio();
    ble.registerServices(['battery_service', '180D', '0000180A']);

    await ble.requestDevice({ acceptAllDevices: true });

    expect(forwardedOptions(requestDevice).optionalServices).toEqual([BATTERY, HEART_RATE, DEVICE_INFO]);
  });

  it('(e) double registration of the same UUID (by alias or canonical) is idempotent', async () => {
    const requestDevice = mockBluetooth();
    const ble = new Beacio();
    ble.registerServices(['battery_service']);
    ble.registerServices(['180F', BATTERY, 'battery_service']);

    await ble.requestDevice({ acceptAllDevices: true });

    expect(forwardedOptions(requestDevice).optionalServices).toEqual([BATTERY]);
  });

  it('(f) PICKER UNTOUCHED: filters / exclusionFilters / acceptAllDevices are forwarded byte-identically; registry never synthesizes acceptAllDevices', async () => {
    const requestDevice = mockBluetooth();
    const ble = new Beacio();
    ble.registerServices(['battery_service']);

    await ble.requestDevice({
      filters: [{ services: ['heart_rate'], namePrefix: 'Polar' }],
      exclusionFilters: [{ name: 'Skip' }],
    });

    const forwarded = forwardedOptions(requestDevice);
    expect(forwarded.filters).toEqual([{ services: [HEART_RATE], namePrefix: 'Polar' }]);
    expect(forwarded.exclusionFilters).toEqual([{ name: 'Skip', services: undefined }]);
    // The registry must NOT widen the picker by inventing acceptAllDevices.
    expect(forwarded.acceptAllDevices).toBeUndefined();
    // optionalServices carries the registered set only.
    expect(forwarded.optionalServices).toEqual([BATTERY]);
  });

  it('(g) NO-SWIFT-CHANGE boundary: a broad merged list reaches navigator.bluetooth.requestDevice already canonicalized + de-duped by the SDK', async () => {
    const requestDevice = mockBluetooth();
    const ble = new Beacio();
    // Mixed aliases/hex/canonical across caller + registry, with overlaps.
    ble.registerServices(['battery_service', SB_SERVICE]);

    await ble.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['heart_rate', '180F', SB_SERVICE],
    });

    const forwarded = forwardedOptions(requestDevice);
    // Every entry is a canonical lowercase 128-bit UUID (the Swift blocklist
    // filter then applies to this exact list, unchanged — no Swift edit needed).
    for (const uuid of forwarded.optionalServices ?? []) {
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
    // No duplicates survived the merge.
    const set = new Set(forwarded.optionalServices);
    expect(set.size).toBe((forwarded.optionalServices ?? []).length);
    expect(forwarded.optionalServices).toEqual([HEART_RATE, BATTERY, SB_SERVICE]);
  });
});

describe('Beacio.getDevices', () => {
  it('returns wrapped devices when the platform exposes getDevices', async () => {
    const getDevices = jest.fn(async () => ([
      { id: 'device-1', name: 'One', addEventListener: jest.fn(), gatt: { connect: jest.fn() } },
      { id: 'device-2', name: 'Two', addEventListener: jest.fn(), gatt: { connect: jest.fn() } },
    ]));
    setNavigatorBluetooth({ requestDevice: jest.fn(), getAvailability: jest.fn(), getDevices });

    const ble = new Beacio();
    const devices = await ble.getDevices();

    expect(getDevices).toHaveBeenCalledTimes(1);
    expect(devices.map((device) => device.id)).toEqual(['device-1', 'device-2']);
  });

  it('returns an empty list when getDevices is unavailable', async () => {
    setNavigatorBluetooth({ requestDevice: jest.fn(), getAvailability: jest.fn() });

    const ble = new Beacio();

    await expect(ble.getDevices()).resolves.toEqual([]);
  });

  it('exposes unified backgroundSync and peripheral surfaces from the runtime bluetooth object', async () => {
    const backgroundSync = {
      connect: jest.fn(),
      subscribe: jest.fn(),
      scan: jest.fn(),
      list: jest.fn(),
      requestPermission: jest.fn(),
      requestBackgroundConnection: jest.fn(),
      registerCharacteristicNotifications: jest.fn(),
      registerBeaconScanning: jest.fn(),
      getRegistrations: jest.fn(),
      unregister: jest.fn(),
      update: jest.fn(),
      destroy: jest.fn(),
    };
    const peripheral = {
      advertising: false,
      advertise: jest.fn(),
      startAdvertising: jest.fn(),
      stopAdvertising: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      onwriterequest: null,
      onconnectionstatechange: null,
      onadvertisingstatechange: null,
      destroy: jest.fn(),
    };
    setNavigatorBluetooth({
      requestDevice: jest.fn(),
      getAvailability: jest.fn(),
      getDevices: jest.fn(),
      backgroundSync,
      peripheral,
      __beacio: true,
    } as unknown as MockBluetooth);

    const ble = new Beacio();

    expect(ble.backgroundSync).toBe(backgroundSync);
    expect(ble.peripheral).toBe(peripheral);
  });

  it('provides explicit unsupported proxies for relay-only APIs when unavailable', async () => {
    setNavigatorBluetooth({ requestDevice: jest.fn(), getAvailability: jest.fn() });

    const ble = new Beacio();

    expect(() => ble.backgroundSync.list()).toThrow('This Beacio feature requires the iOS Safari Beacio extension runtime.');
    expect(() => ble.peripheral.startAdvertising()).toThrow('This Beacio feature requires the iOS Safari Beacio extension runtime.');
  });
});

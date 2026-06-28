import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// SB-SDK-13 — Foreground auto-reconnect + subscription recovery on the RAW
// polyfilled `navigator.bluetooth` path.
//
// beacio's free foreground auto-reconnect engine lives on the BeacioDevice
// wrapper (device.ts handleDisconnect/startAutoReconnect + notification-manager
// recoverSubscriptions). Real drop-in apps — the Storz & Bickel demo
// (integration-demo/app/js/main.js) — consume the BARE global:
//   navigator.bluetooth.requestDevice(options)
//   device.addEventListener('gattserverdisconnected', onDisconnected)  // → location.reload()
// so NONE of that engine runs: requestDevice returns the extension's raw
// BluetoothDevice and a transient drop forces a full page reload.
//
// This suite drives the POLYFILL path (NOT the BeacioDevice path, per AC#4 +
// feedback_regressions_need_failing_tests) and asserts the currently-absent
// behavior: on the beacio runtime, a device handed back by the polyfilled
// requestDevice must auto-reconnect on an UNEXPECTED gattserverdisconnected,
// re-arm the characteristics that had startNotifications active, and stay a
// no-op for an INTENTIONAL gatt.disconnect() and off the beacio runtime
// (native / unsupported).
//
// It is RED on today's tree: auto.ts installs the W3C facade by binding the
// extension's requestDevice directly (no supervisor), so no reconnect/backoff/
// re-subscription happens on this path.

const originalNavigator = globalThis.navigator;

function mockNavigator(value: any) {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    writable: true,
    configurable: true,
  });
}

async function importAuto(): Promise<void> {
  jest.resetModules();
  await import('../src/auto');
}

/** Flush a few microtask turns so awaited connect()/recover() chains settle. */
async function flushMicrotasks(turns = 8): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
}

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    writable: true,
    configurable: true,
  });
  jest.useRealTimers();
});

/**
 * A mock GATT characteristic whose start/stopNotifications are jest.fn()s so we
 * can assert re-subscription, plus the W3C EventTarget surface the notification
 * recovery path attaches its listener to.
 */
function makeMockCharacteristic() {
  const characteristic: any = {
    uuid: '0000180d-0000-1000-8000-00805f9b34fb',
    value: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    readValue: jest.fn(async () => characteristic.value),
    startNotifications: jest.fn(async () => characteristic),
    stopNotifications: jest.fn(async () => undefined),
    writeValueWithResponse: jest.fn(async () => undefined),
    writeValueWithoutResponse: jest.fn(async () => undefined),
  };
  return characteristic;
}

/**
 * Build a mock extension-shaped navigator (`navigator.beacio.__beacio === true`
 * → detectPlatform() 'safari-extension') whose requestDevice returns a mock
 * BluetoothDevice with:
 *  - addEventListener('gattserverdisconnected', …) so a supervisor can hook it,
 *  - a gatt with connect()/disconnect()/connected jest.fn()s,
 *  - a service → characteristic chain for startNotifications re-arming,
 *  - optionally a `connectAndDiscover` fast-path on the gatt server (AC#3).
 */
function makeExtensionNavigatorWithDevice(opts?: { withConnectAndDiscover?: boolean }) {
  const characteristic = makeMockCharacteristic();

  const service: any = {
    uuid: characteristic.uuid,
    getCharacteristic: jest.fn(async () => characteristic),
  };

  const server: any = {
    connected: false,
    connect: jest.fn(async () => {
      server.connected = true;
      return server;
    }),
    disconnect: jest.fn(() => {
      server.connected = false;
    }),
    getPrimaryService: jest.fn(async () => service),
    getPrimaryServices: jest.fn(async () => [service]),
  };
  if (opts?.withConnectAndDiscover) {
    server.connectAndDiscover = jest.fn(async () => {
      server.connected = true;
      return [service];
    });
  }

  // Capture the gattserverdisconnected listeners the supervisor attaches so the
  // test can fire the event the way the extension's injected device would.
  const disconnectListeners: Array<(ev?: any) => void> = [];
  const device: any = {
    id: 'sb-volcano-1',
    name: 'S&B VOLCANO 12345',
    gatt: server,
    addEventListener: jest.fn((type: string, listener: (ev?: any) => void) => {
      if (type === 'gattserverdisconnected') disconnectListeners.push(listener);
    }),
    removeEventListener: jest.fn(),
    watchAdvertisements: jest.fn(async () => undefined),
  };

  const requestDevice = jest.fn(async () => device);
  const originalQuery = jest.fn(async (descriptor: any) => {
    if (descriptor?.name === 'bluetooth') throw new TypeError("'bluetooth' is not a valid PermissionName");
    return { state: 'granted', name: descriptor?.name } as any;
  });

  const nav: any = {
    beacio: {
      __beacio: true,
      requestDevice,
      getAvailability: jest.fn(async () => true),
      getDevices: jest.fn(async () => []),
    },
    permissions: { query: originalQuery },
  };

  const fireDisconnect = () => {
    server.connected = false;
    for (const listener of [...disconnectListeners]) listener({ type: 'gattserverdisconnected' });
  };

  return { nav, device, server, service, characteristic, requestDevice, fireDisconnect };
}

describe('SB-SDK-13 — raw polyfill foreground auto-reconnect + subscription recovery', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  it('re-runs gatt.connect() with backoff and re-arms active startNotifications on an UNEXPECTED drop (no app code change)', async () => {
    const { nav, server, characteristic, requestDevice } = makeExtensionNavigatorWithDevice();
    mockNavigator(nav);
    await importAuto();

    // The drop-in app consumes the BARE polyfilled global — no Beacio wrapper.
    const device: any = await (globalThis.navigator as any).bluetooth.requestDevice({
      filters: [{ namePrefix: 'S&B VOLCANO' }],
    });
    expect(requestDevice).toHaveBeenCalledTimes(1);

    // Initial foreground connect + an active notification subscription, exactly
    // as the S&B telemetry path (current-temperature 10110001) does.
    const gattServer = await device.gatt.connect();
    const svc = await gattServer.getPrimaryService(characteristic.uuid);
    const ch = await svc.getCharacteristic(characteristic.uuid);
    await ch.startNotifications();
    expect(characteristic.startNotifications).toHaveBeenCalledTimes(1);

    const connectCallsBeforeDrop = server.connect.mock.calls.length;

    // Transient drop (device powered off / out of range). The extension's
    // injected device fires gattserverdisconnected; NO disconnect() was called.
    server.connected = false;
    for (const [type, listener] of device.addEventListener.mock.calls as Array<[string, (ev?: any) => void]>) {
      if (type === 'gattserverdisconnected') listener({ type: 'gattserverdisconnected' });
    }

    // Drive the documented default backoff (1s initial) and let the chain settle.
    await jest.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();

    // (1) The supervisor retried the connection on the SAME gatt server.
    expect(server.connect.mock.calls.length).toBeGreaterThan(connectCallsBeforeDrop);
    // (2) The previously-active subscription was recovered (re-subscribed) with
    //     no app code change — startNotifications fired again after reconnect.
    expect(characteristic.startNotifications.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('does NOT auto-reconnect after an INTENTIONAL gatt.disconnect() (matches device.ts intentional/unexpected classification)', async () => {
    const { nav, server } = makeExtensionNavigatorWithDevice();
    mockNavigator(nav);
    await importAuto();

    const device: any = await (globalThis.navigator as any).bluetooth.requestDevice({ acceptAllDevices: true });
    await device.gatt.connect();

    // App calls disconnect() itself → the next gattserverdisconnected is the
    // expected echo of that intentional teardown.
    device.gatt.disconnect();
    const connectCallsAfterIntentional = server.connect.mock.calls.length;

    for (const [type, listener] of device.addEventListener.mock.calls as Array<[string, (ev?: any) => void]>) {
      if (type === 'gattserverdisconnected') listener({ type: 'gattserverdisconnected' });
    }
    await jest.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();

    // No auto gatt.connect() after an intentional disconnect.
    expect(server.connect.mock.calls.length).toBe(connectCallsAfterIntentional);
  });

  it('uses the connectAndDiscover fast-path when the gatt server exposes it (AC#3), and falls back to plain connect otherwise', async () => {
    // Fast-path present.
    const withFastPath = makeExtensionNavigatorWithDevice({ withConnectAndDiscover: true });
    mockNavigator(withFastPath.nav);
    await importAuto();

    const fastDevice: any = await (globalThis.navigator as any).bluetooth.requestDevice({ acceptAllDevices: true });
    const fastServer = await fastDevice.gatt.connect();
    const fastSvc = await fastServer.getPrimaryService(withFastPath.characteristic.uuid);
    const fastCh = await fastSvc.getCharacteristic(withFastPath.characteristic.uuid);
    await fastCh.startNotifications();

    withFastPath.fireDisconnect();
    await jest.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();

    expect(withFastPath.server.connectAndDiscover).toHaveBeenCalled();
    expect(withFastPath.characteristic.startNotifications.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Fallback: no connectAndDiscover → plain connect, no error.
    jest.resetModules();
    const noFastPath = makeExtensionNavigatorWithDevice({ withConnectAndDiscover: false });
    mockNavigator(noFastPath.nav);
    await import('../src/auto');

    const plainDevice: any = await (globalThis.navigator as any).bluetooth.requestDevice({ acceptAllDevices: true });
    const plainServer = await plainDevice.gatt.connect();
    const plainSvc = await plainServer.getPrimaryService(noFastPath.characteristic.uuid);
    const plainCh = await plainSvc.getCharacteristic(noFastPath.characteristic.uuid);
    await plainCh.startNotifications();
    const connectsBefore = noFastPath.server.connect.mock.calls.length;

    noFastPath.fireDisconnect();
    await jest.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();

    expect((noFastPath.server as any).connectAndDiscover).toBeUndefined();
    expect(noFastPath.server.connect.mock.calls.length).toBeGreaterThan(connectsBefore);
  });
});

// AC#5 — the feature is a NO-OP off the beacio runtime: a native-shaped
// navigator (Chrome/Edge/Android) and the unsupported stub must keep
// requestDevice untouched and attach no reconnect supervisor.
describe('SB-SDK-13 — no-op off the beacio runtime (AC#5)', () => {
  it('leaves a native (Chrome) navigator.bluetooth.requestDevice strictly untouched', async () => {
    const requestDevice = jest.fn(async () => ({ id: 'x', gatt: { connect: jest.fn(), connected: false } }));
    const bluetooth: any = {
      requestDevice,
      getAvailability: jest.fn(async () => true),
      getDevices: jest.fn(async () => []),
    };
    const nav: any = { bluetooth, permissions: { query: jest.fn() } };
    mockNavigator(nav);
    await importAuto();

    // Native path is a no-op: same object, same requestDevice identity, no wrap.
    expect((globalThis.navigator as any).bluetooth).toBe(bluetooth);
    expect((globalThis.navigator as any).bluetooth.requestDevice).toBe(requestDevice);
  });

  it('does not attach a reconnect supervisor on the unsupported stub path', async () => {
    mockNavigator({});
    await importAuto();

    const bluetooth: any = (globalThis.navigator as any).bluetooth;
    // The unsupported stub rejects requestDevice with NotFoundError; it must not
    // resolve a supervised device. (No beacio runtime → nothing to supervise.)
    const error = await bluetooth.requestDevice({ acceptAllDevices: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('NotFoundError');
  });
});

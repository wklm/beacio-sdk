import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { BluetoothUUID } from '../src/uuid';

// §4.1 Permission API Integration — the navigator.permissions.query shim must
// be HONEST (permissions-query-bluetooth-unsupported):
// - patched only when an extension-backed bluetooth API actually exists
// - state is 'prompt' (chooser-based UA can always prompt) — never a synthetic
//   always-'granted'
// - BluetoothPermissionResult.devices is backed by the native grant query
//   (getDevices), filtered by descriptor.deviceId
// - unsupported platforms keep the browser's native behavior (no patch)

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

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    writable: true,
    configurable: true,
  });
});

function makeExtensionNavigator(grantedDevices: Array<{ id: string; name?: string }>) {
  const originalQuery = jest.fn(async (descriptor: any) => {
    if (descriptor?.name === 'bluetooth') {
      throw new TypeError("'bluetooth' is not a valid PermissionName");
    }
    return { state: 'granted', name: descriptor?.name } as any;
  });
  const nav: any = {
    beacio: {
      __beacio: true,
      requestDevice: jest.fn(),
      getAvailability: jest.fn(),
      getDevices: jest.fn(async () => grantedDevices),
    },
    permissions: { query: originalQuery },
  };
  return { nav, originalQuery };
}

describe('auto polyfill permissions shim (§4.1)', () => {
  it('reports state "prompt" — never a synthetic "granted" — when the extension is active', async () => {
    const { nav } = makeExtensionNavigator([]);
    mockNavigator(nav);
    await importAuto();

    const status: any = await nav.permissions.query({ name: 'bluetooth' });
    expect(status.state).toBe('prompt');
    expect(status.name).toBe('bluetooth');
  });

  it('exposes BluetoothPermissionResult.devices backed by the native grant query', async () => {
    const { nav } = makeExtensionNavigator([
      { id: 'alias-a', name: 'HRM' },
      { id: 'alias-b', name: 'Thermometer' },
    ]);
    mockNavigator(nav);
    await importAuto();

    const status: any = await nav.permissions.query({ name: 'bluetooth' });
    expect(status.devices.map((device: any) => device.id)).toEqual(['alias-a', 'alias-b']);
    expect(Object.isFrozen(status.devices)).toBe(true);
  });

  it('filters devices by descriptor.deviceId', async () => {
    const { nav } = makeExtensionNavigator([
      { id: 'alias-a', name: 'HRM' },
      { id: 'alias-b', name: 'Thermometer' },
    ]);
    mockNavigator(nav);
    await importAuto();

    const matching: any = await nav.permissions.query({ name: 'bluetooth', deviceId: 'alias-b' } as any);
    expect(matching.devices.map((device: any) => device.id)).toEqual(['alias-b']);

    const missing: any = await nav.permissions.query({ name: 'bluetooth', deviceId: 'alias-gone' } as any);
    expect(missing.devices).toEqual([]);
  });

  it('delegates non-bluetooth descriptors to the original query', async () => {
    const { nav, originalQuery } = makeExtensionNavigator([]);
    mockNavigator(nav);
    await importAuto();

    const status: any = await nav.permissions.query({ name: 'geolocation' } as any);
    expect(status.state).toBe('granted');
    expect(originalQuery).toHaveBeenCalledWith({ name: 'geolocation' });
  });

  it('does NOT patch navigator.permissions on unsupported platforms', async () => {
    const originalQuery = jest.fn(async () => {
      throw new TypeError("'bluetooth' is not a valid PermissionName");
    });
    mockNavigator({ permissions: { query: originalQuery } });
    await importAuto();

    expect((globalThis.navigator as any).permissions.query).toBe(originalQuery);
    await expect(
      (globalThis.navigator as any).permissions.query({ name: 'bluetooth' })
    ).rejects.toBeInstanceOf(TypeError);
  });
});

// §6.6.6 IDL event handlers — the W3C navigator.bluetooth proxy must expose
// ALL mixin onX attributes (Bluetooth includes BluetoothDeviceEventHandlers,
// CharacteristicEventHandlers and ServiceEventHandlers), and assigning them
// must not throw (the old set trap returned false → strict-mode TypeError).
describe('auto polyfill W3C surface — §6.6.6 mixin handler attributes', () => {
  const MIXIN_HANDLERS = [
    'onavailabilitychanged',
    'onadvertisementreceived',
    'ongattserverdisconnected',
    'oncharacteristicvaluechanged',
    'onserviceadded',
    'onservicechanged',
    'onserviceremoved',
  ] as const;

  async function makeBluetoothProxy(): Promise<any> {
    const { nav } = makeExtensionNavigator([]);
    mockNavigator(nav);
    await importAuto();
    return (globalThis.navigator as any).bluetooth;
  }

  it('exposes and round-trips every mixin onX attribute with function identity', async () => {
    const bluetooth = await makeBluetoothProxy();

    for (const prop of MIXIN_HANDLERS) {
      expect(prop in bluetooth).toBe(true);
      const handler = jest.fn();
      expect(() => {
        bluetooth[prop] = handler;
      }).not.toThrow();
      // Handler-attribute getters return the exact assigned function — the
      // proxy must not bind() event handlers.
      expect(bluetooth[prop]).toBe(handler);
    }
    expect(Object.keys(bluetooth)).toEqual(expect.arrayContaining([...MIXIN_HANDLERS]));
  });

  it('still hides non-W3C members and keeps page writes off the vendor surface', async () => {
    const bluetooth = await makeBluetoothProxy();

    expect(bluetooth.peripheral).toBeUndefined();
    expect('peripheral' in bluetooth).toBe(false);
    // Real platform objects accept expando writes (plain-object semantics) —
    // the old proxy silently swallowed them, which ordinary objects never do.
    // What matters is that the write NEVER reaches the live vendor API.
    expect(() => {
      bluetooth.peripheral = { hijacked: true };
    }).not.toThrow();
    expect((globalThis.navigator as any).beacio.peripheral).toBeUndefined();
  });

  it('exposes referringDevice as a constant-null readonly attribute (§4)', async () => {
    const bluetooth = await makeBluetoothProxy();

    expect('referringDevice' in bluetooth).toBe(true);
    expect(bluetooth.referringDevice).toBeNull();
    expect(Object.keys(bluetooth)).toEqual(expect.arrayContaining(['referringDevice']));
  });
});

// [SameObject] (navigator-bluetooth-getter-new-proxy-per-access): "[SameObject]
// readonly attribute Bluetooth bluetooth" — the same Bluetooth object must be
// returned for the Navigator's lifetime, with stable method identities.
describe('auto polyfill navigator.bluetooth [SameObject] (§10)', () => {
  it('returns the identical facade on every access with stable method identity', async () => {
    const { nav } = makeExtensionNavigator([]);
    mockNavigator(nav);
    await importAuto();

    const first = (globalThis.navigator as any).bluetooth;
    const second = (globalThis.navigator as any).bluetooth;
    expect(first).toBe(second);
    expect(first.requestDevice).toBe(second.requestDevice);
    expect(first.getAvailability).toBe(second.getAvailability);
    expect(first.getDevices).toBe(second.getDevices);
  });
});

// ES essential invariants (facade-proxy-violates-essential-invariants): the
// injected vendor object carries NON-CONFIGURABLE own props (debug, __beacio).
// Platform-object introspection of the W3C facade must never throw because of
// them, and they must stay invisible on the standard surface.
describe('auto polyfill facade — introspection never throws (ES invariants)', () => {
  async function makeFacadeOverInjectedShape(): Promise<any> {
    const api: any = {
      requestDevice: jest.fn(),
      getAvailability: jest.fn(async () => true),
      getDevices: jest.fn(async () => []),
    };
    // Mirror injected-full.ts: debug accessor + __beacio marker.
    Object.defineProperty(api, 'debug', {
      get: () => false,
      set: () => {},
      enumerable: true,
      configurable: false,
    });
    Object.defineProperty(api, '__beacio', {
      value: true,
      writable: false,
      enumerable: false,
      configurable: false,
    });
    mockNavigator({ beacio: api });
    await importAuto();
    return (globalThis.navigator as any).bluetooth;
  }

  it('Object.keys / spread / for...in / hasOwn / JSON.stringify never throw', async () => {
    const bluetooth = await makeFacadeOverInjectedShape();

    expect(() => Object.keys(bluetooth)).not.toThrow();
    expect(() => ({ ...bluetooth })).not.toThrow();
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const key in bluetooth) { /* enumeration must not throw */ }
    }).not.toThrow();
    expect(() => Object.getOwnPropertyNames(bluetooth)).not.toThrow();
    expect(() => Object.prototype.hasOwnProperty.call(bluetooth, '__beacio')).not.toThrow();
    expect(() => JSON.stringify(bluetooth)).not.toThrow();
    expect(() => '__beacio' in bluetooth).not.toThrow();
    expect(() => 'debug' in bluetooth).not.toThrow();
  });

  it('keeps vendor members off the standard surface and stays an EventTarget', async () => {
    const bluetooth = await makeFacadeOverInjectedShape();

    expect(Object.keys(bluetooth)).not.toEqual(expect.arrayContaining(['debug']));
    expect('debug' in bluetooth).toBe(false);
    expect('__beacio' in bluetooth).toBe(false);
    expect(bluetooth.debug).toBeUndefined();
    expect(bluetooth.__beacio).toBeUndefined();
    expect(bluetooth instanceof EventTarget).toBe(true);
  });
});

// §4 IDL "attribute EventHandler onavailabilitychanged"
// (proxy-receiver-breaks-handler-attribute-readback): assignment through the
// facade must read back the exact function when the live API backs the
// attribute with accessor + private storage (as the injected class does).
describe('auto polyfill handler-attribute readback (§4 IDL)', () => {
  it('round-trips accessor-backed onavailabilitychanged through the facade', async () => {
    const api: any = {
      __beacio: true,
      requestDevice: jest.fn(),
      getAvailability: jest.fn(),
      getDevices: jest.fn(async () => []),
      _onavailabilitychanged: null,
    };
    Object.defineProperty(api, 'onavailabilitychanged', {
      get() { return this._onavailabilitychanged; },
      set(handler) { this._onavailabilitychanged = handler; },
      enumerable: true,
      configurable: true,
    });
    mockNavigator({ beacio: api, permissions: { query: jest.fn() } });
    await importAuto();

    const bluetooth = (globalThis.navigator as any).bluetooth;
    const handler = jest.fn();
    bluetooth.onavailabilitychanged = handler;
    expect(bluetooth.onavailabilitychanged).toBe(handler);
    // The accessor ran against the live instance — not a parallel slot.
    expect(api._onavailabilitychanged).toBe(handler);
  });
});

// §4 IDL `interface Bluetooth : EventTarget` (unsupported-platform-stub-
// shape-nonconformant): the no-extension fallback must match the Bluetooth
// IDL shape and reject with proper DOMExceptions — never plain Errors.
describe('auto polyfill unsupported stub — Bluetooth IDL shape', () => {
  it('mounts a complete EventTarget-derived stub with the §4 member set', async () => {
    mockNavigator({});
    await importAuto();

    const bluetooth = (globalThis.navigator as any).bluetooth;
    // [SameObject]
    expect(bluetooth).toBe((globalThis.navigator as any).bluetooth);
    expect(bluetooth instanceof EventTarget).toBe(true);
    expect(typeof bluetooth.addEventListener).toBe('function');
    expect(typeof bluetooth.removeEventListener).toBe('function');
    expect(typeof bluetooth.dispatchEvent).toBe('function');
    expect(typeof bluetooth.requestDevice).toBe('function');
    await expect(bluetooth.getAvailability()).resolves.toBe(false);
    await expect(bluetooth.getDevices()).resolves.toEqual([]);
    expect(bluetooth.referringDevice).toBeNull();
  });

  it('exposes working onX EventHandler attributes on the stub', async () => {
    mockNavigator({});
    await importAuto();

    const bluetooth = (globalThis.navigator as any).bluetooth;
    expect(bluetooth.onavailabilitychanged).toBeNull();
    const handler = jest.fn();
    bluetooth.onavailabilitychanged = handler;
    expect(bluetooth.onavailabilitychanged).toBe(handler);
    bluetooth.dispatchEvent(new Event('availabilitychanged'));
    expect(handler).toHaveBeenCalled();
  });

  it('requestDevice rejects with a NotFoundError DOMException (not a plain Error)', async () => {
    mockNavigator({});
    await importAuto();

    const bluetooth = (globalThis.navigator as any).bluetooth;
    const error = await bluetooth
      .requestDevice({ acceptAllDevices: true })
      .catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('NotFoundError');
  });
});

// §10 [SecureContext] (polyfill-installs-in-insecure-contexts): the bluetooth
// attribute only exists in secure contexts — plain-http pages must get neither
// navigator.bluetooth (not even the throwing stub) nor a patched
// navigator.permissions. BluetoothUUID is a plain global and may stay.
describe('auto polyfill secure-context gate (§10 [SecureContext])', () => {
  afterEach(() => {
    delete (window as any).__forcedSecureContext;
    Object.defineProperty(window, 'isSecureContext', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  function setInsecureContext(): void {
    Object.defineProperty(window, 'isSecureContext', {
      value: false,
      writable: true,
      configurable: true,
    });
  }

  it('does not define navigator.bluetooth on insecure pages (unsupported platform)', async () => {
    setInsecureContext();
    mockNavigator({});
    await importAuto();

    expect((globalThis.navigator as any).bluetooth).toBeUndefined();
  });

  it('does not patch navigator.permissions on insecure pages even with the extension present', async () => {
    setInsecureContext();
    const { nav, originalQuery } = makeExtensionNavigator([]);
    mockNavigator(nav);
    await importAuto();

    expect((globalThis.navigator as any).bluetooth).toBeUndefined();
    expect(nav.permissions.query).toBe(originalQuery);
  });

  it('still exposes the BluetoothUUID global on insecure pages', async () => {
    setInsecureContext();
    delete (window as any).BluetoothUUID;
    mockNavigator({});
    await importAuto();

    expect((window as any).BluetoothUUID).toBeDefined();
  });
});

// §10 (api-unavailable-at-document-start): auto.ts runs a one-shot platform
// probe at import time and can lose the race against the extension's injected
// script. The throwing "unsupported" stub must upgrade deterministically when
// `beacio:extension:ready` fires instead of staying installed forever.
describe('auto polyfill late-extension upgrade (api-unavailable-at-document-start)', () => {
  it('re-binds navigator.bluetooth to the extension API on beacio:extension:ready', async () => {
    const nav: any = {};
    mockNavigator(nav);
    await importAuto();

    // Lost the race: unsupported stub is installed.
    await expect(nav.bluetooth.getAvailability()).resolves.toBe(false);

    // Extension finishes its handshake afterwards.
    nav.beacio = {
      __beacio: true,
      requestDevice: jest.fn(async () => 'real-device'),
      getAvailability: jest.fn(async () => true),
      getDevices: jest.fn(async () => []),
    };
    window.dispatchEvent(new Event('beacio:extension:ready'));

    await expect(nav.bluetooth.getAvailability()).resolves.toBe(true);
    expect(nav.beacio.getAvailability).toHaveBeenCalled();
    // [SameObject]: the upgraded proxy is stable across accesses.
    expect(nav.bluetooth).toBe(nav.bluetooth);
  });

  it('leaves a page-installed navigator.bluetooth alone on the ready signal', async () => {
    const nav: any = {};
    mockNavigator(nav);
    await importAuto();

    const pageOwned = { pageOwned: true };
    Object.defineProperty(nav, 'bluetooth', { value: pageOwned, configurable: true });
    nav.beacio = { __beacio: true, getAvailability: jest.fn(async () => true) };
    window.dispatchEvent(new Event('beacio:extension:ready'));

    expect(nav.bluetooth).toBe(pageOwned);
  });
});

// Native (Chrome/Edge/Android) no-op (auto.ts native early-return + BluetoothUUID
// guard). This is a blocker-class guarantee: a Chrome-shaped navigator (native
// `bluetooth`, no `__beacio`/`__beacioCDNStub` marker) detects as 'native', so
// applyPolyfill MUST leave navigator.bluetooth and its method identities strictly
// untouched — the demo fork's pitch is that beacio "changes nothing off-iOS".
// The ONE benign mutation the native path makes is exposing window.BluetoothUUID,
// and ONLY when absent (guarded by `!window.BluetoothUUID`); both the no-clobber
// guard and the absent→added behavior are pinned here so the off-iOS-safe claim is
// test-backed.
describe('auto polyfill native no-op (Chrome/Edge/Android)', () => {
  function makeNativeNavigator() {
    // jest.fn() identities captured before import so we can assert the polyfill
    // never reassigns them. Chrome-shaped: real bluetooth + permissions, and
    // crucially NO __beacioCDNStub / __beacio marker (→ detectPlatform 'native').
    const requestDevice = jest.fn();
    const getAvailability = jest.fn(async () => true);
    const getDevices = jest.fn(async () => []);
    const query = jest.fn(async (descriptor: any) => ({ state: 'granted', name: descriptor?.name }) as any);
    const bluetooth = { requestDevice, getAvailability, getDevices };
    const nav: any = { bluetooth, permissions: { query } };
    return { nav, bluetooth, requestDevice, query };
  }

  it('leaves navigator.bluetooth and its method identities strictly untouched', async () => {
    const { nav, bluetooth, requestDevice } = makeNativeNavigator();
    mockNavigator(nav);
    await importAuto();

    // Same object reference — not wrapped in a facade or replaced by a stub.
    expect((globalThis.navigator as any).bluetooth).toBe(bluetooth);
    // Method identity unchanged (the native path must not rebind requestDevice).
    expect((globalThis.navigator as any).bluetooth.requestDevice).toBe(requestDevice);
  });

  it('does NOT patch navigator.permissions.query on native', async () => {
    const { nav, query } = makeNativeNavigator();
    mockNavigator(nav);
    await importAuto();

    // permissions shim is extension-only; native keeps the browser's own query.
    expect((globalThis.navigator as any).permissions.query).toBe(query);
  });

  it('does NOT clobber a pre-existing window.BluetoothUUID (native namespace preserved)', async () => {
    const sentinel = { nativeBluetoothUUID: true };
    (window as any).BluetoothUUID = sentinel;
    const { nav } = makeNativeNavigator();
    mockNavigator(nav);
    await importAuto();

    // The `!window.BluetoothUUID` guard means Chrome's native BluetoothUUID
    // (or any pre-existing global) is left exactly as-is.
    expect((window as any).BluetoothUUID).toBe(sentinel);
  });

  it('adds beacio BluetoothUUID on native ONLY when absent (single benign mutation)', async () => {
    delete (window as any).BluetoothUUID;
    const { nav } = makeNativeNavigator();
    mockNavigator(nav);
    await importAuto();

    // Codifies current behavior: when the global is missing the polyfill fills
    // it in even on native. This is the lone, additive, non-clobbering mutation —
    // it never touches navigator.bluetooth itself. (Asserted by beacio's
    // BluetoothUUID contract rather than `===` because importAuto resets the
    // module registry, so the installed object is a distinct instance from this
    // file's top-level import.)
    const installed = (window as any).BluetoothUUID;
    expect(installed).toBeDefined();
    expect(typeof installed.canonicalUUID).toBe('function');
    expect(installed.canonicalUUID(0x180d)).toBe(BluetoothUUID.canonicalUUID(0x180d));
  });
});

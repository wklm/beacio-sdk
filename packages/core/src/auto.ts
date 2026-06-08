/**
 * @ios-web-bluetooth/core/auto — Transparent Web Bluetooth polyfill.
 *
 * Usage: import '@ios-web-bluetooth/core/auto';
 *
 * - Chrome/Edge (native bluetooth): no-op
 * - Safari iOS (with extension): ensures navigator.bluetooth maps to extension API
 * - Safari iOS (without extension): lazy-loads install prompt on first requestDevice()
 * - Unsupported platforms: no-op (graceful degradation)
 */

import { detectPlatform, getBluetoothAPI } from './platform';
import { BluetoothUUID } from './uuid';

/**
 * Patch navigator.permissions.query to support { name: 'bluetooth' }.
 * Returns 'granted' when the extension is active, 'prompt' otherwise.
 */
function patchPermissionsAPI(state: PermissionState): void {
  if (typeof navigator === 'undefined' || !navigator.permissions) return;

  const originalQuery = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = function (
    descriptor: PermissionDescriptor
  ): Promise<PermissionStatus> {
    if ((descriptor as any).name === 'bluetooth') {
      // Synthesize a PermissionStatus-like object
      const target = new EventTarget();
      const status = Object.create(target, {
        state: { get: () => state, enumerable: true },
        name: { get: () => 'bluetooth', enumerable: true },
        onchange: { value: null, writable: true, enumerable: true },
      }) as PermissionStatus;
      return Promise.resolve(status);
    }
    return originalQuery(descriptor);
  };
}

/**
 * Members allowed on the polyfilled `navigator.bluetooth`. Everything else
 * (peripheral, backgroundSync, getCapabilities, debug, __webble, etc.) is
 * filtered out so the polyfill surface matches the W3C Web Bluetooth spec
 * exactly. iOS-specific capabilities are reached via `window.webbleIOS`.
 */
const W3C_BLUETOOTH_MEMBERS: ReadonlySet<string> = new Set([
  // Bluetooth interface (spec §4)
  'requestDevice',
  'getAvailability',
  'getDevices',
  'onavailabilitychanged',
  // EventTarget
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
]);

function buildW3CProxy(api: object): object {
  return new Proxy(api, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
      if (!W3C_BLUETOOTH_MEMBERS.has(prop)) return undefined;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, prop, value) {
      if (typeof prop !== 'symbol' && !W3C_BLUETOOTH_MEMBERS.has(prop)) return false;
      return Reflect.set(target, prop, value);
    },
    has(_target, prop) {
      return typeof prop === 'symbol' || W3C_BLUETOOTH_MEMBERS.has(prop);
    },
    ownKeys() {
      return Array.from(W3C_BLUETOOTH_MEMBERS);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === 'symbol' || !W3C_BLUETOOTH_MEMBERS.has(prop)) return undefined;
      const value = Reflect.get(target, prop);
      return {
        enumerable: true,
        configurable: true,
        value: typeof value === 'function' ? value.bind(target) : value,
      };
    },
    getPrototypeOf() {
      // Expose EventTarget.prototype so `instanceof EventTarget` holds.
      return EventTarget.prototype;
    },
  });
}

function applyPolyfill(): void {
  if (typeof navigator === 'undefined') return;

  const bluetoothNavigator = navigator as Navigator & {
    bluetooth?: Bluetooth;
  };

  // Expose BluetoothUUID global (spec §4) on all platforms
  if (typeof window !== 'undefined' && !(window as any).BluetoothUUID) {
    (window as any).BluetoothUUID = BluetoothUUID;
  }

  const platform = detectPlatform();

  if (platform === 'native') {
    // Chrome, Edge, etc. — native Web Bluetooth already works
    return;
  }

  if (platform === 'safari-extension') {
    // Extension provides the full vendor surface on navigator.webble. We expose
    // two distinct facades here:
    //   1. navigator.bluetooth — W3C-only proxy (requestDevice, getAvailability,
    //      getDevices, onavailabilitychanged, EventTarget). Non-standard iOS
    //      members (peripheral, backgroundSync, getCapabilities) are hidden so
    //      portable code matches Chrome/Edge exactly.
    //   2. window.webbleIOS — vendor-prefixed iOS capabilities. The extension
    //      already mounts this; we only mirror when missing (e.g. if the
    //      polyfill loads in a context where it wasn't mounted).
    const api = getBluetoothAPI();
    if (api && !bluetoothNavigator.bluetooth) {
      Object.defineProperty(navigator, 'bluetooth', {
        get: () => buildW3CProxy(api),
        configurable: true,
      });
    }
    if (typeof window !== 'undefined' && !(window as any).webbleIOS) {
      const ios = (api as any)?.peripheral || (api as any)?.backgroundSync
        ? { peripheral: (api as any).peripheral, backgroundSync: (api as any).backgroundSync, getCapabilities: () => (api as any).getCapabilities?.() }
        : undefined;
      if (ios) {
        Object.defineProperty(window, 'webbleIOS', {
          value: Object.freeze(ios), writable: false, enumerable: true, configurable: false,
        });
      }
    }
    // Permissions API: extension active → 'granted'
    patchPermissionsAPI('granted');
    return;
  }

  // Unsupported or Safari without extension — install lazy proxy
  // Permissions API: no extension → 'prompt'
  patchPermissionsAPI('prompt');
  if (!bluetoothNavigator.bluetooth) {
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop) {
        if (prop === 'requestDevice') {
          return async (...args: unknown[]) => {
            // Attempt dynamic import of @ios-web-bluetooth/detect for install banner
            try {
              const detect = await import('@ios-web-bluetooth/detect');
              if (typeof detect.showInstallBanner === 'function') {
                detect.showInstallBanner();
              }
            } catch {
              // @ios-web-bluetooth/detect not installed — throw descriptive error
            }
            throw new Error(
              'Web Bluetooth is not supported on this platform. ' +
              'On iOS Safari, install the WebBLE extension. ' +
              'See: https://ioswebble.com'
            );
          };
        }
        if (prop === 'getAvailability') {
          return async () => false;
        }
        return undefined;
      },
    };

    const proxy = new Proxy({} as Record<string, unknown>, handler);
    Object.defineProperty(navigator, 'bluetooth', {
      get: () => proxy,
      configurable: true,
    });
  }
}

applyPolyfill();

/**
 * @beacio/core/auto — Transparent Web Bluetooth polyfill.
 *
 * Usage: import '@beacio/core/auto';
 *
 * - Chrome/Edge (native bluetooth): no-op
 * - Safari iOS (with extension): ensures navigator.bluetooth maps to extension API
 * - Safari iOS (without extension): lazy-loads install prompt on first requestDevice()
 * - Unsupported platforms: no-op (graceful degradation)
 */

import { detectPlatform, getBluetoothAPI, CDN_STUB_MARKER } from './platform';
import { BluetoothUUID } from './uuid';
import { BEACIO_EVENTS } from './events';
import type { RawAutoReconnectConfig } from './types';

/**
 * Patch navigator.permissions.query to support { name: 'bluetooth' } (§4.1
 * Permission API Integration).
 *
 * Honesty rules (permissions-query-bluetooth-unsupported):
 * - Patched ONLY when an extension-backed bluetooth API actually exists —
 *   unsupported platforms keep the browser's native behavior (TypeError on
 *   the name, matching Chrome).
 * - `state` is always 'prompt': with a chooser-based UA every new-device
 *   access can prompt, so 'granted' is never synthesized.
 * - The §4.1 BluetoothPermissionResult.devices array is backed by the native
 *   grant query (getDevices()), filtered by descriptor.deviceId when present.
 *   descriptor.filters matching needs advertisement data the page does not
 *   have, so filters are ignored (best-effort superset, never an error).
 */
function patchPermissionsAPI(api: { getDevices?: () => Promise<BluetoothDevice[]> }): void {
  if (typeof navigator === 'undefined' || !navigator.permissions) return;

  const originalQuery = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = async function (
    descriptor: PermissionDescriptor
  ): Promise<PermissionStatus> {
    if ((descriptor as { name: string }).name !== 'bluetooth') {
      return originalQuery(descriptor);
    }

    const requestedDeviceId = (descriptor as { deviceId?: string }).deviceId;
    let devices: BluetoothDevice[] = [];
    if (typeof api.getDevices === 'function') {
      try {
        const granted = await api.getDevices();
        devices = requestedDeviceId === undefined
          ? [...granted]
          : granted.filter((device) => (device as { id?: string }).id === requestedDeviceId);
      } catch {
        devices = [];
      }
    }
    const frozenDevices = Object.freeze(devices);

    const target = new EventTarget();
    const status = Object.create(target, {
      state: { get: () => 'prompt' as PermissionState, enumerable: true },
      name: { get: () => 'bluetooth', enumerable: true },
      onchange: { value: null, writable: true, enumerable: true },
      devices: { get: () => frozenDevices, enumerable: true },
    }) as PermissionStatus;
    return status;
  };
}

/**
 * Members allowed on the polyfilled `navigator.bluetooth`. Everything else
 * (peripheral, backgroundSync, getCapabilities, debug, __beacio, etc.) is
 * filtered out so the polyfill surface matches the W3C Web Bluetooth spec
 * exactly. iOS-specific capabilities are reached via `window.beacioIOS`.
 */
const W3C_BLUETOOTH_MEMBERS: ReadonlySet<string> = new Set([
  // Bluetooth interface (spec §4)
  'requestDevice',
  'getAvailability',
  'getDevices',
  // §4 "[SameObject] readonly attribute BluetoothDevice? referringDevice" —
  // constant null on iOS (no referring-device navigation mechanism exists),
  // but the attribute must be present and read null, never undefined.
  'referringDevice',
  // §6.6.6 IDL event handlers — Bluetooth includes
  // BluetoothDeviceEventHandlers, CharacteristicEventHandlers AND
  // ServiceEventHandlers, so all mixin onX attributes are part of the
  // standard surface (bubbled §6.6.1 tree events are handled at the root).
  'onavailabilitychanged',
  'onadvertisementreceived',
  'ongattserverdisconnected',
  'oncharacteristicvaluechanged',
  'onserviceadded',
  'onservicechanged',
  'onserviceremoved',
  // EventTarget
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
]);

/**
 * Event-handler IDL attributes must round-trip with identity (the getter
 * returns the exact function assigned) and their accessors must run against
 * the real Bluetooth instance — never bind them and never route their
 * get/set through the proxy receiver.
 */
function isEventHandlerMember(prop: string): boolean {
  return prop.startsWith('on');
}

/**
 * W3C facade over the live vendor API.
 *
 * A PLAIN EventTarget-derived object instead of a Proxy
 * (facade-proxy-violates-essential-invariants): the injected vendor object
 * carries NON-CONFIGURABLE own properties (`debug`, `__beacio`), and any
 * Proxy whose traps hide non-configurable target properties throws
 * TypeError during ordinary introspection (Object.keys, spread, `in`,
 * JSON.stringify). A plain object satisfies every ES invariant by
 * construction — vendor members are simply absent.
 *
 * - Methods are bound ONCE at build time → stable identities ([SameObject]
 *   method-identity half of navigator-bluetooth-getter-new-proxy-per-access).
 * - onX EventHandler attributes forward get/set to the live instance so the
 *   accessor runs against its real private storage and assignment reads back
 *   (proxy-receiver-breaks-handler-attribute-readback).
 * - referringDevice forwards (defaulting to null per §4) and stays readonly.
 * - Expando writes behave like any plain platform object wrapper and never
 *   reach the vendor surface.
 */
function buildW3CFacade(api: object): object {
  class BeacioW3CBluetooth extends EventTarget {}
  const facade = new BeacioW3CBluetooth();
  const source = api as { [key: string]: EventListener | BluetoothServiceUUID | BluetoothCharacteristicUUID | object };

  for (const member of W3C_BLUETOOTH_MEMBERS) {
    if (isEventHandlerMember(member)) {
      Object.defineProperty(facade, member, {
        get: () => (source[member] as EventListener) ?? null,
        set: (value) => { source[member] = value; },
        enumerable: true,
        configurable: true,
      });
      continue;
    }
    if (member === 'referringDevice') {
      Object.defineProperty(facade, member, {
        get: () => (source[member] as EventListener) ?? null,
        enumerable: true,
        configurable: true,
      });
      continue;
    }
    const value = source[member];
    if (typeof value === 'function') {
      Object.defineProperty(facade, member, {
        value: (value as (...args: object[]) => object).bind(api),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    // Members the live API does not implement as functions (e.g. EventTarget
    // methods on a partial mock) fall through to the facade's own inherited
    // EventTarget implementation.
  }
  return facade;
}

// ---------------------------------------------------------------------------
// SB-SDK-13 — Foreground auto-reconnect + subscription recovery for the RAW
// polyfilled navigator.bluetooth path.
//
// beacio's free foreground reconnect engine lives on the BeacioDevice wrapper
// (device.ts handleDisconnect/startAutoReconnect + notification-manager
// recoverSubscriptions). Real drop-in apps — the Storz & Bickel demo — consume
// the BARE global (navigator.bluetooth.requestDevice / device.gatt /
// characteristic.startNotifications) and so never reach that engine: a transient
// drop forces a full page reload.
//
// We close that gap WITHOUT touching the W3C facade surface or asking the app to
// instantiate Beacio: requestDevice's returned device is interposed by a thin,
// invariant-safe forwarding Proxy (get-trap only — it hides and lies about
// nothing, only swapping a handful of prototype METHOD identities, so frozen
// vendor instances and their readonly own props pass through untouched, unlike
// the facade's rejected hide-non-configurable Proxy). The interposer records the
// live gatt server, the discovered service UUIDs, and the (service,
// characteristic) pairs that had startNotifications active, then on an UNEXPECTED
// gattserverdisconnected runs the documented exponential backoff loop
// (defaults mirror AutoReconnectOptions: 1s/30s/2x/Infinity), reconnecting via
// the discovery fast-path (gatt.connectAndDiscover) when present and re-arming
// every recorded subscription. An intentional gatt.disconnect() flips a flag so
// the echoed event is ignored (matches device.ts:861 intentional/unexpected
// classification). Default-on for the beacio runtime; never installed off it.
// ---------------------------------------------------------------------------

/** Resolved backoff knobs for the supervisor (mirrors device.ts:898-901 defaults). */
interface ResolvedBackoff {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

function resolveAutoReconnectConfig(): { enabled: boolean; backoff: ResolvedBackoff } {
  const raw = (typeof window !== 'undefined'
    ? (window as { beacioAutoReconnect?: RawAutoReconnectConfig }).beacioAutoReconnect
    : undefined) ?? {};
  return {
    enabled: raw.enabled !== false,
    backoff: {
      maxAttempts: raw.maxAttempts ?? Infinity,
      initialDelayMs: raw.initialDelayMs ?? 1000,
      maxDelayMs: raw.maxDelayMs ?? 30000,
      backoffMultiplier: raw.backoffMultiplier ?? 2,
    },
  };
}

/**
 * Per-device reconnect state shared between the interposing proxies and the
 * disconnect supervisor.
 */
interface SupervisorState {
  /** Live gatt server from the most recent connect()/connectAndDiscover(). */
  server: BluetoothRemoteGATTServer | null;
  /** Whether the app called gatt.disconnect() itself (→ ignore the echoed event). */
  intentional: boolean;
  /** Whether a backoff loop is already running (guards against re-entrancy). */
  reconnecting: boolean;
  /** `service|characteristic` → the UUIDs needed to re-walk + re-arm on reconnect. */
  subscriptions: Map<string, { service: string; characteristic: string }>;
}

/**
 * A transparent get-trap forwarding Proxy. The `overrides` map supplies replacement
 * values (typically wrapped methods) for specific keys; every other access reflects
 * the target faithfully so the proxy preserves all ES essential invariants —
 * including readonly own props on a frozen vendor instance — because it never hides
 * a property nor reports a value different from the target for any OWN property
 * (the overridden keys are prototype methods, which carry no own-descriptor on the
 * instance). This is why a plain forwarding interposer is safe here even though the
 * facade (which had to HIDE non-configurable vendor own props) could not be a Proxy.
 */
function forwardingProxy<T extends object>(target: T, overrides: { [key: string]: object }): T {
  // PROTOTYPE methods (EventTarget's addEventListener, the GATT class methods) are
  // bound to the target so they keep a valid `this` when called as `proxy.method()`
  // — otherwise WebKit throws "Illegal invocation" / private-field brand-check
  // errors. OWN function-valued props are returned UNBOUND so app-assigned event
  // handlers (navigator.bluetooth.onX = fn) round-trip with their exact identity
  // and so partial-mock own methods keep their jest-spy reference. Bindings are
  // cached per key for a STABLE identity across reads ([SameObject]).
  const boundCache = new Map<PropertyKey, (...args: object[]) => object>();
  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(overrides, prop)) {
        return overrides[prop];
      }
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value !== 'function') return value;
      if (Object.prototype.hasOwnProperty.call(obj, prop)) return value;
      let bound = boundCache.get(prop) as ((...a: object[]) => object) | undefined;
      if (!bound) {
        bound = value.bind(obj) as (...a: object[]) => object;
        boundCache.set(prop, bound);
      }
      return bound;
    },
  });
}

/** Wrap a characteristic so start/stopNotifications keep the recovery registry in sync. */
function superviseCharacteristic(
  characteristic: BluetoothRemoteGATTCharacteristic,
  serviceUuid: string,
  state: SupervisorState,
): BluetoothRemoteGATTCharacteristic {
  const key = `${serviceUuid}|${characteristic.uuid}`;
  return forwardingProxy(characteristic, {
    startNotifications: async () => {
      const result = await characteristic.startNotifications();
      state.subscriptions.set(key, { service: serviceUuid, characteristic: characteristic.uuid });
      return result;
    },
    stopNotifications: async () => {
      const result = await characteristic.stopNotifications();
      state.subscriptions.delete(key);
      return result;
    },
  }) as BluetoothRemoteGATTCharacteristic;
}

/** Wrap a service so characteristics it hands out are supervised. */
function superviseService(
  service: BluetoothRemoteGATTService,
  state: SupervisorState,
): BluetoothRemoteGATTService {
  return forwardingProxy(service, {
    getCharacteristic: async (uuid: BluetoothCharacteristicUUID) => {
      const characteristic = await service.getCharacteristic(uuid);
      return superviseCharacteristic(characteristic, service.uuid, state);
    },
    getCharacteristics: async (uuid?: BluetoothCharacteristicUUID) => {
      const characteristics = await (service as {
        getCharacteristics: (u?: BluetoothCharacteristicUUID) => Promise<BluetoothRemoteGATTCharacteristic[]>;
      }).getCharacteristics(uuid);
      return characteristics.map((c) => superviseCharacteristic(c, service.uuid, state));
    },
  }) as BluetoothRemoteGATTService;
}

/** Wrap a gatt server so service lookups are supervised and the live server is recorded. */
function superviseServer(
  server: BluetoothRemoteGATTServer,
  state: SupervisorState,
): BluetoothRemoteGATTServer {
  state.server = server;
  return forwardingProxy(server, {
    getPrimaryService: async (uuid: BluetoothServiceUUID) => {
      const service = await server.getPrimaryService(uuid);
      return superviseService(service, state);
    },
    getPrimaryServices: async (uuid?: BluetoothServiceUUID) => {
      const services = await server.getPrimaryServices(uuid);
      return services.map((s) => superviseService(s, state));
    },
  }) as BluetoothRemoteGATTServer;
}

/** Wrap a device's gatt so connect/disconnect feed the supervisor. */
function superviseGatt(
  gatt: BluetoothRemoteGATTServer,
  state: SupervisorState,
): BluetoothRemoteGATTServer {
  return forwardingProxy(gatt, {
    connect: async () => {
      state.intentional = false;
      const server = await gatt.connect();
      return superviseServer(server, state);
    },
    disconnect: () => {
      // App-initiated teardown — the next gattserverdisconnected is its echo and
      // must NOT trigger auto-reconnect (matches device.ts:861).
      state.intentional = true;
      state.subscriptions.clear();
      state.server = null;
      gatt.disconnect();
    },
  }) as BluetoothRemoteGATTServer;
}

/** Re-acquire and re-subscribe every recorded characteristic after a reconnect. */
async function recoverSubscriptions(
  server: BluetoothRemoteGATTServer,
  state: SupervisorState,
): Promise<void> {
  for (const { service, characteristic } of [...state.subscriptions.values()]) {
    try {
      const svc = await server.getPrimaryService(service);
      const ch = await svc.getCharacteristic(characteristic);
      await ch.startNotifications();
    } catch {
      // Characteristic may no longer exist after a firmware/service change; drop
      // the stale entry so we stop trying to re-arm it (mirrors
      // notification-manager.recoverSubscriptions deleting stale registry keys).
      state.subscriptions.delete(`${service}|${characteristic}`);
    }
  }
}

/** Run the documented exponential-backoff reconnect loop after an unexpected drop. */
function startReconnectLoop(state: SupervisorState, backoff: ResolvedBackoff): void {
  if (state.reconnecting) return;
  const server = state.server;
  if (!server) return;
  state.reconnecting = true;

  // Snapshot which UUIDs to discover so the fast-path can warm them in one round-trip.
  const serviceUUIDs = [...new Set([...state.subscriptions.values()].map((s) => s.service))];

  void (async () => {
    let delay = backoff.initialDelayMs;
    for (let attempt = 1; attempt <= backoff.maxAttempts; attempt += 1) {
      if (state.intentional) break;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      if (state.intentional) break;
      try {
        const fastPath = (server as {
          connectAndDiscover?: (uuids: BluetoothServiceUUID[]) => Promise<BluetoothRemoteGATTService[]>;
        }).connectAndDiscover;
        if (typeof fastPath === 'function' && serviceUUIDs.length > 0) {
          // Discovery fast-path (AC#3): one warm-up round-trip for all services
          // instead of a connect() then per-service getPrimaryService chain.
          await fastPath.call(server, serviceUUIDs);
        } else {
          await server.connect();
        }
        await recoverSubscriptions(server, state);
        state.reconnecting = false;
        return;
      } catch {
        delay = Math.min(delay * backoff.backoffMultiplier, backoff.maxDelayMs);
      }
    }
    state.reconnecting = false;
  })();
}

/**
 * Interpose a foreground auto-reconnect supervisor over a device returned by the
 * polyfilled requestDevice. No-op-safe: a device without addEventListener/gatt
 * (e.g. a partial shape) is returned untouched.
 */
function superviseDevice(device: BluetoothDevice, backoff: ResolvedBackoff): BluetoothDevice {
  if (!device || typeof device.addEventListener !== 'function') return device;

  const state: SupervisorState = {
    server: null,
    intentional: false,
    reconnecting: false,
    subscriptions: new Map(),
  };

  // Attach to the RAW device so we see the extension's gattserverdisconnected
  // regardless of any listener the app adds through the wrapper.
  device.addEventListener('gattserverdisconnected', () => {
    if (state.intentional) {
      state.intentional = false;
      return;
    }
    startReconnectLoop(state, backoff);
  });

  let supervisedGatt: BluetoothRemoteGATTServer | undefined;
  return forwardingProxy(device, {
    get gatt(): BluetoothRemoteGATTServer | undefined {
      const raw = device.gatt;
      if (!raw) return undefined;
      // Cache so the intentional flag set via device.gatt.disconnect() is visible
      // to the same supervised gatt the app keeps using ([SameObject]-style).
      if (!supervisedGatt) supervisedGatt = superviseGatt(raw, state);
      return supervisedGatt;
    },
  } as { [key: string]: object }) as BluetoothDevice;
}

/**
 * Wrap a vendor API's requestDevice so every returned device is supervised
 * (SB-SDK-13). Returns the SAME api object when auto-reconnect is disabled or the
 * api has no requestDevice, so the W3C facade build is unaffected off the feature.
 */
function withAutoReconnect(api: object): object {
  const config = resolveAutoReconnectConfig();
  const source = api as { requestDevice?: (...args: RequestDeviceOptions[]) => Promise<BluetoothDevice> };
  if (!config.enabled || typeof source.requestDevice !== 'function') return api;

  const originalRequestDevice = source.requestDevice.bind(api);
  return forwardingProxy(api, {
    requestDevice: async (...args: RequestDeviceOptions[]) => {
      const device = await originalRequestDevice(...args);
      return superviseDevice(device, config.backoff);
    },
  });
}

/**
 * §4 IDL-shaped fallback for platforms with no Web Bluetooth support
 * (unsupported-platform-stub-shape-nonconformant): a real EventTarget with
 * the full Bluetooth member set. requestDevice rejects with a NotFoundError
 * DOMException (never a plain Error), getAvailability resolves false,
 * getDevices resolves [], referringDevice is null.
 */
function createUnsupportedBluetoothStub(): object {
  class BeacioUnsupportedBluetooth extends EventTarget {}
  const stub = new BeacioUnsupportedBluetooth();

  Object.defineProperty(stub, 'requestDevice', {
    value: async (..._args: RequestDeviceOptions[]) => {
      // Lazy-load the local detect surface for the install banner. detect now
      // lives INSIDE @beacio/core (src/detect/), so this is an intra-package
      // dynamic import — code-split into its own chunk so the eager polyfill
      // graph never carries the banner UI until the unsupported stub is used.
      // SB-SDK-07: this zero-config call passes NO lang, so the banner's i18n
      // seam (src/detect/i18n.ts resolveStrings) derives the language from
      // navigator.language — a German-locale iPhone gets the German banner with
      // no config here. An explicit `lang` is only ever supplied by a caller that
      // wires showInstallBanner/initBeacio directly (e.g. the S&B demo passes
      // lang:'de'); core's stub stays config-free and localizable.
      try {
        const detect = await import('./detect');
        if (typeof detect.showInstallBanner === 'function') {
          detect.showInstallBanner();
        }
      } catch {
        // Defensive — the banner import must never break the rejection path.
      }
      // §4 requestDevice: when no device/chooser can ever match, the spec
      // rejection class is NotFoundError — never a plain Error.
      throw new DOMException(
        'Web Bluetooth is not supported on this platform. ' +
        'On iOS Safari, install the Beacio extension. ' +
        'See: https://beacio.com',
        'NotFoundError'
      );
    },
    writable: true,
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(stub, 'getAvailability', {
    value: async () => false,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(stub, 'getDevices', {
    value: async () => [],
    writable: true,
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(stub, 'referringDevice', {
    get: () => null,
    enumerable: true,
    configurable: true,
  });

  for (const member of W3C_BLUETOOTH_MEMBERS) {
    if (!isEventHandlerMember(member)) continue;
    const eventType = member.slice(2);
    let current: EventListener | null = null;
    Object.defineProperty(stub, member, {
      get: () => current,
      set: (next: EventListener | null) => {
        if (current !== null) stub.removeEventListener(eventType, current);
        current = typeof next === 'function' ? (next as EventListener) : null;
        if (current !== null) stub.addEventListener(eventType, current);
      },
      enumerable: true,
      configurable: true,
    });
  }

  // Marker so detectPlatform()/getBluetoothAPI() never mistake our own stub
  // for a native implementation (same convention as the CDN stubs). Keyed off the
  // shared CDN_STUB_MARKER so the writer can never drift from the readers.
  Object.defineProperty(stub, CDN_STUB_MARKER, {
    value: true,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  return stub;
}

let polyfillApplied = false;

/**
 * Install the transparent W3C `navigator.bluetooth` polyfill for the current
 * platform (no-op on native/unsupported per the branches below). Runs once at
 * module load via the bottom-of-file call for `import '@beacio/core/auto'`
 * consumers; also EXPORTED so the consolidated `browser-auto` entry can invoke
 * it explicitly (a bare side-effect import is tree-shakeable under the package's
 * `sideEffects` allowlist). Idempotent: the module-level guard makes a second
 * call a no-op so the two entry points never double-register the permissions
 * shim or the extension-ready listener.
 */
export function applyPolyfill(): void {
  if (polyfillApplied) return;
  if (typeof navigator === 'undefined') return;
  polyfillApplied = true;

  const bluetoothNavigator = navigator as Navigator & {
    bluetooth?: Bluetooth;
  };

  // Expose BluetoothUUID global (spec §4) on all platforms
  if (typeof window !== 'undefined' && !(window as { BluetoothUUID?: object }).BluetoothUUID) {
    (window as { BluetoothUUID?: object }).BluetoothUUID = BluetoothUUID;
  }

  // §10 [SecureContext] (polyfill-installs-in-insecure-contexts): the spec
  // marks `Navigator.bluetooth` [SecureContext], so plain-http pages must
  // never get the attribute — not even the throwing "unsupported" stub — and
  // navigator.permissions must stay unpatched. BluetoothUUID (above) is a
  // plain global and may stay. `=== false` keeps SSR/legacy environments that
  // do not implement isSecureContext on their previous behavior.
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return;
  }

  const platform = detectPlatform();

  if (platform === 'native') {
    // Chrome, Edge, etc. — native Web Bluetooth already works
    return;
  }

  if (platform === 'safari-extension') {
    // Extension provides the full vendor surface on navigator.beacio. We expose
    // two distinct facades here:
    //   1. navigator.bluetooth — W3C-only proxy (requestDevice, getAvailability,
    //      getDevices, onavailabilitychanged, EventTarget). Non-standard iOS
    //      members (peripheral, backgroundSync, getCapabilities) are hidden so
    //      portable code matches Chrome/Edge exactly.
    //   2. window.beacioIOS — vendor-prefixed iOS capabilities. The extension
    //      already mounts this; we only mirror when missing (e.g. if the
    //      polyfill loads in a context where it wasn't mounted).
    const api = getBluetoothAPI();
    if (api && !bluetoothNavigator.bluetooth) {
      // [SameObject] (navigator-bluetooth-getter-new-proxy-per-access): build
      // the facade ONCE — every access returns the identical object with
      // stable method identities. The facade is built over the auto-reconnect
      // interposer (SB-SDK-13) so requestDevice hands back supervised devices on
      // the beacio runtime; every other W3C member forwards to the vendor api
      // unchanged, and the surface is byte-for-byte identical off the feature.
      const facade = buildW3CFacade(withAutoReconnect(api));
      Object.defineProperty(navigator, 'bluetooth', {
        get: () => facade,
        configurable: true,
      });
    }
    if (typeof window !== 'undefined' && !(window as { beacioIOS?: object }).beacioIOS) {
      const apiRec = api as { peripheral?: object; backgroundSync?: object; getCapabilities?: () => object } | undefined;
      const ios = apiRec?.peripheral || apiRec?.backgroundSync
        ? { peripheral: apiRec.peripheral, backgroundSync: apiRec.backgroundSync, getCapabilities: () => apiRec?.getCapabilities?.() }
        : undefined;
      if (ios) {
        Object.defineProperty(window, 'beacioIOS', {
          value: Object.freeze(ios as { peripheral?: object; backgroundSync?: object; getCapabilities?: () => object }), writable: false, enumerable: true, configurable: false,
        });
      }
    }
    // Permissions API (§4.1): extension active — honest shim backed by the
    // native grant query. State is 'prompt' (never synthetic 'granted').
    if (api) {
      patchPermissionsAPI(api as { getDevices?: () => Promise<BluetoothDevice[]> });
    }
    return;
  }

  // Unsupported or Safari without extension — install the §4 IDL-shaped stub
  // (unsupported-platform-stub-shape-nonconformant).
  // navigator.permissions is intentionally NOT patched here: with no working
  // bluetooth API behind it, a synthetic PermissionStatus would be a lie —
  // the browser's native TypeError on the name matches Chrome's behavior.
  if (!bluetoothNavigator.bluetooth) {
    // [SameObject]: one stub for the page's lifetime.
    const stub = createUnsupportedBluetoothStub();
    Object.defineProperty(navigator, 'bluetooth', {
      get: () => stub,
      configurable: true,
    });

    // §10 (api-unavailable-at-document-start): this one-shot probe can lose
    // the race against the extension's injected script — the throwing
    // "unsupported" stub must not stay installed forever on a page where the
    // extension comes up moments later. Re-bind deterministically on the
    // extension's ready signal.
    if (typeof window !== 'undefined') {
      window.addEventListener(BEACIO_EVENTS.EXTENSION_READY, () => {
        const api = getBluetoothAPI();
        if (!api || (api as object) === stub) return;
        const current = (navigator as { bluetooth?: object }).bluetooth;
        if (current !== undefined && current !== stub) return; // page/native owns it now
        const upgraded = buildW3CFacade(withAutoReconnect(api));
        Object.defineProperty(navigator, 'bluetooth', {
          get: () => upgraded,
          configurable: true,
        });
        // Extension active — the honest §4.1 permissions shim now applies.
        patchPermissionsAPI(api as { getDevices?: () => Promise<BluetoothDevice[]> });
      }, { once: true });
    }
  }
}

applyPolyfill();

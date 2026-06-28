import { BeacioDevice } from './device';
import { BeacioError } from './errors';
import { detectPlatform, getBluetoothAPI } from './platform';
import { resolveUUID } from './uuid';
import type {
  BackgroundConnectionOptions,
  BackgroundRegistration,
  BeaconScanningOptions,
  CharacteristicNotificationOptions,
  NotificationTemplate,
  Platform,
  RequestDeviceOptions,
  BeacioPeripheralServiceDefinition,
  BeacioPeripheralServiceRecord,
  BeacioBackgroundSync,
  BeacioOptions,
  BeacioPeripheral,
  BeacioPeripheralAdvertisingOptions,
  BeacioPeripheralSendOptions,
  BeacioPeripheralSendResult,
} from './types';

type RuntimeBluetooth = Bluetooth & {
  backgroundSync?: BeacioBackgroundSync;
  peripheral?: BeacioPeripheral;
};

class UnsupportedBackgroundSync implements BeacioBackgroundSync {
  private readonly errorFactory: () => BeacioError;

  constructor(errorFactory: () => BeacioError) {
    this.errorFactory = errorFactory;
  }

  private unsupported(): never {
    throw this.errorFactory();
  }

  requestPermission(): Promise<'granted' | 'denied' | 'prompt'> {
    this.unsupported();
  }

  requestBackgroundConnection(_options: BackgroundConnectionOptions): Promise<BackgroundRegistration> {
    this.unsupported();
  }

  registerCharacteristicNotifications(_options: CharacteristicNotificationOptions): Promise<BackgroundRegistration> {
    this.unsupported();
  }

  registerBeaconScanning(_options: BeaconScanningOptions): Promise<BackgroundRegistration> {
    this.unsupported();
  }

  getRegistrations(): Promise<BackgroundRegistration[]> {
    this.unsupported();
  }

  unregister(_registrationId: string): Promise<void> {
    this.unsupported();
  }

  update(_registrationId: string, _template: Partial<NotificationTemplate>): Promise<void> {
    this.unsupported();
  }

  connect(options: BackgroundConnectionOptions): Promise<BackgroundRegistration> {
    return this.requestBackgroundConnection(options);
  }

  subscribe(options: CharacteristicNotificationOptions): Promise<BackgroundRegistration> {
    return this.registerCharacteristicNotifications(options);
  }

  scan(options: BeaconScanningOptions): Promise<BackgroundRegistration> {
    return this.registerBeaconScanning(options);
  }

  list(): Promise<BackgroundRegistration[]> {
    return this.getRegistrations();
  }

  destroy(): void {}
}

class UnsupportedPeripheral extends EventTarget implements BeacioPeripheral {
  private readonly errorFactory: () => BeacioError;

  onwriterequest: ((this: BeacioPeripheral, ev: Event) => unknown) | null = null;
  onsubscriptionchange: ((this: BeacioPeripheral, ev: Event) => unknown) | null = null;
  onconnectionstatechange: ((this: BeacioPeripheral, ev: Event) => unknown) | null = null;
  onadvertisingstatechange: ((this: BeacioPeripheral, ev: Event) => unknown) | null = null;
  onnotificationready: ((this: BeacioPeripheral, ev: Event) => unknown) | null = null;

  constructor(errorFactory: () => BeacioError) {
    super();
    this.errorFactory = errorFactory;
  }

  get advertising(): boolean {
    return false;
  }

  private unsupported(): never {
    throw this.errorFactory();
  }

  advertise(_options?: BeacioPeripheralAdvertisingOptions): Promise<void> {
    this.unsupported();
  }

  addService(_service: BeacioPeripheralServiceDefinition): Promise<BeacioPeripheralServiceRecord> {
    this.unsupported();
  }

  registerService(service: BeacioPeripheralServiceDefinition): Promise<BeacioPeripheralServiceRecord> {
    return this.addService(service);
  }

  startAdvertising(options?: BeacioPeripheralAdvertisingOptions): Promise<void> {
    return this.advertise(options);
  }

  stopAdvertising(): Promise<void> {
    this.unsupported();
  }

  send(_options: BeacioPeripheralSendOptions): Promise<BeacioPeripheralSendResult> {
    this.unsupported();
  }

  sendNotification(options: BeacioPeripheralSendOptions): Promise<BeacioPeripheralSendResult> {
    return this.send(options);
  }

  destroy(): void {}
}

/**
 * Core Beacio SDK entry point. Handles platform detection and device discovery.
 *
 * @example
 * ```typescript
 * import { Beacio } from '@beacio/core'
 *
 * const ble = new Beacio()
 * const device = await ble.requestDevice({
 *   filters: [{ services: ['heart_rate'] }]
 * })
 * await device.connect()
 * ```
 */
export class Beacio {
  readonly platform: Platform;
  readonly isSupported: boolean;
  readonly maxConnections: number | null;

  private bluetooth: Bluetooth | null;
  private readonly runtimeBluetooth: RuntimeBluetooth | null;
  private readonly unsupportedFeatureErrorFactory: () => BeacioError;
  private readonly unsupportedBackgroundSync: BeacioBackgroundSync;
  private readonly unsupportedPeripheral: BeacioPeripheral;
  private readonly devices = new Map<string, BeacioDevice>();
  /**
   * Instance-wide optionalServices registry. Holds canonical 128-bit UUIDs
   * (already {@link resolveUUID}-normalized); a Set both de-dups and preserves
   * registration order. {@link requestDevice} unions this into the effective
   * `optionalServices` of every call. Seeded from {@link BeacioOptions.defaultOptionalServices}.
   */
  private readonly registeredOptionalServices = new Set<string>();

  constructor(options?: BeacioOptions) {
    this.platform = options?.platform ?? detectPlatform();
    this.maxConnections = this.normalizeMaxConnections(options?.maxConnections);
    if (options?.defaultOptionalServices) {
      this.registerServices(options.defaultOptionalServices);
    }
    this.bluetooth = this.platform !== 'unsupported' ? getBluetoothAPI() : null;
    this.runtimeBluetooth = this.bluetooth as RuntimeBluetooth | null;
    this.isSupported = this.bluetooth !== null;
    this.unsupportedFeatureErrorFactory = () => {
      if (this.platform === 'unsupported') {
        return new BeacioError('BLUETOOTH_UNAVAILABLE');
      }
      return new BeacioError(
        'GATT_OPERATION_FAILED',
        'This Beacio feature requires the iOS Safari Beacio extension runtime.',
      );
    };
    this.unsupportedBackgroundSync = new UnsupportedBackgroundSync(this.unsupportedFeatureErrorFactory);
    this.unsupportedPeripheral = new UnsupportedPeripheral(this.unsupportedFeatureErrorFactory);
  }

  /**
   * Access the background sync API for maintaining BLE connections and delivering
   * iOS notifications when Safari is not in the foreground.
   *
   * Requires the companion app running in IPC relay mode. Returns a stub that
   * throws `BLUETOOTH_UNAVAILABLE` when Bluetooth is unavailable, or
   * `GATT_OPERATION_FAILED` when the extension runtime is missing.
   *
   * @see {@link BeacioBackgroundSync}
   */
  get backgroundSync(): BeacioBackgroundSync {
    return this.runtimeBluetooth?.backgroundSync ?? this.unsupportedBackgroundSync;
  }

  /**
   * Access the peripheral-mode API for acting as a BLE GATT server.
   *
   * Allows registering services, advertising, and sending notifications to
   * connected centrals. Returns a stub that throws `GATT_OPERATION_FAILED`
   * on unsupported platforms.
   *
   * @see {@link BeacioPeripheral}
   */
  get peripheral(): BeacioPeripheral {
    return this.runtimeBluetooth?.peripheral ?? this.unsupportedPeripheral;
  }

  /**
   * Prompt the user to select a BLE device. Open the browser's device picker
   * filtered by the given options.
   *
   * **Filter semantics:**
   * - `filters` array entries are OR-combined -- a device matches if ANY filter matches
   * - Within a single filter, all specified fields are AND-combined -- device must match ALL
   * - `exclusionFilters` are applied after `filters` to remove unwanted matches
   * - `acceptAllDevices: true` cannot be combined with `filters`
   *
   * **Service access:** Only services declared in `filters[].services` or `optionalServices`
   * can be accessed after connection. `optionalServices` does NOT affect the picker -- it
   * only declares post-connection GATT access intent.
   *
   * Service names (e.g. `'heart_rate'`) are resolved to full 128-bit UUIDs via {@link resolveUUID}.
   *
   * @param options - Device filter and service access options. Defaults to `{ acceptAllDevices: true }`.
   * @returns A {@link BeacioDevice} wrapping the user-selected device.
   *
   * @throws {BeacioError} `BLUETOOTH_UNAVAILABLE` -- browser or platform does not support Web Bluetooth
   * @throws {BeacioError} `USER_CANCELLED` -- user dismissed the device picker without selecting
   * @throws {BeacioError} `DEVICE_NOT_FOUND` -- no devices matched the given filters
   * @throws {BeacioError} `PERMISSION_DENIED` -- request was not triggered by a user gesture
   *
   * @example
   * ```typescript
   * // OR filter: match devices with heart_rate OR battery_service
   * const device = await ble.requestDevice({
   *   filters: [
   *     { services: ['heart_rate'] },
   *     { services: ['battery_service'] },
   *   ],
   * })
   *
   * // AND within filter: must have heart_rate AND name starting with "Polar"
   * const device = await ble.requestDevice({
   *   filters: [{ services: ['heart_rate'], namePrefix: 'Polar' }],
   *   optionalServices: ['battery_service'],
   * })
   *
   * // Accept all devices (no filtering)
   * const device = await ble.requestDevice({ acceptAllDevices: true })
   * ```
   *
   * @see {@link RequestDeviceOptions}
   * @see {@link resolveUUID}
   */
  async requestDevice(options?: RequestDeviceOptions): Promise<BeacioDevice> {
    if (!this.bluetooth) throw new BeacioError('BLUETOOTH_UNAVAILABLE');

    try {
      const device = await this.bluetooth.requestDevice(
        (this.normalizeRequestDeviceOptions(options) as any) ?? { acceptAllDevices: true },
      );
      return this.wrapDevice(device);
    } catch (e) {
      throw BeacioError.from(e, 'DEVICE_NOT_FOUND');
    }
  }

  /**
   * Register service UUIDs once for this instance so they are merged into the
   * effective `optionalServices` of every subsequent {@link requestDevice} call —
   * eliminating the per-call `optionalServices` boilerplate when a site or agent
   * always needs the same allowlist (e.g. a vendor's full multi-family service
   * bundle). Pairs with {@link BeacioOptions.defaultOptionalServices}.
   *
   * Accumulating and idempotent: each UUID is resolved via {@link resolveUUID}
   * (names, 4/8-hex, or full 128-bit all accepted) to its canonical lowercase
   * 128-bit form and stored in a de-duped, insertion-ordered set, so registering
   * the same service twice — by alias or canonical form — is a no-op.
   *
   * **Picker-safe:** this declares post-connection GATT access intent ONLY. It
   * never widens the device picker — it does not add to `filters`, does not
   * synthesize `acceptAllDevices`, and the registered set is unioned into
   * `optionalServices` (caller entries first), never a replacement.
   *
   * @param uuids - Service names, 4/8-hex, or full 128-bit UUID strings to register.
   * @throws {TypeError} If a value is not a resolvable UUID or known SIG name (via {@link resolveUUID}).
   *
   * @example
   * ```typescript
   * import { Beacio } from '@beacio/core'
   * import { StorzBickel } from '@beacio/profiles'
   *
   * const ble = new Beacio()
   * ble.registerServices(StorzBickel.allServices()) // declare every S&B family once
   * // ...every requestDevice() now carries the bundle as optionalServices.
   * ```
   *
   * @see {@link requestDevice}
   * @see {@link BeacioOptions.defaultOptionalServices}
   */
  registerServices(uuids: string[]): void {
    for (const uuid of uuids) {
      this.registeredOptionalServices.add(resolveUUID(uuid));
    }
  }

  /**
   * Return previously granted devices without prompting the user.
   * Only available on platforms that implement `Bluetooth.getDevices()` (e.g. Chrome).
   * Returns an empty array when unsupported.
   *
   * @returns Array of previously paired {@link BeacioDevice} instances, or empty if unsupported.
   * @throws {BeacioError} `BLUETOOTH_UNAVAILABLE` -- no Bluetooth API available
   */
  async getDevices(): Promise<BeacioDevice[]> {
    if (!this.bluetooth) throw new BeacioError('BLUETOOTH_UNAVAILABLE');

    const bluetoothWithGetDevices = this.bluetooth as Bluetooth & {
      getDevices?: () => Promise<BluetoothDevice[]>;
    };

    if (typeof bluetoothWithGetDevices.getDevices !== 'function') {
      return [];
    }

    try {
      const devices = await bluetoothWithGetDevices.getDevices();
      return devices.map((device) => this.wrapDevice(device));
    } catch (error) {
      throw BeacioError.from(error);
    }
  }

  /**
   * Check if Bluetooth is available on this device/browser.
   * Returns `false` gracefully when the API is missing or throws.
   *
   * @returns `true` if Bluetooth is available and can be used for device discovery.
   */
  async getAvailability(): Promise<boolean> {
    if (!this.bluetooth) return false;
    try {
      return await this.bluetooth.getAvailability();
    } catch {
      return false;
    }
  }

  /**
   * Start a BLE advertisement scan. Returns `null` when the platform does not support
   * `Bluetooth.requestLEScan()`.
   *
   * @param options - Scan filter options. Defaults to accepting all advertisements.
   * @returns A `BluetoothLEScan` handle to stop the scan, or `null` if unsupported.
   * @throws {BeacioError} `BLUETOOTH_UNAVAILABLE` -- no Bluetooth API available
   */
  async requestLEScan(options: BluetoothLEScanOptions = { acceptAllAdvertisements: true }): Promise<BluetoothLEScan | null> {
    if (!this.bluetooth) {
      throw new BeacioError('BLUETOOTH_UNAVAILABLE');
    }

    const bluetoothWithScan = this.bluetooth as Bluetooth & {
      requestLEScan?: (options?: BluetoothLEScanOptions) => Promise<BluetoothLEScan>;
    };

    if (typeof bluetoothWithScan.requestLEScan !== 'function') {
      return null;
    }

    try {
      return await bluetoothWithScan.requestLEScan(options);
    } catch (error) {
      throw BeacioError.from(error);
    }
  }

  private normalizeRequestDeviceOptions(options?: RequestDeviceOptions): RequestDeviceOptions | undefined {
    // The instance registry can contribute optionalServices even when the caller
    // passes no options at all, so compute the effective list first and bail to
    // `undefined` (→ the default acceptAllDevices) only when there is genuinely
    // nothing to forward.
    const effectiveOptionalServices = this.mergeOptionalServices(options?.optionalServices);

    if (!options) {
      return effectiveOptionalServices ? { optionalServices: effectiveOptionalServices } : undefined;
    }

    const normalizeServices = (services?: string[]): string[] | undefined => {
      if (!services) return undefined;
      return services.map((service) => resolveUUID(service));
    };

    const normalized: RequestDeviceOptions = {};

    if (options.acceptAllDevices !== undefined) {
      normalized.acceptAllDevices = options.acceptAllDevices;
    }

    if (options.optionalManufacturerData !== undefined) {
      normalized.optionalManufacturerData = options.optionalManufacturerData;
    }

    if (options.filters) {
      normalized.filters = options.filters.map((filter) => ({
        ...filter,
        services: normalizeServices(filter.services),
      }));
    }

    if (options.exclusionFilters) {
      normalized.exclusionFilters = options.exclusionFilters.map((filter) => ({
        ...filter,
        services: normalizeServices(filter.services),
      }));
    }

    // Effective optionalServices = caller's list UNIONed with the instance
    // registry, never a replacement. Omitted entirely (not `[]`) when both are
    // empty so an empty registry stays a true no-op at the native boundary.
    if (effectiveOptionalServices) {
      normalized.optionalServices = effectiveOptionalServices;
    }

    return normalized;
  }

  /**
   * Compute the effective `optionalServices` for a request: the de-duped UNION
   * of the caller-supplied list (resolved + first, preserving caller order) and
   * the instance registry (already canonical). Returns `undefined` when both are
   * empty, so the caller can omit the key and keep an empty registry a no-op.
   * This NEVER touches filters or the picker — it only assembles the access list.
   */
  private mergeOptionalServices(callerServices?: string[]): string[] | undefined {
    if (!callerServices && this.registeredOptionalServices.size === 0) {
      return undefined;
    }
    const merged = new Set<string>();
    for (const service of callerServices ?? []) {
      merged.add(resolveUUID(service));
    }
    for (const service of this.registeredOptionalServices) {
      merged.add(service);
    }
    return [...merged];
  }

  private normalizeMaxConnections(maxConnections: number | undefined): number | null {
    if (maxConnections === undefined) return null;
    if (!Number.isInteger(maxConnections) || maxConnections <= 0) {
      throw new BeacioError(
        'INVALID_PARAMETER',
        `Invalid maxConnections: ${maxConnections}. Must be a positive integer.`,
      );
    }
    return maxConnections;
  }

  private wrapDevice(device: BluetoothDevice): BeacioDevice {
    const existing = this.devices.get(device.id);
    if (existing) {
      return existing;
    }

    const wrapped = new BeacioDevice(device, {
      beforeConnect: (nextDevice: BeacioDevice) => { this.assertConnectionCapacity(nextDevice); },
      onConnectionChange: (nextDevice: BeacioDevice) => { this.devices.set(nextDevice.id, nextDevice); },
    });
    this.devices.set(device.id, wrapped);
    return wrapped;
  }

  private assertConnectionCapacity(nextDevice: BeacioDevice): void {
    if (this.maxConnections === null) return;

    this.devices.set(nextDevice.id, nextDevice);
    if (nextDevice.connected) return;

    const connectedCount = [...this.devices.values()].filter((device) => device.connected).length;
    if (connectedCount >= this.maxConnections) {
      throw new BeacioError(
        'CONNECTION_LIMIT_REACHED',
        `Connection limit reached (${connectedCount}/${this.maxConnections}). Disconnect another device or increase maxConnections before connecting ${nextDevice.name ?? nextDevice.id}.`,
        { retryAfterMs: 1000 },
      );
    }
  }
}

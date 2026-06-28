/**
 * Runtime platform where Beacio is executing.
 *
 * - `'safari-extension'` -- iOS Safari with the Beacio extension installed
 * - `'native'` -- Browser with built-in Web Bluetooth (Chrome, Edge, etc.)
 * - `'unsupported'` -- No Web Bluetooth capability detected
 */
export type Platform = 'safari-extension' | 'native' | 'unsupported';

/** Configuration options for the {@link Beacio} constructor. */
export interface BeacioOptions {
  /** Force a specific platform instead of auto-detecting via {@link detectPlatform}. */
  platform?: Platform;
  /** Maximum concurrently connected SDK-managed devices for this Beacio instance. Throws `CONNECTION_LIMIT_REACHED` when exceeded. */
  maxConnections?: number;
  /**
   * Service UUIDs to seed the instance-wide optionalServices registry once, so
   * they are merged into every {@link Beacio.requestDevice} call's effective
   * `optionalServices` without per-call boilerplate. Accepts names (`'battery_service'`),
   * 4/8-hex, or full 128-bit UUIDs — each is resolved via {@link resolveUUID} and
   * de-duped. Equivalent to calling {@link Beacio.registerServices} in the constructor.
   * This NEVER widens the device picker (it does not touch `filters` or synthesize
   * `acceptAllDevices`) — it only declares post-connection GATT access intent.
   */
  defaultOptionalServices?: string[];
}

/**
 * Declarative native periodic-write keep-warm request (SB-NAT-04).
 *
 * Poll-driven devices (e.g. S&B Venty/Veazy) emit no unsolicited notifications —
 * their telemetry only advances because the page writes a status-request frame
 * every ~500 ms. A backgrounded Safari tab issues no writes, so the session goes
 * stale. Declaring this lets the native iOS side re-issue the frame on a
 * **best-effort, battery-safe CLAMPED cadence** while it holds the connection in
 * the background, then route the reply through the same condition pipeline as a
 * pushed notification. The page only DECLARES intent — the cadence floor and
 * frame interpretation live in the native layer (a BLE invariant).
 */
export interface PeriodicWriteOptions {
  /** GATT service UUID owning the writable control characteristic. Accepts names, 4/8-hex, or full 128-bit UUIDs. */
  serviceUUID: BluetoothServiceUUID;
  /** Writable characteristic the keep-warm frame is written to. Accepts names, 4/8-hex, or full 128-bit UUIDs. */
  characteristicUUID: BluetoothCharacteristicUUID;
  /** Exact bytes to write each tick (e.g. the device's status-request command). An empty array is a no-op. */
  payload: number[];
  /**
   * Requested interval in milliseconds. NOTE: the native side clamps any
   * sub-floor value UP to a battery-safe minimum and only polls within the
   * granted iOS background window, so the page's foreground cadence (e.g. 500 ms)
   * is **never guaranteed** in the background — this is a best-effort poll, not a
   * real-time loop.
   */
  intervalMs: number;
}

/** Options for registering a background keep-alive connection. */
export interface BackgroundConnectionOptions {
  /** Unique identifier of the device to maintain a background connection to (from `BeacioDevice.id`). */
  deviceId: string;
  /**
   * Optional native periodic-write keep-warm poll (SB-NAT-04). Omit to hold the
   * connection passively (the native side relays only values the device pushes).
   * Supply it for poll-driven devices so telemetry keeps advancing while Safari
   * is backgrounded, on a clamped best-effort cadence (see {@link PeriodicWriteOptions}).
   */
  periodicWrite?: PeriodicWriteOptions;
}

/**
 * Notification permission state, mirroring the Notification API.
 *
 * - `'granted'` -- User has allowed notifications
 * - `'denied'` -- User has blocked notifications
 * - `'prompt'` -- User has not yet been asked
 */
export type NotificationPermissionState = 'granted' | 'denied' | 'prompt';

/**
 * Template for iOS notifications delivered by background sync.
 * Supports placeholder interpolation: `{{value.utf8}}`, `{{value.hex}}`, `{{deviceName}}`, `{{timestamp}}`.
 */
export interface NotificationTemplate {
  /** Notification title. Supports `{{placeholder}}` interpolation. */
  title: string;
  /** Notification body text. Supports `{{placeholder}}` interpolation. */
  body: string;
  /** Deep-link URL opened when the user taps the notification. */
  url?: string;
  /** Play the default notification sound. Defaults to true when omitted. */
  sound?: boolean;
}

/** Configuration for an interactive reply action on a notification. */
export interface ReplyActionConfig {
  /** Button label shown in the notification (e.g. "Reply", "Send Command"). */
  actionTitle: string;
  /** Placeholder text in the reply text field. */
  placeholder?: string;
}

/**
 * Decoder format applied to raw characteristic bytes before evaluating a {@link NotificationCondition}.
 * Determines how the raw `DataView` bytes are interpreted as a numeric value.
 */
export type ConditionDecoder = 'uint8' | 'int16be' | 'int16le' | 'int32be' | 'float32le' | 'float32be';

/**
 * Comparison operator for evaluating whether a characteristic value should trigger a notification.
 *
 * - `'changed'` -- Fire when the decoded value differs from the previous reading
 * - `'always'` -- Fire on every characteristic update regardless of value
 * - Numeric operators compare the decoded value against {@link NotificationCondition.threshold}
 */
export type ConditionOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq' | 'changed' | 'always';

/** Condition that must be met for a background characteristic notification to fire. */
export type NotificationCondition = {
  /** How to decode the raw characteristic bytes into a number. */
  decode: ConditionDecoder;
  /**
   * Byte offset into the characteristic value where the scalar is decoded.
   * Defaults to `0`. Lets a condition read past the start of a vendor frame —
   * e.g. the S&B Venty/Veazy CMD `0x01` reply puts the settings bitmask at
   * byte 14 and the auto-shutoff countdown at byte 9.
   */
  byteOffset?: number;
  /**
   * Optional bitwise-AND mask applied to the decoded **integer** before the
   * comparison, to isolate a single status bit in a packed flags byte. For
   * example, `{ decode: 'uint8', byteOffset: 14, mask: 0x02, operator: 'eq',
   * threshold: 2 }` fires on Venty/Veazy "setpoint reached" (byte 14, bit 1).
   * Ignored for the `float32*` decoders.
   */
  mask?: number;
  /**
   * Optional multiplier applied to the decoded value before the comparison, so
   * a raw integer can be compared in engineering units (e.g. a uint16 that is
   * `÷10 = °C` uses `scale: 0.1`, letting `threshold` be a real temperature).
   */
  scale?: number;
} & (
  {
    /** Comparison operator for edge-triggered notifications that do not compare against a fixed threshold. */
    operator: 'changed' | 'always';
  } | {
    /** Comparison operator to evaluate against `threshold`. */
    operator: Exclude<ConditionOperator, 'changed' | 'always'>;
    /** Reference value for numeric comparison operators. */
    threshold: number;
  }
);

/**
 * Options for registering background characteristic notifications.
 * When the condition is met, an iOS notification is delivered using the template.
 */
export interface CharacteristicNotificationOptions {
  /** Device identifier (from `BeacioDevice.id`). */
  deviceId: string;
  /** GATT service UUID containing the characteristic. Accepts names, 4/8-hex, or full 128-bit UUIDs. */
  serviceUUID: BluetoothServiceUUID;
  /** GATT characteristic UUID to monitor. Accepts names, 4/8-hex, or full 128-bit UUIDs. */
  characteristicUUID: BluetoothCharacteristicUUID;
  /** Notification content template with placeholder support. */
  template: NotificationTemplate;
  /** Condition that must be satisfied for the notification to fire. */
  condition: NotificationCondition;
  /** Optional interactive reply action attached to the notification. */
  replyAction?: ReplyActionConfig;
  /** Minimum seconds between consecutive notifications for this registration. Prevents notification spam. */
  cooldownSeconds?: number;
}

/** Filter criteria for beacon scanning. Multiple filters are OR-combined. */
export interface BeaconScanFilter {
  /** Service UUIDs to match in advertisement data. */
  services?: BluetoothServiceUUID[];
  /** Match devices whose name starts with this prefix (case-sensitive). */
  namePrefix?: string;
}

/** Options for registering a background beacon scan that delivers iOS notifications on discovery. */
export interface BeaconScanningOptions {
  /** One or more filters to match against BLE advertisements. Filters are OR-combined. */
  filters: BeaconScanFilter[];
  /** Minimum seconds between consecutive beacon notifications. Prevents notification spam. */
  cooldownSeconds?: number;
  /** Notification content template delivered when a matching beacon is found. */
  template: NotificationTemplate;
}

/**
 * Discriminator for background sync registration types.
 *
 * - `'connection'` -- Keep-alive device connection
 * - `'characteristic-notification'` -- Characteristic value monitoring with iOS notifications
 * - `'beacon-scan'` -- BLE advertisement scanning with iOS notifications
 */
export type BackgroundRegistrationType =
  | 'connection'
  | 'characteristic-notification'
  | 'beacon-scan';

/** Handle for an active background sync registration. Use to update or cancel the registration. */
export interface BackgroundRegistration {
  /** Unique identifier for this registration. */
  readonly id: string;
  /** The kind of background operation this registration represents. */
  readonly type: BackgroundRegistrationType;
  /** Unix timestamp (ms) when the registration was created. */
  readonly createdAt: number;
  /** Unix timestamp (ms) of the last time this registration triggered a notification. */
  readonly lastTriggeredAt?: number;
  /** Cancel this registration and stop the background operation. */
  unregister(): Promise<void>;
  /** Update the notification template for this registration. */
  update(template: Partial<NotificationTemplate>): Promise<void>;
}

/**
 * Background sync API for maintaining BLE connections and delivering iOS notifications
 * when Safari is not in the foreground.
 *
 * Access via `ble.backgroundSync`. Requires the companion app to be running in IPC relay mode.
 * Falls back to a stub that throws `BLUETOOTH_UNAVAILABLE` when Bluetooth is unavailable
 * or `GATT_OPERATION_FAILED` when the extension runtime is missing.
 */
export interface BeacioBackgroundSync {
  /** Request iOS notification permission. Must be granted before registering notification-based syncs. */
  requestPermission(): Promise<NotificationPermissionState>;
  /** Register a keep-alive background connection to a device. */
  requestBackgroundConnection(options: BackgroundConnectionOptions): Promise<BackgroundRegistration>;
  /** Register characteristic monitoring with iOS notification delivery. */
  registerCharacteristicNotifications(options: CharacteristicNotificationOptions): Promise<BackgroundRegistration>;
  /** Register beacon scanning with iOS notification delivery on discovery. */
  registerBeaconScanning(options: BeaconScanningOptions): Promise<BackgroundRegistration>;
  /** List all active background sync registrations for the current origin. */
  getRegistrations(): Promise<BackgroundRegistration[]>;
  /** Cancel a registration by ID. */
  unregister(registrationId: string): Promise<void>;
  /** Update the notification template of an existing registration. */
  update(registrationId: string, template: Partial<NotificationTemplate>): Promise<void>;
  /** Release all resources held by the background sync manager. */
  destroy(): void;
  /** Alias for {@link requestBackgroundConnection}. */
  connect(options: BackgroundConnectionOptions): Promise<BackgroundRegistration>;
  /** Alias for {@link registerCharacteristicNotifications}. */
  subscribe(options: CharacteristicNotificationOptions): Promise<BackgroundRegistration>;
  /** Alias for {@link registerBeaconScanning}. */
  scan(options: BeaconScanningOptions): Promise<BackgroundRegistration>;
  /** Alias for {@link getRegistrations}. */
  list(): Promise<BackgroundRegistration[]>;
}

/** Options for starting BLE peripheral advertising. */
export interface BeacioPeripheralAdvertisingOptions {
  /** Local name included in advertisement data. */
  localName?: string;
  /** Services to register before advertising begins. */
  services?: BeacioPeripheralServiceDefinition[];
  /** Service UUIDs to include in advertisement packets. */
  serviceUUIDs?: BluetoothServiceUUID[];
  /** Manufacturer-specific data included in advertisements. */
  manufacturerData?: Array<{
    /** Bluetooth SIG company identifier (e.g. 0x004C for Apple). */
    companyIdentifier: number;
    /** Raw manufacturer data payload. */
    data: BufferSource;
  }>;
  /** Service-specific data included in advertisements. */
  serviceData?: Array<{
    /** Service UUID this data is associated with. */
    service: BluetoothServiceUUID;
    /** Raw service data payload. */
    data: BufferSource;
  }>;
  /** Whether the peripheral accepts incoming connections. Defaults to true. */
  connectable?: boolean;
  /** Transmit power level in dBm included in advertisements. */
  txPower?: number;
}

/** Incoming write request from a connected central device. */
export interface BeacioPeripheralWriteRequest {
  /** Platform device identifier of the central. */
  deviceId?: string;
  /** CoreBluetooth central UUID. */
  centralUUID?: string;
  /** Target service UUID. */
  serviceUuid?: string;
  /** Target characteristic UUID. */
  characteristicUuid?: string;
  /** Written value (type depends on platform encoding). */
  value?: unknown;
  /** Byte offset for prepared writes. */
  offset?: number;
  /** True if the central used write-without-response. */
  withoutResponse?: boolean;
}

/** Connection state change event from a central device. */
export interface BeacioPeripheralConnectionStateChange {
  /** Platform device identifier of the central. */
  deviceId?: string;
  /** CoreBluetooth central UUID. */
  centralUUID?: string;
  /** Whether the central is now connected. */
  connected?: boolean;
  /** Total number of currently subscribed centrals across all characteristics. */
  subscriberCount?: number;
}

/** Subscription (notify/indicate) state change from a central device. */
export interface BeacioPeripheralSubscriptionChange {
  /** Platform device identifier of the central. */
  deviceId?: string;
  /** CoreBluetooth central UUID. */
  centralUUID?: string;
  /** Service UUID of the subscribed characteristic. */
  serviceUuid?: string;
  /** Characteristic UUID the central subscribed to or unsubscribed from. */
  characteristicUuid?: string;
  /** Whether the central is now subscribed (true) or unsubscribed (false). */
  subscribed?: boolean;
  /** Total subscriber count for this characteristic after the change. */
  subscriberCount?: number;
}

/** Options for sending a notification/indication to subscribed centrals. */
export interface BeacioPeripheralSendOptions {
  /** Service UUID containing the characteristic. */
  serviceUuid: string;
  /** Characteristic UUID to send the value update on. */
  characteristicUuid: string;
  /** Raw value to send as a notification/indication. */
  value: BufferSource;
}

/**
 * GATT characteristic property for peripheral-mode services.
 * Determines which operations centrals can perform on the characteristic.
 */
export type BeacioPeripheralCharacteristicProperty =
  | 'read'
  | 'write'
  | 'writeWithoutResponse'
  | 'notify'
  | 'indicate';

/** Definition of a characteristic within a peripheral-mode GATT service. */
export interface BeacioPeripheralCharacteristicDefinition {
  /** Characteristic UUID. Mutually exclusive with `uuid` (provide one). */
  characteristicUuid?: BluetoothCharacteristicUUID;
  /** Characteristic UUID (alias). Mutually exclusive with `characteristicUuid`. */
  uuid?: BluetoothCharacteristicUUID;
  /** Supported operations. Array form or object form (`{ read: true, notify: true }`). */
  properties?: BeacioPeripheralCharacteristicProperty[] | Partial<Record<BeacioPeripheralCharacteristicProperty, boolean>>;
  /** ATT permission set. Accepts synonyms: `'writeable'`/`'writable'` are equivalent to `'write'`. */
  permissions?: Array<'read' | 'readable' | 'write' | 'writeable' | 'writable'>;
  /** Initial static value for read requests before any writes occur. */
  value?: BufferSource;
}

/** Definition of a GATT service to register in peripheral mode. */
export interface BeacioPeripheralServiceDefinition {
  /** Service UUID. Mutually exclusive with `uuid` (provide one). */
  serviceUuid?: BluetoothServiceUUID;
  /** Service UUID (alias). Mutually exclusive with `serviceUuid`. */
  uuid?: BluetoothServiceUUID;
  /** Whether this is a primary service. Defaults to true. */
  isPrimary?: boolean;
  /** Characteristics to include in this service. */
  characteristics?: BeacioPeripheralCharacteristicDefinition[];
}

/** Snapshot of a registered peripheral characteristic at a point in time. */
export interface BeacioPeripheralCharacteristicRecord {
  /** Canonical service UUID this characteristic belongs to. */
  serviceUuid: string;
  /** Canonical characteristic UUID. */
  characteristicUuid: string;
  /** List of property names this characteristic supports. */
  properties: string[];
  /** Current characteristic value as raw bytes. */
  value: Uint8Array;
  /** Number of centrals currently subscribed to this characteristic. */
  subscriberCount: number;
  /** Number of notification updates queued but not yet delivered. */
  pendingNotifications: number;
}

/** Snapshot of a registered peripheral service at a point in time. */
export interface BeacioPeripheralServiceRecord {
  /** Canonical service UUID. */
  serviceUuid: string;
  /** Whether this is a primary service. */
  isPrimary: boolean;
  /** Characteristics registered within this service. */
  characteristics: BeacioPeripheralCharacteristicRecord[];
}

/** Result of sending a notification/indication to subscribed centrals. */
export interface BeacioPeripheralSendResult {
  /** Whether the update was accepted by the platform (passed initial validation). */
  accepted: boolean;
  /** Whether the value was immediately transmitted to at least one central. */
  sent: boolean;
  /** Whether the update was queued for later delivery (e.g. central's transmit window full). */
  queued: boolean;
  /** Number of pending (queued but undelivered) updates for this characteristic. */
  pendingCount: number;
  /** Number of centrals currently subscribed to this characteristic. */
  subscriberCount: number;
  /** Service UUID of the updated characteristic. */
  serviceUuid: string;
  /** Characteristic UUID that was updated. */
  characteristicUuid: string;
}

/** Event type map for the peripheral `addEventListener` interface. */
export interface BeacioPeripheralEventMap {
  /** Fired when a connected central writes to a characteristic. */
  writerequest: CustomEvent<BeacioPeripheralWriteRequest>;
  /** Fired when a central subscribes to or unsubscribes from notifications. */
  subscriptionchange: CustomEvent<BeacioPeripheralSubscriptionChange>;
  /** Fired when a central connects or disconnects. */
  connectionstatechange: CustomEvent<BeacioPeripheralConnectionStateChange>;
  /** Fired when advertising state changes (started/stopped). */
  advertisingstatechange: CustomEvent<{ advertising?: boolean; localName?: string | null; serviceUUIDs?: string[] }>;
  /** Fired when a queued notification has been delivered and the characteristic is ready for more. */
  notificationready: CustomEvent<BeacioPeripheralNotificationReady>;
}

/** Detail payload for the `notificationready` event. */
export interface BeacioPeripheralNotificationReady {
  /** Service UUID of the characteristic that became ready. */
  serviceUuid?: string;
  /** Characteristic UUID that is ready to accept more notifications. */
  characteristicUuid?: string;
  /** Number of remaining queued updates after this delivery. */
  pendingCount?: number;
}

/**
 * Peripheral-mode API for acting as a BLE GATT server.
 * Access via `ble.peripheral`. Supports service registration, advertising, and notification delivery.
 * Falls back to a stub that throws `GATT_OPERATION_FAILED` on unsupported platforms.
 */
export interface BeacioPeripheral {
  /** Whether the peripheral is currently advertising. */
  readonly advertising: boolean;
  /** Start advertising with the given options. Registers any included services first. */
  advertise(options?: BeacioPeripheralAdvertisingOptions): Promise<void>;
  /** Alias for {@link advertise}. */
  startAdvertising(options?: BeacioPeripheralAdvertisingOptions): Promise<void>;
  /** Register a GATT service. Must be called before advertising if not included in advertise options. */
  addService(service: BeacioPeripheralServiceDefinition): Promise<BeacioPeripheralServiceRecord>;
  /** Alias for {@link addService}. */
  registerService(service: BeacioPeripheralServiceDefinition): Promise<BeacioPeripheralServiceRecord>;
  /** Stop advertising. Does not unregister services. */
  stopAdvertising(): Promise<void>;
  /** Send a notification/indication value update to all subscribed centrals. */
  send(options: BeacioPeripheralSendOptions): Promise<BeacioPeripheralSendResult>;
  /** Alias for {@link send}. */
  sendNotification(options: BeacioPeripheralSendOptions): Promise<BeacioPeripheralSendResult>;
  /** Release all resources, stop advertising, and unregister services. */
  destroy(): void;
  /** Register an event listener. See {@link BeacioPeripheralEventMap} for event types. */
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void;
  /** Remove a previously registered event listener. */
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void;
  /** Called when a central writes to a characteristic. */
  onwriterequest: ((this: BeacioPeripheral, ev: Event) => unknown) | null;
  /** Called when a central subscribes to or unsubscribes from notifications. */
  onsubscriptionchange: ((this: BeacioPeripheral, ev: Event) => unknown) | null;
  /** Called when a central connects or disconnects. */
  onconnectionstatechange: ((this: BeacioPeripheral, ev: Event) => unknown) | null;
  /** Called when advertising state changes. */
  onadvertisingstatechange: ((this: BeacioPeripheral, ev: Event) => unknown) | null;
  /** Called when a queued notification has been delivered and the characteristic is ready for more. */
  onnotificationready: ((this: BeacioPeripheral, ev: Event) => unknown) | null;
}

/**
 * Filter criteria for BLE device discovery. Within a single filter, all specified
 * fields must match (AND logic). Multiple filters in `RequestDeviceOptions.filters`
 * are OR-combined.
 */
export interface BluetoothLEScanFilter {
  /** Service UUIDs the device must advertise. Accepts names, 4/8-hex, or full 128-bit UUIDs. */
  services?: string[];
  /** Exact device name to match (case-sensitive). */
  name?: string;
  /** Match devices whose name starts with this prefix (case-sensitive). */
  namePrefix?: string;
  /** Filter by manufacturer-specific data. */
  manufacturerData?: { companyIdentifier: number; dataPrefix?: BufferSource }[];
  /** Filter by service data. */
  serviceData?: { service: string; dataPrefix?: BufferSource }[];
}

/**
 * Options for `requestDevice()`. Define which BLE devices appear in the picker.
 *
 * **Filter semantics:**
 * - `filters` array entries are OR-combined (device matches if ANY filter matches)
 * - Within a single filter, all specified fields are AND-combined (device must match ALL)
 * - `exclusionFilters` are applied after `filters` to remove unwanted devices
 * - `acceptAllDevices: true` cannot be combined with `filters`
 *
 * **Service access:** Only services listed in `filters[].services` or `optionalServices`
 * can be accessed after connection. `optionalServices` does NOT affect the device picker --
 * it only declares post-connection GATT access intent.
 *
 * @see {@link BluetoothLEScanFilter}
 */
export interface RequestDeviceOptions {
  /** Device filters. OR-combined; within each filter, fields are AND-combined. */
  filters?: BluetoothLEScanFilter[];
  /** Filters applied after `filters` to exclude specific devices from results. */
  exclusionFilters?: BluetoothLEScanFilter[];
  /** Additional service UUIDs the app needs access to post-connection (does NOT affect picker). */
  optionalServices?: string[];
  /** Manufacturer data IDs to request access to post-connection. */
  optionalManufacturerData?: number[];
  /** Accept any device without filtering. Cannot be combined with `filters`. */
  acceptAllDevices?: boolean;
}

/** Emitted when the notification queue exceeds `maxQueueSize`. */
export interface QueueOverflowEvent {
  /** Service UUID of the overflowing characteristic. */
  service: string;
  /** Characteristic UUID of the overflowing notification stream. */
  characteristic: string;
  /** The overflow strategy in effect when the overflow occurred. */
  strategy: NotificationOverflowStrategy;
  /** Maximum queue size that was exceeded. */
  queueSize: number;
  /** Cumulative count of dropped notifications since the subscription started. */
  droppedCount: number;
}

/**
 * Eviction metadata for a NATIVE notification-queue overflow, decoded from the
 * `beacio:overflow` CustomEvent the polyfill dispatches on a
 * `BluetoothRemoteGATTCharacteristic` when Safari's bounded Swift `EventQueue`
 * evicts notifications under sustained high-frequency load.
 *
 * **Distinct from {@link QueueOverflowEvent}.** That event describes the *JS*
 * `device.notifications()` async-iterator queue overflowing (a client-side
 * backpressure mechanism the page configures). This event describes the
 * *native* bridge's own bounded queue dropping samples before they ever reach
 * JS — so the page learns it has a silent gap in its
 * `characteristicvaluechanged` stream and can re-read to resynchronise. The
 * fields differ accordingly; do not conflate the two.
 *
 * Each field is `undefined` only if the native bridge omitted it from the
 * signal (a forward-compat guard); a conforming bridge always supplies all four.
 *
 * @see {@link BeacioDevice.onCharacteristicOverflow}
 */
export interface NativeOverflowEvent {
  /** Number of notifications the native queue evicted in this overflow. */
  evictedCount?: number;
  /** Capacity of the native bounded queue that was exceeded. */
  queueCapacity?: number;
  /** Next expected notification sequence number, so the page can quantify the gap. */
  seq?: number;
  /** Epoch-millis timestamp the native bridge stamped on the overflow. */
  timestamp?: number;
}

/** Context information attached to device-level error events. */
export interface DeviceErrorContext {
  /** The operation that triggered the error (e.g. `'device.subscribe.onError'`, `'notification.recover'`). */
  operation: string;
  /** Service UUID involved in the failed operation, when applicable. */
  service?: string;
  /** Characteristic UUID involved in the failed operation, when applicable. */
  characteristic?: string;
  /** Additional diagnostic details. */
  details?: Record<string, unknown>;
}

/**
 * Reason for a device disconnection.
 *
 * - `'intentional'` -- `disconnect()` was called by the application
 * - `'unexpected'` -- Connection dropped (out of range, device powered off, etc.)
 * - `'service-change'` -- Device's GATT database changed (firmware update, etc.)
 */
export type DisconnectReason = 'intentional' | 'unexpected' | 'service-change';

/**
 * Backoff parameters for automatic reconnection after unexpected disconnects.
 *
 * **Backoff formula:** `delay = min(initialDelayMs * backoffMultiplier^(attempt-1), maxDelayMs)`
 *
 * @see {@link ConnectOptions.autoReconnect}
 */
export interface AutoReconnectOptions {
  /** Maximum reconnection attempts before giving up. Defaults to Infinity. */
  maxAttempts?: number;
  /** Initial delay in ms before first reconnection attempt. Defaults to 1000. */
  initialDelayMs?: number;
  /** Maximum delay in ms between attempts (exponential backoff cap). Defaults to 30000. */
  maxDelayMs?: number;
  /** Backoff multiplier applied after each failed attempt. Defaults to 2. */
  backoffMultiplier?: number;
}

/**
 * Configuration for the transparent foreground auto-reconnect supervisor that
 * `@beacio/core/auto` layers over the polyfilled `navigator.bluetooth` (SB-SDK-13).
 *
 * Unlike {@link AutoReconnectOptions}, this is read by the auto-install shim — NOT
 * by {@link ConnectOptions} — so raw-`navigator.bluetooth` consumers get foreground
 * reconnection + subscription recovery WITHOUT instantiating `Beacio` or rewriting
 * `requestDevice`. The supervisor is **default-on for the beacio runtime** and a
 * no-op everywhere else (native Chrome/Edge, the unsupported stub).
 *
 * Set it before the first `requestDevice()` by assigning `window.beacioAutoReconnect`:
 * ```js
 * // tune the backoff
 * window.beacioAutoReconnect = { initialDelayMs: 500, maxDelayMs: 10000 };
 * // or opt out entirely
 * window.beacioAutoReconnect = { enabled: false };
 * ```
 *
 * @see {@link AutoReconnectOptions} for the backoff-field semantics
 */
export interface RawAutoReconnectConfig extends AutoReconnectOptions {
  /**
   * Master switch for the auto-install supervisor. Defaults to `true` (on for the
   * beacio runtime). Set `false` to keep the legacy raw behavior (the app's own
   * `gattserverdisconnected` handler runs and nothing reconnects for it).
   */
  enabled?: boolean;
}

/**
 * Options for `device.connect()`.
 *
 * @see {@link AutoReconnectOptions}
 */
export interface ConnectOptions {
  /**
   * Automatically reconnect on unexpected disconnects using exponential backoff.
   * Pass `true` for defaults (1s initial, 30s max, 2x multiplier, infinite attempts)
   * or an {@link AutoReconnectOptions} object to customize.
   * Auto-reconnect is stopped by calling `disconnect()`, reaching `maxAttempts`,
   * or calling `connect()` again with new options.
   */
  autoReconnect?: boolean | AutoReconnectOptions;
}

/** Emitted when a subscription could not be recovered after reconnection (e.g. characteristic no longer exists). */
export interface SubscriptionLostEvent {
  /** Service UUID of the lost subscription. */
  service: string;
  /** Characteristic UUID of the lost subscription. */
  characteristic: string;
  /** The error that prevented recovery. */
  error: Error;
}

/** Snapshot of an active notification subscription's state. */
export interface ActiveSubscription {
  /** Service UUID this subscription is registered on. */
  service: string;
  /** Characteristic UUID this subscription is receiving notifications from. */
  characteristic: string;
  /** Number of callback functions currently receiving notifications for this characteristic. */
  callbackCount: number;
  /** Whether this subscription will be automatically restored after reconnection. */
  autoRecovering: boolean;
  /** Whether the native BLE notification is currently active on the platform. */
  nativeActive: boolean;
}

/** Options for `device.read()`. */
export interface ReadOptions {
  /** Timeout in ms for the read operation. No timeout if omitted. */
  timeoutMs?: number;
}

/**
 * Write mode for GATT characteristic writes.
 *
 * - `'with-response'` -- Write with acknowledgment (ATT Write Request). Slower but reliable.
 * - `'without-response'` -- Fire-and-forget write (ATT Write Command). Faster but no error feedback.
 */
export type WriteMode = 'with-response' | 'without-response';

/** Options for single-packet `device.write()` operations. */
export interface WriteOptions {
  /** Write mode. Defaults to `'with-response'`. */
  mode?: WriteMode;
  /** Timeout in ms for the write operation. No timeout if omitted. */
  timeoutMs?: number;
}

/**
 * Options for `device.writeLarge()` -- chunked writes without per-chunk retry.
 *
 * **Chunk size determination order:**
 * 1. Explicit `chunkSize` if provided
 * 2. Platform-reported write limits (`getWriteLimits()`)
 * 3. `MTU - 3` (ATT header overhead)
 * 4. 20-byte conservative fallback
 *
 * @see {@link WriteFragmentedOptions} for chunked writes with per-chunk retry
 */
export interface WriteLargeOptions extends WriteOptions {
  /**
   * Explicit chunk size in bytes for segmented writes.
   * When omitted, SDK uses platform write limits when available.
   */
  chunkSize?: number;
}

/** Result of a `device.writeLarge()` operation. */
export interface WriteLargeResult {
  /** Total bytes successfully written. */
  bytesWritten: number;
  /** Total bytes in the original payload. */
  totalBytes: number;
  /** Chunk size used for segmentation. */
  chunkSize: number;
  /** Number of write operations performed. */
  chunkCount: number;
}

/**
 * Options for `device.writeFragmented()` -- chunked writes with per-chunk retry.
 *
 * Extends {@link WriteLargeOptions} with retry semantics and an explicit MTU override.
 * The MTU-3 formula applies: BLE ATT header = 3 bytes, so max payload = MTU - 3.
 *
 * @see {@link WriteLargeOptions} for chunk size determination order
 * @see {@link WriteAutoOptions} for automatic fragmentation decisions
 */
export interface WriteFragmentedOptions extends WriteLargeOptions {
  /**
   * Optional MTU override. When provided, chunk size becomes `mtu - 3`
   * unless `chunkSize` is set explicitly.
   */
  mtu?: number;
  /** Retries per chunk before failing the whole write. Defaults to 0 (no retries). */
  maxRetries?: number;
  /** Delay in ms between chunk retries. Defaults to 0. */
  retryDelayMs?: number;
}

/** Result of a `device.writeFragmented()` operation. Extends {@link WriteLargeResult} with retry count. */
export interface WriteFragmentedResult extends WriteLargeResult {
  /** Total number of retries across all chunks. */
  retryCount: number;
}

/** Options for `device.writeAuto()`. Inherits all fragmentation and retry options. */
export interface WriteAutoOptions extends WriteFragmentedOptions {}

/** Result of a `device.writeAuto()` operation. Indicates whether fragmentation was used. */
export interface WriteAutoResult extends WriteFragmentedResult {
  /** Whether the payload was split into multiple chunks (true) or sent as a single write (false). */
  fragmented: boolean;
}

/**
 * Platform-reported write payload limits and negotiated ATT MTU.
 * Fields are `null` when the platform does not expose that information.
 *
 * @see {@link BeacioDevice.getWriteLimits}
 */
export interface WriteLimits {
  /** Maximum payload bytes for write-with-response, or `null` if unknown. */
  withResponse: number | null;
  /** Maximum payload bytes for write-without-response, or `null` if unknown. */
  withoutResponse: number | null;
  /** Negotiated ATT MTU in bytes, or `null` if unknown. Max payload = `mtu - 3`. */
  mtu: number | null;
}

/** Callback function invoked with each characteristic notification value. */
export type NotificationCallback = (value: DataView) => void;

/**
 * Strategy for handling notification queue overflow.
 *
 * - `'error'` -- Throw an error and stop the notification stream (fail-fast)
 * - `'drop-oldest'` -- Discard the oldest buffered value to make room (lossy FIFO)
 * - `'drop-newest'` -- Discard the incoming value (backpressure)
 */
export type NotificationOverflowStrategy = 'error' | 'drop-oldest' | 'drop-newest';

/**
 * Options for `device.notifications()` async iterator.
 *
 * @see {@link NotificationOverflowStrategy}
 */
export interface NotificationOptions {
  /**
   * Maximum buffered notification events before overflow handling applies.
   * Defaults to 256. Increase for high-throughput characteristics.
   */
  maxQueueSize?: number;
  /** Strategy for handling overflow. Defaults to `'error'`. */
  overflowStrategy?: NotificationOverflowStrategy;
  /** Callback invoked on every overflow event, regardless of strategy. */
  onOverflow?: (event: QueueOverflowEvent) => void;
}

/**
 * Options for `device.subscribe()` and `device.subscribeAsync()`.
 *
 * @see {@link BeacioDevice.subscribe}
 * @see {@link BeacioDevice.subscribeAsync}
 */
export interface SubscribeOptions {
  /** Automatically re-subscribe after reconnection. Defaults to `true`. */
  autoRecover?: boolean;
  /** Error callback for asynchronous setup failures. Only used by `subscribe()` (not `subscribeAsync()`). */
  onError?: (error: Error) => void;
}

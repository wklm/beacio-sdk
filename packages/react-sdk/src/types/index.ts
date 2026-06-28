/**
 * Type definitions for @beacio/react SDK
 *
 * Device types use BeacioDevice from @beacio/core.
 * RequestDeviceOptions is re-exported from core (not duplicated here).
 */
import type {
  BackgroundConnectionOptions as CoreBackgroundConnectionOptions,
  BackgroundRegistration as CoreBackgroundRegistration,
  BeaconScanningOptions as CoreBeaconScanningOptions,
  CharacteristicNotificationOptions as CoreCharacteristicNotificationOptions,
  NotificationPermissionState as CoreNotificationPermissionState,
  NotificationTemplate as CoreNotificationTemplate,
  RequestDeviceOptions as CoreRequestDeviceOptions,
  Beacio as BeacioCore,
  BeacioBackgroundSync,
  BeacioDevice,
  BeacioError as BeacioErrorType,
  BeacioPeripheral,
} from '@beacio/core';

// Re-export RequestDeviceOptions from core -- single source of truth
export type { RequestDeviceOptions } from '@beacio/core';
// AIDEV-NOTE: Alias used in interfaces below to avoid shadowing by the global
// RequestDeviceOptions that @types/web-bluetooth declares.
type RequestDeviceOptions = CoreRequestDeviceOptions;

// Re-export error from core -- replaces compat-error.ts
export { BeacioError } from '@beacio/core';

/**
 * SDK wrapper around a GATT service. Avoids leaking raw
 * BluetoothRemoteGATTService in public types.
 */
export interface BeacioGATTService {
  uuid: string;
  isPrimary: boolean;
}

// Configuration types — single source of truth for SDK configuration
export interface BeacioConfig {
  /** API key from beacio.com (wbl_xxxxx) -- enables install prompt on iOS Safari */
  apiKey?: string;
  /** Operator/app name shown in the install prompt (e.g. "FitTracker") */
  operatorName?: string;
  /** Preferred onboarding URL override (defaults to Beacio setup flow) */
  startOnboardingUrl?: string;
  /** App Store URL override (defaults to Beacio listing) */
  appStoreUrl?: string;
}

export type {
  BackgroundConnectionOptions,
  BackgroundRegistration,
  BackgroundRegistrationType,
  BeaconScanningOptions,
  CharacteristicNotificationOptions,
  NotificationPermissionState,
  NotificationTemplate,
  BeacioBackgroundSync,
  BeacioPeripheral,
} from '@beacio/core';

// Connection types
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

export interface ConnectionOptions {
  autoReconnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  reconnectBackoffMultiplier?: number;
  onReconnectAttempt?: (attempt: number, delayMs: number) => void;
  onReconnectSuccess?: (attempt: number) => void;
  onReconnectFailure?: (error: Error, attempt: number, willRetry: boolean) => void;
}

// Scan types
export type ScanState = 'idle' | 'scanning' | 'stopped';

export interface ScanOptions {
  timeout?: number;
  filters?: BluetoothLEScanFilter[];
  keepRepeatedDevices?: boolean;
  acceptAllAdvertisements?: boolean;
}

export type BluetoothLEScanFilter = NonNullable<RequestDeviceOptions['filters']>[number];

// Event types
export type NotificationHandler = (value: DataView) => void;

export interface BluetoothAdvertisingEvent {
  device: BluetoothDevice;
  uuids: string[];
  manufacturerData: Map<number, DataView>;
  serviceData: Map<string, DataView>;
  rssi: number;
  txPower: number;
}

// Hook return types -- all device references use BeacioDevice
export interface UseBluetoothReturn {
  isAvailable: boolean;
  isExtensionInstalled: boolean;
  extensionInstallState: 'not-installed' | 'installed-inactive' | 'active';
  isSupported: boolean;
  ble: BeacioCore;
  backgroundSync: BeacioBackgroundSync;
  peripheral: BeacioPeripheral;
  requestDevice: (options?: RequestDeviceOptions) => Promise<BeacioDevice | null>;
  getDevices: () => Promise<BeacioDevice[]>;
  error: BeacioErrorType | null;
}

export interface UseDeviceReturn {
  device: BeacioDevice | null;
  connectionState: ConnectionState;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  watchAdvertisements: () => Promise<void>;
  unwatchAdvertisements: () => Promise<void>;
  isWatchingAdvertisements: boolean;
  forget: () => Promise<void>;
  connectionPriority: ConnectionPriority | null;
  setConnectionPriority: (priority: ConnectionPriority) => Promise<void>;
  services: BluetoothRemoteGATTService[];
  error: BeacioErrorType | null;
  autoReconnect: boolean;
  setAutoReconnect: (value: boolean) => void;
  reconnectAttempt: number;
}

export interface UseCharacteristicReturn {
  device: BeacioDevice | null;
  serviceUUID: string | null;
  characteristicUUID: string | null;
  value: DataView | null;
  read: () => Promise<DataView | null>;
  write: (value: BufferSource) => Promise<void>;
  writeWithoutResponse: (value: BufferSource) => Promise<void>;
  subscribe: (handler: NotificationHandler) => Promise<void>;
  unsubscribe: () => Promise<void>;
  isNotifying: boolean;
  error: BeacioErrorType | null;
}

export interface UseNotificationsReturn {
  isSubscribed: boolean;
  value: DataView | null;
  history: NotificationEntry[];
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  clear: () => void;
  error: BeacioErrorType | null;
}

export interface NotificationEntry {
  timestamp: Date;
  value: DataView;
}

export interface UseScanReturn {
  scanState: ScanState;
  devices: BeacioDevice[];
  start: (options?: ScanOptions) => Promise<void>;
  stop: () => void;
  clear: () => void;
  error: BeacioErrorType | null;
}

export interface UseBackgroundSyncOptions {
  autoFetch?: boolean;
}

export interface UseBackgroundSyncReturn {
  permissionState: CoreNotificationPermissionState | null;
  registrations: CoreBackgroundRegistration[];
  isLoading: boolean;
  error: BeacioErrorType | null;
  isSupported: boolean;
  requestPermission: () => Promise<CoreNotificationPermissionState | null>;
  requestBackgroundConnection: (options: CoreBackgroundConnectionOptions) => Promise<CoreBackgroundRegistration | null>;
  registerCharacteristicNotifications: (options: CoreCharacteristicNotificationOptions) => Promise<CoreBackgroundRegistration | null>;
  registerBeaconScanning: (options: CoreBeaconScanningOptions) => Promise<CoreBackgroundRegistration | null>;
  list: () => Promise<CoreBackgroundRegistration[]>;
  unregister: (registrationId: string) => Promise<void>;
  update: (registrationId: string, template: Partial<CoreNotificationTemplate>) => Promise<void>;
  clearError: () => void;
}

export type ConnectionPriority = 'balanced' | 'high' | 'low-power';

// useConnection types
// AIDEV-NOTE: ConnectionStatus is distinct from ConnectionState — it adds 'idle'
// and 'requesting' states that exist only in the useConnection composition layer.
export type ConnectionStatus = 'idle' | 'requesting' | 'connecting' | 'connected' | 'disconnected';

export interface AutoReconnectOptions {
  maxAttempts?: number;
  initialDelay?: number;
  backoffMultiplier?: number;
}

export interface UseConnectionOptions {
  filters?: BluetoothLEScanFilter[];
  optionalServices?: string[];
  acceptAllDevices?: boolean;
  autoReconnect?: boolean | AutoReconnectOptions;
  // Opt-in: continuously monitor the connected device's signal strength by
  // watching its advertisements. Off by default — watching keeps the radio active.
  monitorRssi?: boolean;
}

export interface UseConnectionReturn {
  device: BeacioDevice | null;
  status: ConnectionStatus;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  services: BluetoothRemoteGATTService[];
  error: BeacioErrorType | null;
  // Live signal strength (dBm) of the connected device, or null when not monitoring.
  rssi: number | null;
  // Manual control over advertisement-based RSSI monitoring (auto-managed when
  // `monitorRssi` is set, but exposed for on-demand use).
  startRssiMonitoring: () => Promise<void>;
  stopRssiMonitoring: () => void;
}

// Utility types
export type ValueParser<T = unknown> = (value: DataView) => T;
export type ValueFormatter<T = unknown> = (value: T) => BufferSource;

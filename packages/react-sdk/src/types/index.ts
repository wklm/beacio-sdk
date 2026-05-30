/**
 * Type definitions for @ios-web-bluetooth/react SDK
 *
 * Device types use WebBLEDevice from @ios-web-bluetooth/core.
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
  WebBLE as WebBLECore,
  WebBLEBackgroundSync,
  WebBLEDevice,
  WebBLEError as WebBLEErrorType,
  WebBLEPeripheral,
} from '@ios-web-bluetooth/core';

// Re-export RequestDeviceOptions from core -- single source of truth
export type { RequestDeviceOptions } from '@ios-web-bluetooth/core';
// AIDEV-NOTE: Alias used in interfaces below to avoid shadowing by the global
// RequestDeviceOptions that @types/web-bluetooth declares.
type RequestDeviceOptions = CoreRequestDeviceOptions;

// Re-export error from core -- replaces compat-error.ts
export { WebBLEError } from '@ios-web-bluetooth/core';

/**
 * SDK wrapper around a GATT service. Avoids leaking raw
 * BluetoothRemoteGATTService in public types.
 */
export interface WebBLEGATTService {
  uuid: string;
  isPrimary: boolean;
}

// Configuration types — single source of truth for SDK configuration
export interface WebBLEConfig {
  /** API key from ioswebble.com (wbl_xxxxx) -- enables install prompt on iOS Safari */
  apiKey?: string;
  /** Operator/app name shown in the install prompt (e.g. "FitTracker") */
  operatorName?: string;
  /** Preferred onboarding URL override (defaults to WebBLE setup flow) */
  startOnboardingUrl?: string;
  /** App Store URL override (defaults to WebBLE listing) */
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
  WebBLEBackgroundSync,
  WebBLEPeripheral,
} from '@ios-web-bluetooth/core';

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

// Hook return types -- all device references use WebBLEDevice
export interface UseBluetoothReturn {
  isAvailable: boolean;
  isExtensionInstalled: boolean;
  extensionInstallState: 'not-installed' | 'installed-inactive' | 'active';
  isSupported: boolean;
  ble: WebBLECore;
  backgroundSync: WebBLEBackgroundSync;
  peripheral: WebBLEPeripheral;
  requestDevice: (options?: RequestDeviceOptions) => Promise<WebBLEDevice | null>;
  getDevices: () => Promise<WebBLEDevice[]>;
  error: WebBLEErrorType | null;
}

export interface UseDeviceReturn {
  device: WebBLEDevice | null;
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
  error: WebBLEErrorType | null;
  autoReconnect: boolean;
  setAutoReconnect: (value: boolean) => void;
  reconnectAttempt: number;
}

export interface UseCharacteristicReturn {
  device: WebBLEDevice | null;
  serviceUUID: string | null;
  characteristicUUID: string | null;
  value: DataView | null;
  read: () => Promise<DataView | null>;
  write: (value: BufferSource) => Promise<void>;
  writeWithoutResponse: (value: BufferSource) => Promise<void>;
  subscribe: (handler: NotificationHandler) => Promise<void>;
  unsubscribe: () => Promise<void>;
  isNotifying: boolean;
  error: WebBLEErrorType | null;
}

export interface UseNotificationsReturn {
  isSubscribed: boolean;
  value: DataView | null;
  history: NotificationEntry[];
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  clear: () => void;
  error: WebBLEErrorType | null;
}

export interface NotificationEntry {
  timestamp: Date;
  value: DataView;
}

export interface UseScanReturn {
  scanState: ScanState;
  devices: WebBLEDevice[];
  start: (options?: ScanOptions) => Promise<void>;
  stop: () => void;
  clear: () => void;
  error: WebBLEErrorType | null;
}

export interface UseBackgroundSyncOptions {
  autoFetch?: boolean;
}

export interface UseBackgroundSyncReturn {
  permissionState: CoreNotificationPermissionState | null;
  registrations: CoreBackgroundRegistration[];
  isLoading: boolean;
  error: WebBLEErrorType | null;
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
}

export interface UseConnectionReturn {
  device: WebBLEDevice | null;
  status: ConnectionStatus;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  services: BluetoothRemoteGATTService[];
  error: WebBLEErrorType | null;
}

// Utility types
export type ValueParser<T = unknown> = (value: DataView) => T;
export type ValueFormatter<T = unknown> = (value: T) => BufferSource;

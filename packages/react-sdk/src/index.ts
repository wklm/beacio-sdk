/**
 * @beacio/react - Production-grade Web Bluetooth SDK for React
 *
 * One-line integration for Web Bluetooth in React applications
 * with full Safari support through the Beacio extension.
 */

// Core exports
export { BeacioProvider, useBeacio } from './core/BeacioProvider';
export { ExtensionDetector } from './core/ExtensionDetector';

// Hook exports
export { useBluetooth } from './hooks/useBluetooth';
export { useDevice } from './hooks/useDevice';
export { useCharacteristic } from './hooks/useCharacteristic';
export { useNotifications } from './hooks/useNotifications';
export { useScan } from './hooks/useScan';
export { useBackgroundSync } from './hooks/useBackgroundSync';
export { useProfile } from './hooks/useProfile';
export { useConnection } from './hooks/useConnection';

// Component exports
export { DeviceScanner } from './components/DeviceScanner';
export { ServiceExplorer } from './components/ServiceExplorer';
export { InstallationWizard } from './components/InstallationWizard';

// Re-export core types (single source of truth -- not duplicated)
export type {
  BackgroundConnectionOptions,
  BackgroundRegistration,
  BackgroundRegistrationType,
  BeaconScanningOptions,
  CharacteristicNotificationOptions,
  NotificationPermissionState,
  NotificationTemplate,
  BeacioDevice,
  BeacioError,
  BeacioErrorCode,
  Platform,
  RequestDeviceOptions,
  NotificationCallback,
  WriteOptions,
  WriteLimits,
} from '@beacio/core';

// Local type exports
export type {
  BeacioConfig,
  UseBluetoothReturn,
  UseDeviceReturn,
  UseCharacteristicReturn,
  UseNotificationsReturn,
  UseBackgroundSyncOptions,
  UseBackgroundSyncReturn,
  UseScanReturn,
  ConnectionState,
  ScanState,
  NotificationHandler,
  UseConnectionOptions,
  UseConnectionReturn,
  ConnectionStatus as UseConnectionStatus,
} from './types';

// Utility exports
export {
  getServiceName,
  getCharacteristicName,
  parseValue,
  formatValue
} from './utils/bluetooth-utils';

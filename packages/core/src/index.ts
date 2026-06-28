export { Beacio } from './beacio';
export { BeacioDevice } from './device';
export { chunkSize, clampChunkSize } from './write-chunker';
export type { ChunkSize } from './write-chunker';
export { percent, clampPercent } from './units';
export type { Percentage } from './units';
export { BeacioError, withRetry } from './errors';
export type { RetryOptions, BeacioErrorCode } from './errors';
export {
  resolveUUID,
  getServiceName,
  getCharacteristicName,
  getDisplayName,
  BluetoothUUID,
  canonicalUUID,
  getDescriptor,
} from './uuid';
export { detectPlatform, getBluetoothAPI } from './platform';
export { SETUP_URL } from './urls';
export { BEACIO_EVENTS } from './events';
export type { BeacioEventName } from './events';
export {
  readUint8,
  readUint16LE,
  readUint16BE,
  readInt16LE,
  readUint32LE,
  readFloat32LE,
  readUtf8,
  readBytes,
} from './dataview-helpers';
export type {
  ActiveSubscription,
  AutoReconnectOptions,
  BackgroundConnectionOptions,
  ConnectOptions,
  BackgroundRegistration,
  BackgroundRegistrationType,
  BeaconScanFilter,
  BeaconScanningOptions,
  CharacteristicNotificationOptions,
  ConditionDecoder,
  ConditionOperator,
  Platform,
  BeacioOptions,
  RequestDeviceOptions,
  BluetoothLEScanFilter,
  DeviceErrorContext,
  DisconnectReason,
  NativeOverflowEvent,
  NotificationCallback,
  SubscribeOptions,
  NotificationOptions,
  NotificationOverflowStrategy,
  QueueOverflowEvent,
  ReadOptions,
  NotificationCondition,
  NotificationPermissionState,
  NotificationTemplate,
  ReplyActionConfig,
  SubscriptionLostEvent,
  BeacioBackgroundSync,
  BeacioPeripheral,
  BeacioPeripheralAdvertisingOptions,
  BeacioPeripheralCharacteristicDefinition,
  BeacioPeripheralCharacteristicProperty,
  BeacioPeripheralCharacteristicRecord,
  BeacioPeripheralConnectionStateChange,
  BeacioPeripheralEventMap,
  BeacioPeripheralNotificationReady,
  BeacioPeripheralServiceDefinition,
  BeacioPeripheralServiceRecord,
  BeacioPeripheralSendOptions,
  BeacioPeripheralSendResult,
  BeacioPeripheralSubscriptionChange,
  BeacioPeripheralWriteRequest,
  WriteMode,
  WriteAutoOptions,
  WriteAutoResult,
  WriteOptions,
  WriteFragmentedOptions,
  WriteFragmentedResult,
  WriteLargeOptions,
  WriteLargeResult,
  WriteLimits,
} from './types';

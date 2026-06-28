# @beacio/react API Documentation

Complete API reference for the @beacio/react SDK.

## Table of Contents

- [Provider](#provider)
- [Hooks](#hooks)
  - [useBluetooth](#usebluetooth)
  - [useDevice](#usedevice)
  - [useCharacteristic](#usecharacteristic)
  - [useNotifications](#usenotifications)
  - [useScan](#usescan)
  - [useConnection](#useconnection)
- [Components](#components)
  - [DeviceScanner](#devicescanner)
  - [ServiceExplorer](#serviceexplorer)
  - [InstallationWizard](#installationwizard)
- [Types](#types)
- [Utilities](#utilities)

## Provider

### `beacio.Provider`

The root provider component that enables Web Bluetooth functionality in your React app.

```tsx
import { beacio } from '@beacio/react';

<beacio.Provider config={config}>
  <App />
</beacio.Provider>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `config` | `BeacioConfig` | `{}` | Configuration options |
| `children` | `ReactNode` | Required | Child components |

#### BeacioConfig

```typescript
interface BeacioConfig {
  autoReconnect?: boolean;      // Auto-reconnect on disconnect (default: true)
  reconnectAttempts?: number;    // Max reconnection attempts (default: 3)
  reconnectDelay?: number;       // Delay between attempts in ms (default: 1000)
  cacheTimeout?: number;        // GATT cache timeout in ms (default: 30000)
  debugMode?: boolean;          // Enable debug logging (default: false)
}
```

## Hooks

### `useBluetooth`

Main hook for Bluetooth operations.

```tsx
const bluetooth = beacio.useBluetooth();
```

#### Returns

```typescript
interface UseBluetoothReturn {
  isAvailable: boolean;
  isExtensionInstalled: boolean;
  isChecking: boolean;
  requestDevice: (options?: RequestDeviceOptions) => Promise<BluetoothDevice | null>;
  getDevices: () => Promise<BluetoothDevice[]>;
  requestLEScan: (options?: BluetoothLEScanOptions) => Promise<BluetoothLEScan | null>;
}
```

#### Example

```tsx
function Component() {
  const { isAvailable, requestDevice } = beacio.useBluetooth();
  
  const connect = async () => {
    const device = await requestDevice({
      filters: [{ services: ['heart_rate'] }]
    });
  };
}
```

### `useDevice`

Manage a specific Bluetooth device.

```tsx
const device = beacio.useDevice(deviceId, options);
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `deviceId` | `string \| undefined` | Yes | Device ID |
| `options` | `UseDeviceOptions` | No | Configuration |

#### Returns

```typescript
interface UseDeviceReturn {
  device: BluetoothDevice | null;
  isConnected: boolean;
  connectionState: ConnectionState;
  services: BluetoothRemoteGATTService[];
  error: Error | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  forget: () => Promise<void>;
  watchAdvertisements: () => Promise<void>;
  unwatchAdvertisements: () => Promise<void>;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';
```

#### Options

```typescript
interface UseDeviceOptions {
  autoConnect?: boolean;        // Auto-connect on mount
  cacheServices?: boolean;      // Cache GATT services
  onConnect?: () => void;       // Connection callback
  onDisconnect?: () => void;    // Disconnection callback
}
```

### `useCharacteristic`

Read and write BLE characteristics.

```tsx
const characteristic = beacio.useCharacteristic(characteristicId, options);
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `characteristicId` | `string \| undefined` | Yes | Characteristic UUID |
| `options` | `UseCharacteristicOptions` | No | Configuration |

#### Returns

```typescript
interface UseCharacteristicReturn {
  value: DataView | null;
  properties: CharacteristicProperties | undefined;
  isReading: boolean;
  isWriting: boolean;
  error: Error | null;
  readValue: () => Promise<DataView>;
  writeValue: (value: BufferSource) => Promise<void>;
  writeValueWithoutResponse: (value: BufferSource) => Promise<void>;
  startNotifications: () => Promise<void>;
  stopNotifications: () => Promise<void>;
}

interface CharacteristicProperties {
  broadcast: boolean;
  read: boolean;
  writeWithoutResponse: boolean;
  write: boolean;
  notify: boolean;
  indicate: boolean;
  authenticatedSignedWrites: boolean;
  reliableWrite: boolean;
  writableAuxiliaries: boolean;
}
```

#### Options

```typescript
interface UseCharacteristicOptions {
  autoRead?: boolean;           // Auto-read on mount
  pollingInterval?: number;     // Polling interval in ms
  encoding?: 'utf8' | 'hex';    // Value encoding
}
```

### `useNotifications`

Real-time notifications from characteristics.

```tsx
const notifications = beacio.useNotifications(characteristicId, options);
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `characteristicId` | `string \| undefined` | Yes | Characteristic UUID |
| `options` | `UseNotificationsOptions` | No | Configuration |

#### Returns

```typescript
interface UseNotificationsReturn {
  value: any;
  rawValue: DataView | null;
  isSubscribed: boolean;
  error: Error | null;
  history: NotificationHistory[];
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  clearHistory: () => void;
}

interface NotificationHistory {
  value: any;
  timestamp: number;
  rssi?: number;
}
```

#### Options

```typescript
interface UseNotificationsOptions {
  autoSubscribe?: boolean;      // Auto-subscribe on mount
  maxHistory?: number;          // Max history entries (default: 100)
  decoder?: (value: DataView) => any;  // Custom decoder
}
```

### `useScan`

Scan for nearby BLE devices.

```tsx
const scan = beacio.useScan(options);
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `options` | `UseScanOptions` | No | Scan configuration |

#### Returns

```typescript
interface UseScanReturn {
  isScanning: boolean;
  devices: BluetoothDevice[];
  error: Error | null;
  startScan: (options?: BluetoothLEScanOptions) => Promise<void>;
  stopScan: () => Promise<void>;
  clearDevices: () => void;
}
```

#### Options

```typescript
interface UseScanOptions {
  autoStart?: boolean;          // Auto-start on mount
  duration?: number;            // Scan duration in ms
  filters?: BluetoothLEScanFilter[];
  keepRepeatedDevices?: boolean;
  acceptAllAdvertisements?: boolean;
}
```

### `useConnection`

Advanced connection management.

```tsx
const connection = beacio.useConnection(deviceId, options);
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `deviceId` | `string \| undefined` | Yes | Device ID |
| `options` | `UseConnectionOptions` | No | Configuration |

#### Returns

```typescript
interface UseConnectionReturn {
  connectionState: ConnectionState;
  connectionQuality: ConnectionQuality;
  rssi: number | null;
  mtu: number | null;
  connectionPriority: ConnectionPriority | null;
  reconnect: () => Promise<void>;
  setConnectionPriority: (priority: ConnectionPriority) => Promise<void>;
  requestMtu: (mtu: number) => Promise<number>;
}

type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor';
type ConnectionPriority = 'low' | 'balanced' | 'high';
```

## Components

### `DeviceScanner`

Full-featured device selection UI component.

```tsx
<beacio.DeviceScanner {...props} />
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `filters` | `BluetoothLEScanFilter[]` | `[]` | Device filters |
| `onDeviceSelected` | `(device: BluetoothDevice) => void` | Required | Selection callback |
| `onCancel` | `() => void` | - | Cancel callback |
| `showSignalStrength` | `boolean` | `true` | Show RSSI values |
| `showDeviceInfo` | `boolean` | `true` | Show device details |
| `autoConnect` | `boolean` | `false` | Auto-connect on selection |
| `scanDuration` | `number` | - | Auto-stop after ms |
| `className` | `string` | - | CSS class |
| `style` | `CSSProperties` | - | Inline styles |

### `ServiceExplorer`

GATT service and characteristic explorer.

```tsx
<beacio.ServiceExplorer {...props} />
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `deviceId` | `string` | Required | Device ID |
| `expandedByDefault` | `boolean` | `false` | Expand all services |
| `showRawValues` | `boolean` | `false` | Show hex values |
| `showProperties` | `boolean` | `true` | Show characteristic properties |
| `onCharacteristicRead` | `(char, value) => void` | - | Read callback |
| `onCharacteristicWrite` | `(char, value) => void` | - | Write callback |
| `onError` | `(error) => void` | - | Error callback |
| `className` | `string` | - | CSS class |

### `InstallationWizard`

Extension installation helper component.

```tsx
<beacio.InstallationWizard {...props} />
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onComplete` | `() => void` | - | Installation complete callback |
| `skipIfInstalled` | `boolean` | `true` | Skip if already installed |
| `showInstructions` | `boolean` | `true` | Show install instructions |
| `className` | `string` | - | CSS class |

## Types

### Core Types

```typescript
// Device request options
interface RequestDeviceOptions {
  filters?: BluetoothLEScanFilter[];
  optionalServices?: BluetoothServiceUUID[];
  acceptAllDevices?: boolean;
}

// Scan filter
interface BluetoothLEScanFilter {
  services?: BluetoothServiceUUID[];
  name?: string;
  namePrefix?: string;
  manufacturerData?: Array<{
    companyIdentifier: number;
    dataPrefix?: BufferSource;
    mask?: BufferSource;
  }>;
  serviceData?: Array<{
    service: BluetoothServiceUUID;
    dataPrefix?: BufferSource;
    mask?: BufferSource;
  }>;
}

// Service UUID
type BluetoothServiceUUID = number | string;

// Buffer source
type BufferSource = ArrayBuffer | ArrayBufferView;
```

### Device Types

```typescript
interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
  watchAdvertisements(): Promise<void>;
  unwatchAdvertisements(): Promise<void>;
  readonly watchingAdvertisements: boolean;
  forget(): Promise<void>;
}

interface BluetoothRemoteGATTServer {
  readonly device: BluetoothDevice;
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
  getPrimaryServices(service?: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService[]>;
}
```

### Service Types

```typescript
interface BluetoothRemoteGATTService extends EventTarget {
  readonly device: BluetoothDevice;
  readonly uuid: string;
  readonly isPrimary: boolean;
  getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>;
  getCharacteristics(characteristic?: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic[]>;
  getIncludedService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
  getIncludedServices(service?: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService[]>;
}
```

### Characteristic Types

```typescript
interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly service: BluetoothRemoteGATTService;
  readonly uuid: string;
  readonly properties: BluetoothCharacteristicProperties;
  readonly value?: DataView;
  getDescriptor(descriptor: BluetoothDescriptorUUID): Promise<BluetoothRemoteGATTDescriptor>;
  getDescriptors(descriptor?: BluetoothDescriptorUUID): Promise<BluetoothRemoteGATTDescriptor[]>;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}
```

## Utilities

### `ExtensionDetector`

Detect beacio extension installation.

```typescript
import { ExtensionDetector } from '@beacio/react';

const detector = new ExtensionDetector();
const isInstalled = await detector.detect();
```

### `BeacioClient`

Low-level Web Bluetooth client.

```typescript
import { BeacioClient } from '@beacio/react';

const client = new BeacioClient({
  autoConnect: true,
  cacheTimeout: 60000,
  retryAttempts: 5
});

const device = await client.requestDevice();
```

### `bluetoothUtils`

Utility functions for Bluetooth operations.

```typescript
import { bluetoothUtils } from '@beacio/react';

// Parse characteristic value
const heartRate = bluetoothUtils.parseHeartRate(dataView);

// Format UUID
const uuid = bluetoothUtils.formatUUID('180d');

// Get service name
const name = bluetoothUtils.getServiceName('heart_rate');
```

## Error Handling

### Error Types

```typescript
// Not found (user cancelled)
class NotFoundError extends DOMException {
  name: 'NotFoundError';
}

// Permission denied
class NotAllowedError extends DOMException {
  name: 'NotAllowedError';
}

// Device out of range
class NetworkError extends DOMException {
  name: 'NetworkError';
}

// Not supported
class NotSupportedError extends DOMException {
  name: 'NotSupportedError';
}

// Invalid state
class InvalidStateError extends DOMException {
  name: 'InvalidStateError';
}
```

### Error Handling Example

```tsx
try {
  const device = await requestDevice();
} catch (error) {
  switch (error.name) {
    case 'NotFoundError':
      // User cancelled
      break;
    case 'NotAllowedError':
      // Permission denied
      break;
    case 'NetworkError':
      // Connection failed
      break;
    default:
      // Unknown error
      console.error(error);
  }
}
```

## Events

### Device Events

```typescript
device.addEventListener('gattserverdisconnected', (event) => {
  console.log('Device disconnected');
});

device.addEventListener('advertisementreceived', (event) => {
  console.log('RSSI:', event.rssi);
});
```

### Characteristic Events

```typescript
characteristic.addEventListener('characteristicvaluechanged', (event) => {
  const value = event.target.value;
  console.log('New value:', value);
});
```

## Best Practices

1. **Always check availability** before using Bluetooth APIs
2. **Handle errors gracefully** - users may cancel or deny permission
3. **Clean up resources** - disconnect and remove listeners when done
4. **Use caching** to improve performance
5. **Implement reconnection** for better user experience
6. **Validate data** before writing to characteristics
7. **Use TypeScript** for better type safety
8. **Test on real devices** - simulators may not support Bluetooth

## Migration Guide

### From vanilla Web Bluetooth

```javascript
// Before (vanilla)
navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] })
  .then(device => device.gatt.connect())
  .then(server => server.getPrimaryService('heart_rate'))
  .then(service => service.getCharacteristic('heart_rate_measurement'))
  .then(characteristic => characteristic.startNotifications());

// After (@beacio/react)
const { requestDevice } = beacio.useBluetooth();
const { startNotifications } = beacio.useCharacteristic('heart_rate_measurement');

const device = await requestDevice({ filters: [{ services: ['heart_rate'] }] });
await startNotifications();
```

### From other React Bluetooth libraries

Most React Bluetooth libraries have similar APIs. Key differences:

1. **Provider required** - Wrap your app with `beacio.Provider`
2. **Hooks-first** - Use hooks instead of components for logic
3. **TypeScript native** - Full type safety out of the box
4. **Extension support** - Works with beacio Safari Extension

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Bluetooth not available" | Install beacio extension or use supported browser |
| "Permission denied" | Check browser permissions and HTTPS requirement |
| "Device not found" | Ensure device is advertising and in range |
| "Connection failed" | Check device is not connected elsewhere |
| "Write failed" | Verify characteristic supports write operation |

### Debug Mode

Enable debug logging:

```tsx
<beacio.Provider config={{ debugMode: true }}>
  <App />
</beacio.Provider>
```

### Performance Tips

1. **Batch operations** - Group multiple reads/writes
2. **Use notifications** instead of polling
3. **Cache services** to avoid re-discovery
4. **Limit scan duration** to save battery
5. **Disconnect when idle** to free resources

## Support

- GitHub Issues: https://github.com/wklm/beacio-sdk/issues
- Documentation: https://github.com/wklm/beacio-sdk/tree/main/packages/react-sdk/docs
- Examples: https://github.com/wklm/beacio-sdk/tree/main/examples/heart-rate-monitor
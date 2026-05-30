<p align="center">
  <a href="https://ioswebble.com"><img src="https://raw.githubusercontent.com/wklm/WebBLE-Safari-Extension/main/design-assets/brand/logo.png" alt="WebBLE" width="84" height="84"></a>
</p>

# @ios-web-bluetooth/react

[![npm version](https://img.shields.io/npm/v/@ios-web-bluetooth/react.svg)](https://www.npmjs.com/package/@ios-web-bluetooth/react)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

React hooks and components for Web Bluetooth. Works with the WebBLE Safari Extension for iOS support.

## Installation

```bash
npm install @ios-web-bluetooth/react @ios-web-bluetooth/core
```

Add the polyfill import to your app entry file:

```tsx
import '@ios-web-bluetooth/core/auto';
```

## Quick Start

```tsx
import { WebBLEProvider, useBluetooth, useDevice } from '@ios-web-bluetooth/react';
import type { WebBLEDevice } from '@ios-web-bluetooth/core';

function App() {
  return (
    <WebBLEProvider>
      <HeartRateMonitor />
    </WebBLEProvider>
  );
}

function HeartRateMonitor() {
  const { requestDevice } = useBluetooth();
  const [device, setDevice] = useState<WebBLEDevice | null>(null);
  const { isConnected, connect, disconnect } = useDevice(device, { autoReconnect: true });

  const handlePair = async () => {
    // Must be called from a user gesture (button click)
    const d = await requestDevice({ filters: [{ services: ['heart_rate'] }] });
    if (d) setDevice(d);
  };

  return (
    <div>
      {!device && <button onClick={handlePair}>Pair</button>}
      {device && !isConnected && <button onClick={connect}>Connect</button>}
      {isConnected && <button onClick={disconnect}>Disconnect</button>}
    </div>
  );
}
```

## Hooks

### `useBluetooth()`

Main hook for Bluetooth availability and device requests.

```tsx
import { useBluetooth } from '@ios-web-bluetooth/react';

const {
  isAvailable,          // Web Bluetooth available?
  isExtensionInstalled, // WebBLE extension installed?
  requestDevice,        // Request device (must be called from user gesture)
  getDevices,           // Get previously paired devices
  ble,                  // Core WebBLE instance
  backgroundSync,       // Background sync API
  peripheral,           // Peripheral mode API
  error,
} = useBluetooth();
```

### `useDevice(device, options?)`

Manage a device's connection lifecycle with optional auto-reconnect.

```tsx
import { useDevice } from '@ios-web-bluetooth/react';

const {
  connectionState,   // 'disconnected' | 'connecting' | 'connected' | 'disconnecting'
  isConnected,
  isConnecting,
  connect,
  disconnect,
  services,          // Discovered GATT services
  error,
  autoReconnect,     // Current auto-reconnect state
  setAutoReconnect,  // Toggle auto-reconnect
  reconnectAttempt,  // Current reconnect attempt number (0 = not reconnecting)
} = useDevice(device, {
  autoReconnect: true,
  reconnectAttempts: 3,
  reconnectDelay: 1000,
  reconnectBackoffMultiplier: 2,
  onReconnectAttempt: (attempt, delayMs) => {},
  onReconnectSuccess: (attempt) => {},
  onReconnectFailure: (error, attempt, willRetry) => {},
});
```

### `useCharacteristic(device, serviceUUID, characteristicUUID)`

Read, write, and subscribe to a BLE characteristic. All operations delegate to the core SDK.

```tsx
import { useCharacteristic } from '@ios-web-bluetooth/react';

const {
  value,              // Latest DataView value
  isNotifying,        // Currently subscribed?
  read,               // () => Promise<DataView | null>
  write,              // (value: BufferSource) => Promise<void>
  writeWithoutResponse,
  subscribe,          // (handler: (value: DataView) => void) => Promise<void>
  unsubscribe,
  error,
} = useCharacteristic(device, 'heart_rate', 'heart_rate_measurement');

// Read a value
const data = await read();

// Write a value
await write(new Uint8Array([0x01, 0x02]));

// Subscribe to notifications
await subscribe((value) => {
  console.log('Heart rate:', value.getUint8(1));
});
```

### `useNotifications(device, service, characteristic, options?)`

Subscribe to characteristic notifications with a rolling history.

```tsx
import { useNotifications } from '@ios-web-bluetooth/react';

const {
  value,          // Latest DataView
  history,        // Array<{ timestamp: Date, value: DataView }>
  isSubscribed,
  subscribe,      // () => Promise<void>
  unsubscribe,
  clear,          // Clear history
  error,
} = useNotifications(device, 'heart_rate', 'heart_rate_measurement', {
  autoSubscribe: true,
  maxHistory: 100,
});
```

### `useScan()`

Scan for nearby BLE devices.

```tsx
import { useScan } from '@ios-web-bluetooth/react';

const {
  scanState,  // 'idle' | 'scanning' | 'stopped'
  devices,    // WebBLEDevice[]
  start,      // (options?: ScanOptions) => Promise<void>
  stop,
  clear,
  error,
} = useScan();

await start({
  filters: [{ namePrefix: 'Device' }],
  keepRepeatedDevices: true,
});
```

## Components

### `<WebBLEProvider>`

Required context provider. Optionally accepts a pre-configured `WebBLE` instance.

```tsx
import { WebBLEProvider } from '@ios-web-bluetooth/react';

// Auto-creates WebBLE instance
<WebBLEProvider config={{ apiKey: 'wbl_xxxxx', operatorName: 'MyApp' }}>
  <App />
</WebBLEProvider>

// Or pass an existing instance (useful for testing)
<WebBLEProvider ble={existingBleInstance}>
  <App />
</WebBLEProvider>
```

### `<DeviceScanner>`

Device selection UI with scan controls.

```tsx
import { DeviceScanner } from '@ios-web-bluetooth/react';

<DeviceScanner
  filters={[{ services: ['heart_rate'] }]}
  onDeviceSelected={(device) => setDevice(device)}
  autoConnect
  maxDevices={10}
  scanDuration={30000}
/>
```

### `<ConnectionStatus>`

Connection state indicator dot.

```tsx
import { ConnectionStatus } from '@ios-web-bluetooth/react';

<ConnectionStatus device={device} className="status-dot" />
```

### `<InstallationWizard>`

Guides users through WebBLE extension installation on Safari iOS.

```tsx
import { InstallationWizard } from '@ios-web-bluetooth/react';

<InstallationWizard
  onComplete={() => console.log('Extension installed!')}
/>
```

## Error Handling

All hooks return a `WebBLEError` with `.code` and `.suggestion` fields:

```tsx
const { error } = useDevice(device);

if (error) {
  console.log(error.code);       // e.g. 'GATT_OPERATION_FAILED'
  console.log(error.suggestion);  // e.g. 'Check that the device is in range'
}
```

## TypeScript

Types are re-exported from `@ios-web-bluetooth/core` for convenience:

```tsx
import type { WebBLEDevice, WebBLEError, RequestDeviceOptions } from '@ios-web-bluetooth/react';
import type { ConnectionState, UseDeviceReturn } from '@ios-web-bluetooth/react';
```

## Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Safari iOS | Full | Requires WebBLE Extension |
| Chrome 56+ | Full | Native Web Bluetooth |
| Edge 79+ | Full | Native Web Bluetooth |

## License

MIT

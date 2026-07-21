<p align="center">
  <a href="https://beacio.com"><img src="https://beacio.com/img/logo.png" alt="beacio" width="84" height="84"></a>
</p>

# @beacio/react

[![npm version](https://img.shields.io/npm/v/@beacio/react.svg)](https://www.npmjs.com/package/@beacio/react)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

React hooks and components for Web Bluetooth. Works with the beacio Safari Extension for iOS support.

## Installation

```bash
npm install @beacio/react @beacio/core
```

Add the polyfill import to your app entry file:

```tsx
import '@beacio/core/auto';
```

## Quick Start

```tsx
import { BeacioProvider, useBluetooth, useDevice } from '@beacio/react';
import type { BeacioDevice } from '@beacio/core';

function App() {
  return (
    <BeacioProvider>
      <HeartRateMonitor />
    </BeacioProvider>
  );
}

function HeartRateMonitor() {
  const { requestDevice } = useBluetooth();
  const [device, setDevice] = useState<BeacioDevice | null>(null);
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
import { useBluetooth } from '@beacio/react';

const {
  isAvailable,          // Web Bluetooth available?
  isExtensionInstalled, // beacio extension installed?
  requestDevice,        // Request device (must be called from user gesture)
  getDevices,           // Get previously paired devices
  ble,                  // Core beacio instance
  backgroundSync,       // Background sync API
  peripheral,           // Peripheral mode API
  error,
} = useBluetooth();
```

### `useDevice(device, options?)`

Manage a device's connection lifecycle with optional auto-reconnect.

```tsx
import { useDevice } from '@beacio/react';

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
import { useCharacteristic } from '@beacio/react';

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
import { useNotifications } from '@beacio/react';

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
import { useScan } from '@beacio/react';

const {
  scanState,  // 'idle' | 'scanning' | 'stopped'
  devices,    // BeacioDevice[]
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

### `<BeacioProvider>`

Required context provider. Optionally accepts a pre-configured `beacio` instance.

```tsx
import { BeacioProvider } from '@beacio/react';

// Auto-creates beacio instance
<BeacioProvider config={{ apiKey: 'wbl_xxxxx', operatorName: 'MyApp' }}>
  <App />
</BeacioProvider>

// Or pass an existing instance (useful for testing)
<BeacioProvider ble={existingBleInstance}>
  <App />
</BeacioProvider>
```

### `<DeviceScanner>`

Device selection UI with scan controls.

```tsx
import { DeviceScanner } from '@beacio/react';

<DeviceScanner
  filters={[{ services: ['heart_rate'] }]}
  onDeviceSelected={(device) => setDevice(device)}
  autoConnect
  maxDevices={10}
  scanDuration={30000}
/>
```

### `<InstallationWizard>`

Guides users through beacio extension installation on Safari iOS.

```tsx
import { InstallationWizard } from '@beacio/react';

<InstallationWizard
  onComplete={() => console.log('Extension installed!')}
/>
```

## Error Handling

All hooks return a `BeacioError` with `.code` and `.suggestion` fields:

```tsx
const { error } = useDevice(device);

if (error) {
  console.log(error.code);       // e.g. 'GATT_OPERATION_FAILED'
  console.log(error.suggestion);  // e.g. 'Check that the device is in range'
}
```

## TypeScript

Types are re-exported from `@beacio/core` for convenience:

```tsx
import type { BeacioDevice, BeacioError, RequestDeviceOptions } from '@beacio/react';
import type { ConnectionState, UseDeviceReturn } from '@beacio/react';
```

## Migrating from Vanilla Web Bluetooth

Wrap your app with `<BeacioProvider>` (see Quick Start), then replace direct
`navigator.bluetooth` calls with the hooks. The hooks own the connection and
subscription lifecycle and clean up automatically on unmount, so manual
`gattserverdisconnected` listeners and teardown code can be deleted.

### Before (vanilla)

```javascript
navigator.bluetooth.requestDevice({
  filters: [{ services: ['heart_rate'] }]
})
.then(device => device.gatt.connect())
.then(server => server.getPrimaryService('heart_rate'))
.then(service => service.getCharacteristic('heart_rate_measurement'))
.then(characteristic => {
  characteristic.addEventListener('characteristicvaluechanged', (event) => {
    console.log('Heart Rate:', event.target.value.getUint8(1));
  });
  return characteristic.startNotifications();
})
.catch(error => console.error('Error:', error));
```

### After (@beacio/react)

```tsx
import { useBluetooth, useDevice, useNotifications } from '@beacio/react';
import type { BeacioDevice } from '@beacio/react';

function HeartRateMonitor() {
  const { requestDevice } = useBluetooth();
  const [device, setDevice] = useState<BeacioDevice | null>(null);
  const { connect } = useDevice(device);
  const { value, subscribe } = useNotifications(
    device,
    'heart_rate',
    'heart_rate_measurement',
  );

  const handleConnect = async () => {
    try {
      const paired = await requestDevice({
        filters: [{ services: ['heart_rate'] }]
      });
      if (paired) {
        setDevice(paired);
        await connect();
        await subscribe();
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const heartRate = value ? value.getUint8(1) : 0;

  return (
    <div>
      <button onClick={handleConnect}>Connect</button>
      {heartRate > 0 && <div>Heart Rate: {heartRate} BPM</div>}
    </div>
  );
}
```

### Migration map

| Vanilla Web Bluetooth | @beacio/react |
|---|---|
| `navigator.bluetooth.requestDevice(options)` | `useBluetooth().requestDevice(options)` |
| `navigator.bluetooth.getDevices()` | `useBluetooth().getDevices()` |
| `device.gatt.connect()` / `.disconnect()` | `useDevice(device).connect()` / `.disconnect()` |
| `gattserverdisconnected` listener + manual retry | `useDevice(device, { autoReconnect: true })` |
| `server.getPrimaryServices()` | `useDevice(device).services` |
| `characteristic.readValue()` | `useCharacteristic(...).read()` |
| `characteristic.writeValue(data)` | `useCharacteristic(...).write(data)` |
| `startNotifications()` + `characteristicvaluechanged` | `useNotifications(...)` or `useCharacteristic(...).subscribe(handler)` |
| `navigator.bluetooth.requestLEScan(options)` | `useScan().start(options)` |

Migration gotchas:

- `requestDevice` must still be called from a user gesture (button click) —
  the hook does not lift that platform requirement.
- Hook state replaces module-level `device` / `server` variables; keep the
  `BeacioDevice` in React state and pass it to the other hooks.
- Errors surface both from the thrown promise and the hook's `error` field
  (a `BeacioError` with `.code` / `.suggestion`).
- Custom service classes wrapping raw characteristics usually collapse into a
  small custom hook composed from `useCharacteristic` / `useNotifications`.

## Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Safari iOS | Full | Requires beacio Extension |
| Chrome 56+ | Full | Native Web Bluetooth |
| Edge 79+ | Full | Native Web Bluetooth |

## Publishing (maintainers)

Published to npm as [`@beacio/react`](https://www.npmjs.com/package/@beacio/react)
under the `@beacio` org (granular org read+write token required).
The tarball ships only `dist/`, `README.md`, `CHANGELOG.md`, `AGENTS.md` and
`LICENSE` (see `files` in `package.json`).

```bash
npm run build          # tsup: ESM + CJS + type declarations
npm pack --dry-run     # verify tarball contents
npm publish --access public            # production release
npm publish --access public --tag beta # prerelease
```

> The former standalone `docs/MIGRATION.md`, `docs/API.md` and `PUBLISHING.md`
> were folded into this README (archived 2026-07-02 — see git history).

## License

MIT

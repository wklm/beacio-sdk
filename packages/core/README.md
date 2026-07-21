<p align="center">
  <a href="https://beacio.com"><img src="https://beacio.com/img/logo.png" alt="beacio" width="84" height="84"></a>
</p>

# @beacio/core — Web Bluetooth Polyfill for Safari iOS

> **The Web Bluetooth API (`navigator.bluetooth`) is not available in Safari.**
> This SDK fixes that. One import and your BLE web app works on iPhone.
>
> On Chrome, Edge, and other browsers with native Web Bluetooth support, the SDK uses the native API directly — zero overhead.

## Install

```bash
npm install @beacio/core
```

Add the polyfill import in your app entry point. The package no longer prints a `postinstall` reminder, so setup lives here in the README instead:

```typescript
import '@beacio/core/auto';
// navigator.bluetooth now works everywhere — Safari iOS, Chrome, Edge.
```

## Safari iOS setup checklist

1. Install `@beacio/core`.
2. Add `import '@beacio/core/auto';` to the first browser entry file that runs in your app.
3. Make sure the beacio Safari extension is installed and enabled.
4. Call `requestDevice()` only from a direct user gesture such as a button click.

```typescript
button.addEventListener('click', async () => {
  const device = await ble.requestDevice({
    filters: [{ services: ['heart_rate'] }],
  });
});

// Wrong on Safari iOS: not a user gesture.
setTimeout(() => {
  ble.requestDevice({ filters: [{ services: ['heart_rate'] }] });
}, 0);
```

Or use the explicit API for full control:

```typescript
import { beacio } from '@beacio/core';

const ble = new Beacio();
const device = await ble.requestDevice({
  filters: [{ services: ['heart_rate'] }],
});
await device.connect();
const value = await device.read('heart_rate', 'heart_rate_measurement');
```

For direct browser-script usage, load the browser bundle from a CDN package root or `dist/browser.global.js`. It exposes the full core API as `window.BeacioCore`.

## Selective imports & tree-shaking

Zero dependencies. `sideEffects: false` enables tree-shaking — only what you import ships to the browser.

```typescript
// Full SDK (~4KB gzipped)
import { beacio, BeacioDevice, BeacioError } from '@beacio/core';

// Just UUID helpers (~1KB gzipped)
import { resolveUUID, getServiceName } from '@beacio/core';

// Just platform detection (~0.5KB gzipped)
import { detectPlatform } from '@beacio/core';
```

You do **not** need `@beacio/core/profiles` or `@beacio/react-sdk` for basic BLE operations. `@beacio/core` is fully self-contained.

## Scanning for devices

### Filter by service UUID

```typescript
import { beacio } from '@beacio/core';

const ble = new Beacio();
const device = await ble.requestDevice({
  filters: [{ services: ['heart_rate'] }],
});
```

### Filter by name or name prefix

```typescript
// Exact name match
const device = await ble.requestDevice({
  filters: [{ name: 'MyDevice' }],
  optionalServices: ['heart_rate'],
});

// Name prefix (matches "MyDevice-001", "MyDevice-002", etc.)
const device = await ble.requestDevice({
  filters: [{ namePrefix: 'My' }],
  optionalServices: ['heart_rate'],
});
```

### Combined filters

```typescript
const device = await ble.requestDevice({
  filters: [
    { services: ['heart_rate'] },
    { name: 'MyDevice', services: ['battery_service'] },
  ],
});
```

### Accept all devices

```typescript
const device = await ble.requestDevice({
  acceptAllDevices: true,
  optionalServices: ['heart_rate', 'battery_service'],
});
```

### Error handling for scanning

```typescript
import { beacio, BeacioError } from '@beacio/core';

const ble = new Beacio();
try {
  const device = await ble.requestDevice({
    filters: [{ services: ['heart_rate'] }],
  });
} catch (err) {
  if (err instanceof BeacioError) {
    switch (err.code) {
      case 'USER_CANCELLED':
        // User dismissed the device picker
        break;
      case 'DEVICE_NOT_FOUND':
        // No matching devices in range
        break;
      case 'BLUETOOTH_UNAVAILABLE':
        // Bluetooth is off or unsupported
        break;
      case 'EXTENSION_NOT_INSTALLED':
        // iOS Safari: beacio extension not active
        break;
    }
    console.log(err.suggestion); // Human-readable recovery hint
  }
}
```

> **iOS Safari note:** The beacio Safari extension must be installed and enabled under Settings > Apps > Safari > Extensions. Use the `@beacio/core/detect` banner to auto-prompt users when the extension is missing.

## Connecting & GATT service access

### Connect and read a characteristic

```typescript
await device.connect();
const value = await device.read('heart_rate', 'heart_rate_measurement');
console.log('Heart rate:', value.getUint8(1));
```

### Write a characteristic

```typescript
const data = new Uint8Array([0x01, 0x00]);
await device.write('battery_service', 'battery_level', data);
```

### UUID formats

You can use Bluetooth SIG short names or full 128-bit UUIDs interchangeably:

```typescript
// These are equivalent:
await device.read('heart_rate', 'heart_rate_measurement');
await device.read('0000180d-0000-1000-8000-00805f9b34fb', '00002a37-0000-1000-8000-00805f9b34fb');
```

Use `resolveUUID()` to convert names to full UUIDs:

```typescript
import { resolveUUID, getServiceName } from '@beacio/core';

resolveUUID('heart_rate');               // '0000180d-0000-1000-8000-00805f9b34fb'
getServiceName('0000180d-0000-1000-8000-00805f9b34fb'); // 'heart_rate'
```

> **Service discovery note:** The SDK handles GATT tree traversal internally. You don't need to manually discover services or get characteristic handles -- just pass the service and characteristic identifiers to `read()`, `write()`, or `subscribe()`.

## Notifications & subscriptions

### Callback-based

```typescript
const unsub = device.subscribe('heart_rate', 'heart_rate_measurement', (value) => {
  console.log('Heart rate:', value.getUint8(1));
});

// Later: clean up before disconnecting
unsub();
```

Use `subscribe()` when you want an unsubscribe function immediately for UI cleanup paths. Use `subscribeAsync()` when setup success matters and you want notification enablement failures to throw at the call site:

```typescript
const unsub = await device.subscribeAsync('heart_rate', 'heart_rate_measurement', (value) => {
  console.log('Heart rate:', value.getUint8(1));
});
```

### Async iterable

```typescript
for await (const value of device.notifications('heart_rate', 'heart_rate_measurement', { maxQueueSize: 32 })) {
  console.log('Heart rate:', value.getUint8(1));
  if (shouldStop) break;
}
```

Use the async iterator when you want sequential backpressure-aware processing instead of callback fan-out. Break the loop as soon as the screen unmounts, the reading mode changes, or the user navigates away so Safari does not keep a hot notification stream alive longer than needed.

`notifications()` requires an explicit `maxQueueSize`. When the queue overflows, the SDK always emits a `'queue-overflow'` device event. With the default `overflowStrategy: 'error'`, the iterator rejects instead of silently dropping values.

```typescript
device.on('queue-overflow', (event) => {
  console.warn('Notification queue overflow', event);
});
```

For long-running monitors, start with the smallest queue that still covers your UI update latency and move parsing work out of the loop body if notifications arrive faster than you can render them. More guidance: [`POWER_MANAGEMENT.md`](./POWER_MANAGEMENT.md).

## Connection lifecycle & cleanup

If your app fans out across several peripherals, you can set a soft SDK-side pool limit up front:

```typescript
const ble = new Beacio({ maxConnections: 2 });
```

When that limit is reached, `connect()` and `connectWithRetry()` throw `CONNECTION_LIMIT_REACHED` with a suggestion to disconnect another device or raise the limit.

### Graceful disconnect

Always clean up subscriptions before disconnecting. `disconnect()` is synchronous and `device.on('disconnected', ...)` receives `'intentional'` or `'unexpected'` so callers can distinguish user-initiated teardown from link loss:

```typescript
const unsub = device.subscribe('heart_rate', 'heart_rate_measurement', callback);

// When done:
unsub();             // 1. Remove subscription
device.disconnect(); // 2. Then disconnect
```

### Handle unexpected disconnections

```typescript
device.on('disconnected', () => {
  console.log('Device disconnected');
  // Fires for both intentional disconnect() calls and unexpected drops
});
```

Use `device.getLastDisconnectReason()` to query the most recent disconnect cause, and `device.getActiveSubscriptions()` to inspect which subscriptions are currently active or waiting for auto-recovery.

For transient link drops, use the built-in retry helper instead of hand-rolled retry loops:

```typescript
await device.connectWithRetry({
  maxAttempts: 4,
  delayMs: 500,
  backoffMultiplier: 2,
});
```

## Writes and MTU-aware chunking

The SDK keeps `write()` as the single primary write API. The default mode is `'with-response'`; pass `{ mode: 'without-response' }` for commands that should not wait for an ACK.

```typescript
await device.write('uart_service', 'tx_characteristic', payload, {
  mode: 'without-response',
  timeoutMs: 500,
});
```

For payloads that may or may not fit in a single ATT write, use `writeAuto()` to pick the smallest correct path based on negotiated limits and MTU:

```typescript
const result = await device.writeAuto('uart_service', 'tx_characteristic', payload, {
  mode: 'without-response',
  maxRetries: 2,
  retryDelayMs: 100,
});

console.log(result.fragmented, result.chunkCount);
```

For fully manual control, use `writeLarge()` or `writeFragmented()`:

```typescript
const result = await device.writeFragmented('uart_service', 'tx_characteristic', payload, {
  maxRetries: 2,
  retryDelayMs: 100,
});

console.log(result.bytesWritten, result.retryCount);
```

Partial transfer failures throw `BeacioError` with code `WRITE_INCOMPLETE` and retry metadata when available. Use `device.getWriteLimits()`, `device.getMtu()`, or `device.getEffectiveMtu()` when you need to choose chunk sizes explicitly.

### Retry utility

```typescript
import { withRetry } from '@beacio/core';

await withRetry(async () => {
  const value = await device.read('heart_rate', 'heart_rate_measurement');
  return value.getUint8(1);
}, {
  maxAttempts: 4,
  delayMs: 250,
  backoffMultiplier: 2,
});
```

`withRetry()` automatically stops on non-retriable `BeacioError`s and prefers `error.retryAfterMs` when the SDK can infer a safer retry delay.

### Full lifecycle example

```typescript
import { beacio, BeacioError } from '@beacio/core';

const ble = new Beacio({ maxConnections: 2 });

// 1. Check availability
if (!ble.isSupported) {
  console.log('Web Bluetooth not available');
  // On iOS Safari, suggest installing the beacio extension
}

// 2. Scan
const device = await ble.requestDevice({
  filters: [{ services: ['heart_rate'] }],
});

// 3. Connect
await device.connectWithRetry({ maxAttempts: 3, delayMs: 500 });

// 4. Subscribe
const unsub = await device.subscribeAsync('heart_rate', 'heart_rate_measurement', (value) => {
  console.log('Heart rate:', value.getUint8(1));
});

// 5. Handle disconnection
device.on('disconnected', () => {
  console.log('Connection lost');
});

// 6. Clean up when done
unsub();
await device.disconnect();
```

## Error handling

`requestDevice()` still must run inside a user gesture on Safari iOS. If you call it during page load, inside `setTimeout`, or from a framework lifecycle hook, the SDK surfaces that failure as `PERMISSION_DENIED` and the suggestion points back to a click/tap handler.

All SDK errors are `BeacioError` instances with a typed `code` and a human-readable `suggestion`:

```typescript
import { BeacioError } from '@beacio/core';

try {
  await device.connect();
  const value = await device.read('heart_rate', 'heart_rate_measurement');
} catch (err) {
  if (err instanceof BeacioError) {
    console.log(err.code);       // e.g. 'SERVICE_NOT_FOUND'
    console.log(err.message);    // Technical detail
    console.log(err.suggestion); // User-facing recovery hint
    console.log(err.retryAfterMs); // Suggested retry delay for transient failures
  }
}
```

**Error codes:**

| Code | When |
|------|------|
| `BLUETOOTH_UNAVAILABLE` | Bluetooth is off or not supported |
| `EXTENSION_NOT_INSTALLED` | iOS Safari: extension not active |
| `PERMISSION_DENIED` | User denied Bluetooth permission |
| `USER_CANCELLED` | User dismissed the device picker |
| `DEVICE_NOT_FOUND` | No matching devices in range |
| `DEVICE_DISCONNECTED` | Device disconnected during operation |
| `CONNECTION_TIMEOUT` | Connection attempt timed out |
| `SERVICE_NOT_FOUND` | Requested GATT service not on device |
| `CHARACTERISTIC_NOT_FOUND` | Requested characteristic not on device |
| `CHARACTERISTIC_NOT_READABLE` | Characteristic doesn't support read |
| `CHARACTERISTIC_NOT_WRITABLE` | Characteristic doesn't support write |
| `CHARACTERISTIC_NOT_NOTIFIABLE` | Characteristic doesn't support notifications |
| `GATT_OPERATION_FAILED` | Generic GATT operation failure |
| `SCAN_ALREADY_IN_PROGRESS` | Another scan is already running |
| `CONNECTION_LIMIT_REACHED` | The current `beacio` instance has already reached `maxConnections` |
| `TIMEOUT` | Operation timed out |
| `WRITE_INCOMPLETE` | A multi-part or interrupted write transferred only part of the payload |

## API

### `beacio`

| Member | Description |
|--------|-------------|
| `new Beacio(options?)` | Create SDK instance |
| `requestDevice(options?): Promise<BeacioDevice>` | Scan and select a BLE device |
| `getDevices(): Promise<BeacioDevice[]>` | Return already-granted devices when supported by the browser |
| `getAvailability(): Promise<boolean>` | Check if Bluetooth is available |
| `maxConnections: number \| null` | Optional SDK-managed connection pool limit |
| `platform: Platform` | Current platform (`'ios-safari'`, `'chrome'`, `'unsupported'`) |
| `isSupported: boolean` | Whether Web Bluetooth is available |

### `BeacioDevice`

| Member | Description |
|--------|-------------|
| `id: string` | Unique device identifier |
| `name: string \| undefined` | Advertised device name |
| `connect(): Promise<void>` | Connect to the device |
| `connectWithRetry(options?): Promise<void>` | Connect with retry/backoff using SDK retry metadata |
| `disconnect(): void` | Disconnect from the device |
| `read(service, characteristic): Promise<DataView>` | Read a characteristic value |
| `write(service, characteristic, value): Promise<void>` | Write a value (`ArrayBuffer` or `Uint8Array`) |
| `writeAuto(service, characteristic, value, options): Promise<WriteAutoResult>` | Auto-select single vs fragmented write based on current limits |
| `writeFragmented(service, characteristic, value, options): Promise<WriteFragmentedResult>` | Chunked write with retry metadata |
| `writeLarge(service, characteristic, value, options): Promise<WriteLargeResult>` | Chunked write helper |
| `subscribe(service, characteristic, callback): () => void` | Subscribe to notifications; returns unsubscribe function |
| `subscribeAsync(service, characteristic, callback): Promise<() => void>` | Await notification setup and get unsubscribe function |
| `notifications(service, characteristic, { maxQueueSize, ... }): AsyncIterable<DataView>` | Async iterable of notification values with explicit queue bound |
| `getWriteLimits(): Promise<WriteLimits>` | Report transport write limits when available |
| `getMtu(): Promise<number \| null>` | Return negotiated MTU when exposed by the platform |
| `getEffectiveMtu(): Promise<number>` | Return a best-effort MTU, defaulting to 23 |
| `getLastDisconnectReason(): DisconnectReason \| null` | Return the most recent disconnect reason |
| `getActiveSubscriptions(): ActiveSubscription[]` | Inspect active or auto-recovering subscriptions |
| `on('disconnected' \| 'queue-overflow' \| 'subscription-lost' \| 'reconnected', listener): void` | Listen for device lifecycle events |
| `addErrorListener(listener): () => void` | Subscribe to internal async callback errors |

### `BeacioError`

| Member | Description |
|--------|-------------|
| `code: BeacioErrorCode` | Typed error code (see table above) |
| `message: string` | Error detail |
| `suggestion: string` | Human-readable recovery hint |
| `isRetriable: boolean` | Whether the failure is safe to retry automatically |
| `retryAfterMs?: number` | Suggested delay before retrying when known |
| `BeacioError.from(error, fallbackCode)` | Wrap unknown errors |

### Utility functions

| Function | Description |
|----------|-------------|
| `resolveUUID(name): string` | Convert Bluetooth SIG name to full 128-bit UUID |
| `getServiceName(uuid): string \| undefined` | Get human-readable service name from UUID |
| `getCharacteristicName(uuid): string \| undefined` | Get human-readable characteristic name from UUID |
| `detectPlatform(): Platform` | Returns `'ios-safari'`, `'chrome'`, or `'unsupported'` |
| `withRetry(fn, options): Promise<T>` | Retry a BLE operation using `BeacioError` retry metadata |

## AI agent integration

MCP server for coding agents (Claude Code, Cursor, Copilot):

```
npx -y @beacio/mcp
```

Full SDK reference for LLM context: <https://beacio.com/llms-full.txt>

## Two scopes

The **`@beacio/*`** packages (`core`, `profiles`, `react`) are the cross-browser BLE SDK -- they work on any platform with Web Bluetooth support (Chrome, Edge, iOS Safari via the extension). The **`@beacio/*`** packages (`detect`, `cli`, `mcp`, `skill`) handle iOS-specific extension detection, install prompts, and agent tooling. Use both together for full iOS Safari coverage.

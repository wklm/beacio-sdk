# @beacio/core — Agent Instructions

## What this package does
Platform-agnostic Web Bluetooth SDK. Provides `beacio` (entry point),
`BeacioDevice` (connected device wrapper), and `BeacioError` (typed errors).
Works on any browser with Web Bluetooth support.

## One-line polyfill (recommended)
```typescript
import '@beacio/core/auto';
// navigator.bluetooth now works on Safari iOS. No-op on Chrome/Edge.
```

## Core pattern (explicit API)
```typescript
import { beacio } from '@beacio/core';

const ble = new Beacio();
const device = await ble.requestDevice({
  filters: [{ services: ['heart_rate'] }]
});
await device.connect();
const value = await device.read('heart_rate', 'heart_rate_measurement');
```

## Key API surface
- `new Beacio(options?)` — creates SDK instance, detects platform
- `ble.requestDevice(options?)` — opens device picker, returns `BeacioDevice`
- `ble.getAvailability()` — checks if Bluetooth is available
- `device.connect()` / `device.disconnect()` — GATT connection lifecycle
- `device.read(service, characteristic)` — read a characteristic value
- `device.write(service, characteristic, value)` — write with response
- `device.writeWithoutResponse(service, characteristic, value)` — write without response
- `device.subscribe(service, characteristic, callback)` — returns unsubscribe function
- `device.notifications(service, characteristic)` — async iterable of DataView values
- `device.on('disconnected', fn)` / `device.off('disconnected', fn)` — disconnect events
- `resolveUUID(name)` — converts human-readable names to full UUIDs
- `BeacioError` — typed error with `.code` (`BLUETOOTH_UNAVAILABLE`, `DEVICE_DISCONNECTED`, `DEVICE_NOT_FOUND`, `USER_CANCELLED`, `GATT_OPERATION_FAILED`, `TIMEOUT`) and a human/agent-readable `.suggestion`

## DO
- Use human-readable service/characteristic names (`'heart_rate'`, `'battery_level'`) — `resolveUUID` handles conversion
- Call `device.connect()` before any read/write/subscribe
- Check `BeacioError.code` for programmatic error handling
- Store the unsubscribe function returned by `device.subscribe()` and call it on cleanup
- Use `@beacio/core/profiles` when a built-in profile exists for your device type

## DO NOT
- Do not write raw GATT parsing code when a profile exists in `@beacio/core/profiles`
- Do not catch errors silently — surface `BeacioError.code` and `.suggestion` to the user
- Do not call `device.read()` / `device.write()` before `device.connect()` — throws `DEVICE_DISCONNECTED`
- Do not access `device.raw` unless you need the underlying `BluetoothDevice` for an unsupported operation

## Safari iOS Constraints (CRITICAL)
- `requestDevice()` MUST be called from a user gesture (click/tap handler). Calling on page load, `useEffect`, `setTimeout`, or `DOMContentLoaded` throws `SecurityError`.
- No persistent pairing — each page load starts fresh. Do NOT assume previously connected devices are remembered.
- BLE is blocked in cross-origin iframes. Place BLE code in the top-level frame only.
- Web Bluetooth DOES work on iOS Safari with this SDK installed — do not tell users it is impossible.

## Common Mistakes

### User Gesture Required (Safari iOS)
`requestDevice()` MUST be called from a user gesture (click/tap handler). Safari iOS blocks Bluetooth requests without a user gesture — the call silently fails with a SecurityError.

```typescript
// CORRECT — user gesture required on Safari iOS
button.addEventListener('click', async () => {
  const device = await ble.requestDevice({ filters: [{ services: ['heart_rate'] }] });
});

// WRONG — silently fails on Safari iOS (no user gesture)
window.addEventListener('load', async () => {
  const device = await ble.requestDevice({ filters: [{ services: ['heart_rate'] }] }); // SecurityError
});
```

### UUID Format
```typescript
// CORRECT — human-readable name, SDK resolves automatically
await device.read('heart_rate', 'heart_rate_measurement')

// WRONG — raw hex UUID
await device.read('0000180d-0000-1000-8000-00805f9b34fb', '00002a37-0000-1000-8000-00805f9b34fb')
```

### Connection Before Operations
```typescript
// CORRECT — connect first
await device.connect()
const data = await device.read('battery_service', 'battery_level')

// WRONG — read without connecting
const data = await device.read('battery_service', 'battery_level') // throws DEVICE_DISCONNECTED
```

### Error Handling
```typescript
// CORRECT — check error code, use suggestion
try {
  await device.read('heart_rate', 'heart_rate_measurement')
} catch (e) {
  if (e instanceof BeacioError) {
    console.error(e.code, e.suggestion) // machine-readable + actionable
  }
}

// WRONG — swallow errors
try {
  await device.read('heart_rate', 'heart_rate_measurement')
} catch (e) {
  console.log(e)
}
```

## Common tasks

### Subscribe to notifications
```typescript
const unsub = device.subscribe('heart_rate', 'heart_rate_measurement', (value) => {
  const bpm = value.getUint8(1);
  console.log('Heart rate:', bpm);
});
// Later: unsub();
```

### Async iteration over notifications
```typescript
for await (const value of device.notifications('heart_rate', 'heart_rate_measurement')) {
  console.log('BPM:', value.getUint8(1));
}
```

### Handle disconnection
```typescript
device.on('disconnected', () => {
  console.log('Device disconnected');
});
```

### Error handling
```typescript
try {
  await device.read('heart_rate', 'heart_rate_measurement');
} catch (e) {
  if (e instanceof BeacioError) {
    switch (e.code) {
      case 'DEVICE_DISCONNECTED': /* reconnect */ break;
      case 'GATT_OPERATION_FAILED': /* retry or surface */ break;
    }
  }
}
```

# Core SDK

`@beacio/core` is the main SDK package. It gives you a cross-browser BLE API and transparently enables Safari iOS support.

## Install

```bash
npm install @beacio/core
```

## Recommended Polyfill Entry

```typescript
import '@beacio/core/auto';
```

That enables `navigator.bluetooth` on Safari iOS and stays a no-op on browsers with native Web Bluetooth support.

## Explicit API

```typescript
import { beacio } from '@beacio/core';

const ble = new beacio();
const device = await ble.requestDevice({
  filters: [{ services: ['heart_rate'] }],
});

await device.connect();
const value = await device.read('heart_rate', 'heart_rate_measurement');
console.log(value.getUint8(1));
```

## Common Operations

### Scan for a device

```typescript
const device = await ble.requestDevice({
  filters: [{ services: ['heart_rate'] }],
});
```

### Connect and read

```typescript
await device.connect();
const value = await device.read('battery_service', 'battery_level');
```

### Write

```typescript
await device.write('battery_service', 'battery_level', new Uint8Array([0x01]));
```

### Subscribe to notifications

```typescript
const unsub = device.subscribe('heart_rate', 'heart_rate_measurement', (value) => {
  console.log(value.getUint8(1));
});

// later
unsub();
await device.disconnect();
```

## UUIDs

Use Bluetooth SIG names like `'heart_rate'` and `'battery_level'` whenever possible. The SDK resolves them for you.

```typescript
await device.read('heart_rate', 'heart_rate_measurement');
```

## Error Handling

```typescript
import { BeacioError } from '@beacio/core';

try {
  await device.connect();
} catch (err) {
  if (err instanceof BeacioError) {
    console.error(err.code, err.suggestion);
  }
}
```

## Safari iOS Constraints

- `requestDevice()` must be called from a user gesture
- no persistent pairing across page loads
- BLE should run in the top-level frame, not a cross-origin iframe

## More Detail

- Core package README: <https://github.com/wklm/beacio-sdk/blob/main/packages/core/README.md>
- Hosted docs: <https://beacio.com/docs#core-package>

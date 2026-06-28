<p align="center">
  <a href="https://beacio.com"><img src="https://beacio.com/img/logo.png" alt="beacio" width="84" height="84"></a>
</p>

# @beacio/testing

Mock Web Bluetooth API for testing apps built with `@beacio/*` — stateful mock devices, fake advertisements, and a notification pump. Runs in Node test environments (Jest, Vitest), no real BLE hardware or browser required.

## Install

```bash
npm install --save-dev @beacio/testing
```

## Quick start

```typescript
import {
  installMockBluetooth,
  devices,
  BLE_UUIDS,
} from '@beacio/testing';

// Replace navigator.bluetooth with a mock for the test run
const mock = installMockBluetooth();

// Register a pre-configured heart-rate device
const device = mock.addDevice(devices.heartRate('Polar H10'));

// Your app code under test
const picked = await navigator.bluetooth.requestDevice({
  filters: [{ services: [BLE_UUIDS.services.HEART_RATE] }],
});
const server = await picked.gatt.connect();

// Drive the device from the test
device.emitAdvertisement({ rssi: -42 });

// Reset state between tests
mock.reset();
```

## What's included

- `MockBluetooth` / `createMockBluetooth()` / `installMockBluetooth()` — a `navigator.bluetooth` stand-in with `requestDevice`, `getAvailability`, and device registry
- `MockBleDevice` — stateful device: connect/disconnect, advertisements, GATT tree
- `MockGATTServer`, `MockService`, `MockCharacteristic`, `MockDescriptor` — full GATT hierarchy with read/write/notify
- `BLE_UUIDS` — common Bluetooth SIG service/characteristic/descriptor UUIDs
- `devices.heartRate()`, `devices.battery()`, `devices.full()` — ready-made device factories

## Notifications

```typescript
const hr = mock.addDevice(devices.heartRate());
const char = hr.getCharacteristic(BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT);

await characteristicUnderTest.startNotifications();
char.setValue(new Uint8Array([0x00, 95])); // pushes a characteristicvaluechanged event
```

## Related packages

- [`@beacio/core`](https://www.npmjs.com/package/@beacio/core) — Web Bluetooth polyfill for Safari iOS
- [`@beacio/profiles`](https://www.npmjs.com/package/@beacio/profiles) — typed GATT profiles
- [`@beacio/detect`](https://www.npmjs.com/package/@beacio/detect) — extension detection + install banner

Docs: <https://beacio.com/docs.md>

## License

MIT

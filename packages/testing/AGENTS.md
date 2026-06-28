# @beacio/testing — Agent Instructions

## What this package does
Mock Bluetooth API for testing `@beacio/core` apps. Provides stateful fake devices,
simulated advertising, and a notification pump — no real Bluetooth hardware needed.

## Core pattern
```typescript
import { MockBluetooth, MockDevice } from '@beacio/testing';

// Replace navigator.bluetooth with mock
const mock = new MockBluetooth();
mock.install();

// Add a fake device
mock.addDevice(new MockDevice({
  name: 'HR Monitor',
  services: ['heart_rate'],
  characteristics: {
    heart_rate_measurement: { notify: true, value: new Uint8Array([0, 72]) }
  }
}));

// Your app code now sees the mock device
const ble = new beacio();
const device = await ble.requestDevice({ filters: [{ services: ['heart_rate'] }] });

// Clean up
mock.uninstall();
```

## DO
- Use `mock.install()` in test setup and `mock.uninstall()` in teardown
- Configure mock devices with realistic characteristic values
- Use with Jest, Vitest, or any test runner — no special setup needed

## DO NOT
- Do not use in production code — this is for testing only
- Do not forget to call `mock.uninstall()` — it restores the original `navigator.bluetooth`

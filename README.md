<p align="center">
  <a href="https://beacio.com"><img src="design-assets/brand/banner.svg" alt="beacio — Web Bluetooth for iPhone Safari" width="820"></a>
</p>

# beacio SDK

Web Bluetooth SDK for iOS Safari. Scan, connect, and talk to BLE devices from any web app.

## LED example

Blink a Bluetooth LED from a web page, and keep it blinking with the phone locked.
[Open the demo](https://wklm.github.io/beacio-sdk/) on an iPhone with [beacio](https://beacio.com).

This is standard [Web Bluetooth](https://developer.mozilla.org/docs/Web/API/Web_Bluetooth_API), so the same code
runs in Chrome on a desktop. beacio brings `navigator.bluetooth` to Safari on iPhone. The only beacio-specific line is
`backgroundSync.requestBackgroundConnection`.

```js
// Your device
const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC = '0000fff1-0000-1000-8000-00805f9b34fb'; // the one you write commands to
const ON = Uint8Array.of(0x01);
const OFF = Uint8Array.of(0x00);

// Connect. Call this from a tap: Safari opens the chooser only from a user gesture.
const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE] }] });
const server = await device.gatt.connect();
const service = await server.getPrimaryService(SERVICE);
const characteristic = await service.getCharacteristic(CHARACTERISTIC);

// Switch it from the page.
await characteristic.writeValue(ON);
await characteristic.writeValue(OFF);

// Or let beacio blink it, 2 s on and 2 s off, even with the phone locked.
const program = await navigator.bluetooth.backgroundSync.requestBackgroundConnection({
  deviceId: device.id,
  program: {
    deviceId: device.id,
    characteristicId: characteristic.id, // beacio's id for this characteristic
    activeWhen: 'always',
    cycle: { frames: [Array.from(ON), Array.from(OFF)], timer: { cadence: 'uniform', everyMs: 2000 } },
  },
});

// Stop. Leaving the page does not stop a program: unregister it, then switch the LED off.
await program.unregister();
await characteristic.writeValue(OFF);
```

The whole demo, a step-by-step guide and a Bluetooth LED emulator for a Mac or Linux computer are in
[`examples/led-continuity`](examples/led-continuity).

## Packages

| Package | Purpose | Size |
|---------|---------|------|
| [`@beacio/core`](packages/core) | BLE scanning, connecting, GATT read/write/subscribe | ~4KB gzip |
| [`@beacio/core/detect`](packages/core/detect) | iOS extension detection + install banner | ~2KB gzip |
| [`@beacio/core/profiles`](packages/core/src/profiles) | Typed BLE profiles (heart rate, battery, etc.) | Optional |
| [`@beacio/react`](packages/react-sdk) | React hooks (`useDevice`, `useCharacteristic`) | Optional |
| [`@beacio/mcp`](packages/mcp) | MCP server for AI coding agents + the `beacio` scaffolding CLI (`npx beacio init`) | Optional |

## Quick Start

```bash
npm install @beacio/core
```

```typescript
import { initBeacio, isIOSSafari } from '@beacio/core/detect';
import { beacio, BeacioError } from '@beacio/core';

// 1. On iOS Safari, detect the extension and prompt install if missing
if (isIOSSafari()) {
  await initBeacio({
    operatorName: 'MyApp',
    banner: { mode: 'sheet' },
    onReady: () => console.log('Extension ready'),
  });
}

// 2. Scan and connect (works on iOS Safari + Chrome + Edge)
const ble = new beacio();
const device = await ble.requestDevice({
  filters: [{ services: ['heart_rate'] }],
});

await device.connect();

// 3. Read a value
const value = await device.read('heart_rate', 'heart_rate_measurement');
console.log('Heart rate:', value.getUint8(1));

// 4. Subscribe to notifications
const unsub = device.subscribe('heart_rate', 'heart_rate_measurement', (v) => {
  console.log('Heart rate:', v.getUint8(1));
});

// 5. Clean up
unsub();
await device.disconnect();
```

For plain HTML (no bundler):

```html
<script src="https://beacio.com/beacio.js"></script>
```

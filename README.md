<p align="center">
  <a href="https://beacio.com"><img src="design-assets/brand/banner.svg" alt="beacio — Web Bluetooth for iPhone Safari" width="820"></a>
</p>

# beacio SDK

Web Bluetooth SDK for iOS Safari. Scan, connect, and talk to BLE devices from any web app.

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

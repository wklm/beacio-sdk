# iOSbeacio SDK

Web Bluetooth SDK for iOS Safari. Scan, connect, and talk to BLE devices from any web app.

## Packages

| Package | Purpose | Size |
|---------|---------|------|
| [`@beacio/core`](packages/core) | BLE scanning, connecting, GATT read/write/subscribe | ~4KB gzip |
| [`@beacio/detect`](packages/detect) | iOS extension detection + install banner | ~2KB gzip |
| [`@beacio/core/profiles`](packages/core/src/profiles) | Typed BLE profiles (heart rate, battery, etc.) | Optional |
| [`@beacio/react`](packages/react-sdk) | React hooks (`useDevice`, `useCharacteristic`) | Optional |
| [`@beacio/mcp`](packages/mcp) | MCP server for AI coding agents + the `beacio` scaffolding CLI (`npx beacio init`) | Optional |

## Quick Start

```bash
npm install @beacio/core @beacio/detect
```

```typescript
import { initBeacio, isIOSSafari } from '@beacio/detect';
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

## Error Handling

All errors are `BeacioError` instances with a typed `code` and a human-readable `suggestion`:

```typescript
try {
  const device = await ble.requestDevice({
    filters: [{ services: ['heart_rate'] }],
  });
  await device.connect();
} catch (err) {
  if (err instanceof BeacioError) {
    console.log(err.code);       // e.g. 'DEVICE_NOT_FOUND'
    console.log(err.suggestion); // 'No matching devices in range'
  }
}
```

## AI Agent Integration

MCP server for coding agents (Claude Code, Cursor, Copilot):

```
npx -y @beacio/mcp
```

Full SDK reference for LLM context: <https://beacio.com/llms-full.txt>

## Documentation

Each package has its own README with full API reference:

- [SDK wiki](https://github.com/wklm/beacio-sdk/wiki) -- curated getting-started guides, troubleshooting, and background sync usage
- [`@beacio/core` README](packages/core/README.md) -- scanning, connecting, GATT operations, error codes
- [`@beacio/core/detect` README](packages/core/detect/README.md) -- extension detection, install banners, React provider
- [`@beacio/react` README](packages/react-sdk/README.md) -- React hooks, provider setup, and UI components

## Wiki

- [Getting Started](https://github.com/wklm/beacio-sdk/wiki/Getting-Started)
- [Background Sync](https://github.com/wklm/beacio-sdk/wiki/Background-Sync)
- [Troubleshooting](https://github.com/wklm/beacio-sdk/wiki/Troubleshooting)

## License

Proprietary. See individual package licenses.

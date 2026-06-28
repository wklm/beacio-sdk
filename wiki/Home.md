# iOSbeacio SDK Wiki

Welcome to the public wiki for [`wklm/beacio-sdk`](https://github.com/wklm/beacio-sdk).

iOSbeacio is the SDK layer that makes Web Bluetooth work in Safari on iPhone while staying compatible with native Web Bluetooth in Chrome and Edge.

## Start Here

- New to the SDK: [Getting Started](Getting-Started)
- Need the core BLE API: [Core SDK](Core-SDK)
- Need iOS Safari extension detection and install prompts: [Extension Detection](Extension-Detection)
- Building a React app: [React SDK](React-SDK)
- Need background BLE alerts and monitoring: [Background Sync](Background-Sync)
- Hitting integration issues: [Troubleshooting](Troubleshooting)
- Want runnable samples: [Examples](Examples)

## Package Map

| Package | Purpose |
|---|---|
| `@beacio/core` | Core BLE SDK and Safari iOS polyfill |
| `@beacio/detect` | iOS Safari detection and install banners |
| `@beacio/react` | React hooks and UI components |
| `@beacio/profiles` | Typed device profiles for common BLE services |
| `@beacio/testing` | Mock BLE tools for tests |
| `@beacio/mcp` | MCP server for AI coding agents |

## Quick Start

```bash
npm install @beacio/core @beacio/detect
```

```typescript
import { initBeacio, isIOSSafari } from '@beacio/detect';
import { beacio } from '@beacio/core';

if (isIOSSafari()) {
  await initBeacio({
    operatorName: 'MyApp',
    banner: { mode: 'sheet' },
  });
}

const ble = new beacio();
const device = await ble.requestDevice({
  filters: [{ services: ['heart_rate'] }],
});

await device.connect();
const value = await device.read('heart_rate', 'heart_rate_measurement');
console.log(value.getUint8(1));
```

## Key Links

- Website docs: <https://beacio.com/docs>
- Install page: <https://beacio.com/install>
- Repo README: <https://github.com/wklm/beacio-sdk/blob/main/README.md>
- Core README: <https://github.com/wklm/beacio-sdk/blob/main/packages/core/README.md>
- Detect README: <https://github.com/wklm/beacio-sdk/blob/main/packages/detect/README.md>
- React README: <https://github.com/wklm/beacio-sdk/blob/main/packages/react-sdk/README.md>

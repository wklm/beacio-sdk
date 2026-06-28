# Getting Started

This page covers the shortest path to using iOSbeacio in a web app.

## Choose Your Setup

- Plain Web Bluetooth support across Safari iOS, Chrome, and Edge: install `@beacio/core`
- iOS Safari install prompts and extension detection: add `@beacio/detect`
- React hooks and components: add `@beacio/react`

## Install

```bash
npm install @beacio/core @beacio/detect
```

## Minimal iOS Safari Flow

```typescript
import { initBeacio, isIOSSafari } from '@beacio/detect';
import { beacio, BeacioError } from '@beacio/core';

if (isIOSSafari()) {
  await initBeacio({
    operatorName: 'MyApp',
    banner: { mode: 'sheet', dismissDays: 14 },
    onReady: () => console.log('Extension ready'),
    onNotInstalled: () => console.log('Prompting install'),
  });
}

const ble = new beacio();

async function connect() {
  try {
    const device = await ble.requestDevice({
      filters: [{ services: ['heart_rate'] }],
    });

    await device.connect();
    const value = await device.read('heart_rate', 'heart_rate_measurement');
    console.log('Heart rate:', value.getUint8(1));
  } catch (err) {
    if (err instanceof BeacioError) {
      console.error(err.code, err.suggestion);
    }
  }
}

document.getElementById('connect')?.addEventListener('click', connect);
```

## Critical Safari iOS Rule

`requestDevice()` must run from a direct user gesture like a click or tap handler. Do not call it from page load, `DOMContentLoaded`, `setTimeout`, or `useEffect`.

## Plain HTML Option

If you are not using a bundler, load the hosted script:

```html
<script src="https://beacio.com/beacio.js"></script>
```

## Where To Go Next

- BLE API walkthrough: [Core SDK](Core-SDK)
- Install prompts and detection: [Extension Detection](Extension-Detection)
- React apps: [React SDK](React-SDK)
- Hosted docs: <https://beacio.com/docs>

# Extension Detection

`@beacio/detect` helps your app detect the iOSbeacio Safari extension and show an install prompt when it is missing.

## Install

```bash
npm install @beacio/detect
```

## Main API

- `initBeacio(options)`
- `isIOSSafari()`
- `isExtensionInstalled()`
- `showInstallBanner(options)`
- `removeInstallBanner()`

## Typical Setup

```typescript
import { initBeacio, isIOSSafari } from '@beacio/detect';

if (isIOSSafari()) {
  await initBeacio({
    operatorName: 'FitTracker',
    banner: { mode: 'sheet', dismissDays: 14 },
    onReady: () => console.log('Extension active'),
    onNotInstalled: () => console.log('Prompting install'),
  });
}
```

## React Setup

```tsx
import { BeacioProvider } from '@beacio/detect/react';

export default function App({ children }) {
  return <BeacioProvider>{children}</BeacioProvider>;
}
```

## Plain HTML

```html
<script src="https://beacio.com/beacio.js"></script>
```

## Install UX Guidance

- Use this package only for detection and install UX
- Use `@beacio/core` for actual BLE operations
- Send users to <https://beacio.com/install> when you need a direct install page

## Important Note

This package does not polyfill BLE calls by itself. It handles extension detection and install prompts. Pair it with `@beacio/core` for real Bluetooth operations.

## More Detail

- Detect package README: <https://github.com/wklm/beacio-sdk/blob/main/packages/detect/README.md>
- Hosted docs: <https://beacio.com/docs#detect-package>

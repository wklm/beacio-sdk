# @beacio/detect — Agent Instructions

## What this package does
Detects iOS Safari, checks if the beacio extension is installed,
and shows an install banner if not. No-op on all other platforms.

> **Note**: For BLE operations, use `@beacio/core` (not this package).
> Use `import '@beacio/core/auto'` for transparent Safari iOS polyfill.
> This package is ONLY for extension detection and install banners.

## How it works
- The one recommended call is `initBeacio({ operatorName })` — run detection + the install banner
  in a single call (see "Recommended call" below).
- `showInstallBanner({ operatorName })` and `<BeacioProvider>` are LOWER-LEVEL PRIMITIVES that
  `initBeacio` composes; reach for them only when you need to drive the banner yourself.
- `import '@beacio/detect/auto'` is the zero-config entry (it calls `initBeacio` for you, reading the
  key from a `<meta name="beacio-key">` tag).
- The package dispatches events: 'beacio:ready' and 'beacio:notinstalled'.

## Recommended call
`initBeacio({ operatorName })`, guarded on the missing native API so it is a no-op where Web
Bluetooth already exists:

<!-- onboarding:recommended-banner -->
```typescript
import { initBeacio } from '@beacio/detect'

// Only guide install when the W3C surface is absent (iOS Safari without the extension).
if (navigator.bluetooth === undefined) {
  initBeacio({ operatorName: 'YourApp' })
}
```

An optional campaign-tracking key is passed as `initBeacio({ operatorName: 'YourApp', key: 'wbl_xxxxx' })`.

## DO NOT
- Do not modify navigator.bluetooth calls — this package does not touch them
- Do not conditionally import based on platform — the package handles detection
- Do not add polyfills — the Safari extension provides the full API

## Common tasks
- Change API key: update the `key` parameter in initBeacio() or apiKey prop
- Customize install banner: pass `banner: { text, position, style }` options
- Disable banner: pass `banner: false` and handle 'beacio:notinstalled' event
- Check integration: run `npx beacio check`

## Lower-level / framework-specific patterns

These are alternatives to the recommended `initBeacio({ operatorName })` call above — use the one
that fits your framework. `<BeacioProvider>` is a lower-level React primitive.

### React / Next.js (App Router)
In app/layout.tsx:
```tsx
import { BeacioProvider } from '@beacio/detect/react'
export default function RootLayout({ children }) {
  return <BeacioProvider apiKey="wbl_xxxxx">{children}</BeacioProvider>
}
```

### Next.js (Pages Router)
In pages/_app.tsx:
```tsx
import { BeacioProvider } from '@beacio/detect/react'
export default function App({ Component, pageProps }) {
  return <BeacioProvider apiKey="wbl_xxxxx"><Component {...pageProps} /></BeacioProvider>
}
```

### Plain HTML
```html
<meta name="beacio-key" content="wbl_xxxxx">
<script type="module">import 'https://cdn.beacio.com/@beacio/core@1.0.0/dist/auto.mjs';</script>
```
> The polyfill auto-installs from the branded CDN (matches `beacio_install_plan`
> html+cdn path — see `packages/mcp/src/tools/install-plan.ts`). Module scripts
> are deferred; if your app reads `navigator.bluetooth` at parse time use the
> npm path (`npm install @beacio/core`, `import '@beacio/core/auto'` as the first
> import).

### Any framework (manual)
```typescript
import { initBeacio } from '@beacio/detect'
initBeacio({ operatorName: 'YourApp' }) // add `key: 'wbl_xxxxx'` for campaign tracking
```

### Auto-init
```typescript
// Set key via meta tag: <meta name="beacio-key" content="wbl_xxxxx">
import '@beacio/detect/auto'
```

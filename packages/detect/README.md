<p align="center">
  <a href="https://beacio.com"><img src="https://beacio.com/img/logo.png" alt="beacio" width="84" height="84"></a>
</p>

# @beacio/detect

Detect the beacio Safari Web Extension on iOS and guide users through install — extension state checks, an install banner, and a React provider.

Requires iOS 26.0+ Safari with the [beacio app](https://apps.apple.com/app/id6761301368) for the extension path. On browsers with native Web Bluetooth (Chrome, Edge) detection is a no-op.

## Install

```bash
npm install @beacio/detect
```

## Zero-config auto mode

Import once in your browser entry file. It detects the extension and, when missing on iOS Safari, shows a guided install prompt:

```typescript
import '@beacio/detect/auto';
```

The auto entry reads an optional API key from `<meta name="beacio-key" content="wbl_xxxxx">` or `window.__BEACIO_KEY__`.

## Manual detection

```typescript
import {
  getExtensionInstallState,
  isExtensionInstalled,
  isIOSSafari,
} from '@beacio/detect';

if (isIOSSafari()) {
  const state = await getExtensionInstallState();
  // 'not-installed' | 'installed-inactive' | 'active'

  if (state !== 'active') {
    // show your own UI, or use showInstallBanner() below
  }
}
```

## Recommended: full init

`initBeacio({ operatorName })` is the one recommended call — it runs detection, dispatches the
state events, and (unless disabled) shows the install banner, all gated to iOS Safari. Call it once
in your browser entry, guarded on the missing native API so it is a no-op where Web Bluetooth is
already present:

<!-- onboarding:recommended-banner -->
```typescript
import { initBeacio } from '@beacio/detect';

// Only guide install when the W3C surface is absent (iOS Safari without the extension).
if (navigator.bluetooth === undefined) {
  await initBeacio({
    operatorName: 'FitTracker', // your app name shown in the prompt
    banner: { mode: 'sheet' },  // or false to disable
    onReady: () => console.log('extension active'),
    onInstalledInactive: () => console.log('installed, needs Safari activation'),
    onNotInstalled: () => console.log('not installed'),
  });
}
```

State changes also dispatch a `beacio:statechange` `CustomEvent` on `window`.

## Lower-level primitives

The calls below are the building blocks `initBeacio` is composed from. Reach for them only when you
need to drive the banner yourself; most apps should use `initBeacio({ operatorName })` above.

### `showInstallBanner` (lower-level primitive)

```typescript
import { showInstallBanner, removeInstallBanner } from '@beacio/detect';

showInstallBanner({
  mode: 'sheet',              // 'sheet' (iOS bottom sheet, default) or 'banner'
  operatorName: 'FitTracker', // your app name shown in the prompt
  dismissDays: 14,            // suppress after dismiss
});
```

The banner's default CTA opens the guided setup flow at `https://beacio.com/setup` (install → enable the Safari extension → return to your page). Override with `startOnboardingUrl` or `appStoreUrl`.

### Headless onboarding (bring-your-own-UI, zero beacio chrome)

For partners (e.g. a vanilla-JS + jQuery app) that render their own 100%-on-brand "Enable Bluetooth in Safari" card and want **no beacio pixels**. These primitives inject no DOM — you draw the UI, they supply state, the return link, dismissal capping, and the App Store destination. This is the **tier-3** rung of the [embedding ladder](https://beacio.com/docs-md/white-label.md).

<!-- SB-SDK-12:headless-readme:start -->
<!-- onboarding:headless-vanilla -->
```js
// Classic <script> build — no bundler, no framework. The package root exposes the
// headless API; none of these calls add beacio chrome to the page.
import {
  getInstallState,      // 'not-installed' | 'installed-inactive' | 'active' (sync)
  observeInstallState,  // resolves 'active' when the extension's EXTENSION_READY fires
  saveReturnContext,    // persist + copy the link.beacio.com/return?url=… deep link
  getReturnContext,     // { url, returnLink } to render your own "Return here" button
  isDismissed,          // true while a prior dismissal is still inside its window
  dismiss,              // suppress your card for N days (default 14)
  APP_STORE_URL,        // https://apps.apple.com/app/id6761301368 (id form; never a name slug)
} from '@beacio/detect';

// Only prompt on iOS Safari without the W3C surface, and not if recently dismissed.
if (navigator.bluetooth === undefined && getInstallState() !== 'active' && !isDismissed()) {
  saveReturnContext(); // so the user can hop back after enabling in Settings
  const { returnLink } = getReturnContext();

  // ——— your own markup, your own brand ———
  myRenderEnableCard({
    installUrl: APP_STORE_URL,        // your "Get the app" button
    returnUrl: returnLink,            // your "Return here" button
    onDismiss: () => dismiss(14),     // your "Not now" button
  });

  // Tear the card down the moment the extension goes active — no manual reload.
  observeInstallState().then((state) => {
    if (state === 'active') myRemoveEnableCard();
  });
}
```
<!-- SB-SDK-12:headless-readme:end -->

Detection is the **same** logic the React `InstallationWizard` and the built-in banner use, so a partner card and the beacio banner can never disagree about install state.

### Private Browsing & per-site "Deny" recovery (best-effort)

<!-- SB-SDK-17:private-browsing-readme:start -->
Two iOS-Safari states make an installed, enabled extension look like it is *not installed* to
detection (the content script sets no markers), so `initBeacio()` would otherwise show the generic
"install the app" sheet to a user who has nothing to install. `initBeacio()` instead routes each to
a distinct recovery banner:

- **Private Browsing** — iOS Safari disables web extensions in Private Browsing (no per-extension
  opt-in), so beacio is inert even when installed. The banner shows a distinct hint —
  *"Private Browsing disables Safari extensions — open this page in a normal tab"* — instead of the
  install sheet.
- **Per-origin "Deny"** — if "Allow Every Website" was denied on this site, the extension is inert
  here even though it is installed and enabled. When `navigator.bluetooth` is defined but
  `getAvailability()` returns `false`, the banner surfaces the *aA → Manage Extensions → Allow Every
  Website* guidance (the same `denied` copy block as the installed-but-blocked path) instead of the
  install sheet.

Both are **best-effort heuristics**: iOS exposes no reliable Private-Browsing API (the Private
Browsing signal is a `localStorage` write-probe that throws under a zero quota), and the per-origin
check is a `getAvailability()` probe. They can occasionally miss or over-fire, so they are
deliberately conservative — when neither fires, `initBeacio()` falls back to the generic install
guidance unchanged. Both are no-ops off iOS Safari (gated behind `isIOSSafari()`).
<!-- SB-SDK-17:private-browsing-readme:end -->

### `BeacioProvider` (React, lower-level primitive)

```tsx
import { BeacioProvider, useBeacio } from '@beacio/detect/react';

export default function Layout({ children }) {
  return <BeacioProvider>{children}</BeacioProvider>;
}

function Status() {
  const { state } = useBeacio();
  return <span>{state}</span>;
}
```

## Related packages

- [`@beacio/core`](https://www.npmjs.com/package/@beacio/core) — the `navigator.bluetooth` polyfill itself
- [`@beacio/profiles`](https://www.npmjs.com/package/@beacio/profiles) — typed GATT profiles (heart rate, battery, …)
- [`@beacio/testing`](https://www.npmjs.com/package/@beacio/testing) — mock Bluetooth API for tests

Docs: <https://beacio.com/docs.md> · Setup guide: <https://beacio.com/setup>

## License

MIT

/**
 * Build-internal MINIMAL core surface for the classic auto IIFE
 * (tsup.browser-auto.config.ts), NOT a published package export.
 *
 * SB-SDK-02 bundles `@beacio/detect` into the single self-contained
 * `browser-auto.global.js`, and the bundled detect reaches core only through a
 * lazy `await import('@beacio/core')`. That dynamic import is aliased into THIS
 * bundle; pointing the alias at the full `src/index.ts` barrel used to drag the
 * ENTIRE BLE wrapper machinery (device / notification-manager / beacio /
 * write-chunker / dataview-helpers / errors) into the IIFE — none of which a
 * vanilla `<script>` polyfill drop-in ever executes (it consumes the bare
 * `navigator.bluetooth` global, never a Beacio wrapper instance).
 *
 * detect's ONLY uses of that lazy `import('@beacio/core')` are:
 *   - getExtensionInstallState() → detectPlatform()  (detect.ts)
 *   - the fully-erased `typeof import('@beacio/core').SETUP_URL` pin (banner.ts)
 *   - the `import type { BeacioEventName }` pins (index.ts / install-state.ts),
 *     which are erased at build time and need no runtime value.
 *
 * So this entry re-exports EXACTLY that runtime surface plus the small set of
 * platform/event/url symbols those modules reference, and nothing that reaches
 * the BLE wrapper graph. The published `@beacio/core` (src/index.ts) is
 * unchanged and still exports the full API; this file only changes HOW the
 * classic auto bundle resolves its internal lazy core import, dropping dead
 * machinery a script-tag drop-in never calls (no feature is removed — every
 * core API remains available to real `import '@beacio/core'` consumers).
 */
export { detectPlatform, getBluetoothAPI, CDN_STUB_MARKER } from './platform';
export { BEACIO_EVENTS } from './events';
export type { BeacioEventName } from './events';
export { SETUP_URL } from './urls';

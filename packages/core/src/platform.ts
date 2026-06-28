import type { Platform } from './types';

/**
 * The own-property key our "unsupported" stub stamps on its faux
 * `navigator.bluetooth` (see auto.ts `createUnsupportedBluetoothStub`) so the
 * detectors below never mistake that stub for a real native implementation.
 *
 * Single-sourced here and consumed by every reader ({@link detectPlatform},
 * {@link getBluetoothAPI}, and browser-auto's banner gate) and by the writer in
 * auto.ts, so the native-vs-stub discriminator cannot silently drift apart. Pinned
 * by `tests/cdn-stub-marker.test.ts` (SB-TST-35).
 */
export const CDN_STUB_MARKER = '__beacioCDNStub';

/**
 * Detect the current Web Bluetooth platform by probing `navigator`.
 *
 * **Detection order:**
 * 1. Safari extension -- `navigator.beacio?.__beacio === true`
 * 2. Native Web Bluetooth -- `navigator.bluetooth` exists (excluding CDN stubs)
 * 3. Unsupported -- No Web Bluetooth capability
 *
 * @returns The detected {@link Platform} value.
 *
 * @see {@link getBluetoothAPI} for getting the actual API object
 */
export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unsupported';

  // Safari extension: navigator.beacio with sentinel
  const nav = navigator as any;
  if (nav.beacio?.__beacio === true) return 'safari-extension';

  // Native Web Bluetooth (Chrome, Edge, etc.) — exclude CDN stubs
  if (nav.bluetooth && !nav.bluetooth[CDN_STUB_MARKER]) return 'native';

  return 'unsupported';
}

/**
 * Get the `Bluetooth` API object for the current platform.
 *
 * Returns `navigator.beacio` for the Safari extension, `navigator.bluetooth` for
 * native Web Bluetooth, or `null` if unsupported. CDN stubs (from `@beacio/detect`)
 * are excluded.
 *
 * @returns The platform's `Bluetooth` API object, or `null` if unavailable.
 *
 * @see {@link detectPlatform} for identifying the platform without getting the API
 */
export function getBluetoothAPI(): Bluetooth | null {
  if (typeof navigator === 'undefined') return null;

  const nav = navigator as any;

  // Safari extension provides full API on navigator.beacio
  if (nav.beacio?.__beacio === true) return nav.beacio as Bluetooth;

  // Native Web Bluetooth
  if (nav.bluetooth && !nav.bluetooth[CDN_STUB_MARKER]) return nav.bluetooth;

  return null;
}

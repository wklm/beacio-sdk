/**
 * @beacio/core/browser-auto — the ONE consolidated CLASSIC browser bundle.
 *
 * SB-SDK-02: a vanilla script-tag site (e.g. app.storz-bickel.com) needs a
 * single non-module `<script src=...>` that, with NO other JS edits:
 *   1. patches navigator.bluetooth SYNCHRONOUSLY on load — before the site's
 *      parse-time `if (navigator.bluetooth)` gate runs (a deferred
 *      `<script type="module">` is structurally too late), and no-ops when a
 *      working navigator.bluetooth already exists (Chrome/Android untouched);
 *   2. exposes window.beacioDetect.{showInstallBanner,initBeacio,…} — the
 *      published @beacio/detect dist sets NO global, which is exactly why the
 *      demo previously had to hand-patch a vendored file; and
 *   3. on DOMContentLoaded auto-shows the install banner ONLY when
 *      navigator.bluetooth is absent, honoring a `data-operator-name` attribute
 *      on the loading <script>.
 *
 * Built as an IIFE with globalName `beacioDetect`, so this module's exports BECOME
 * window.beacioDetect, while the two side effects below (polyfill install +
 * DOMContentLoaded banner) run as the script loads. `@beacio/detect` is BUNDLED
 * into this artifact (it is `noExternal` in tsup.browser-auto.config.ts) — safe
 * only because SB-SDK-02 Part B removed detect's static `@beacio/core` imports, so
 * detect now reaches core solely via a lazy `await import()` (no build cycle).
 */

// (1) Synchronously install the W3C navigator.bluetooth polyfill (no-op on
// native/unsupported). We import and CALL applyPolyfill() explicitly rather than
// relying on a bare `import './auto'` side effect: the package's `sideEffects`
// allowlist marks only ./dist/auto.* side-effectful, so esbuild would tree-shake
// a bare import (and the module's own bottom-of-file applyPolyfill() call) out of
// this bundle, silently dropping the polyfill. applyPolyfill is idempotent, so a
// double-install via auto.ts's own load-time call never double-registers.
import { applyPolyfill } from './auto';
import { CDN_STUB_MARKER } from './platform';

applyPolyfill();

// (2) The public detect surface. Re-exported so the IIFE's globalName attaches
// them to window.beacioDetect; also used by the auto-banner side effect below.
// SB-SDK-05: presentError joins this surface so a vanilla site can call
// beacioDetect.presentError(error) from its connect-catch / generateErrorMsg with
// NO module setup — exactly like showInstallBanner.
import { initBeacio, showInstallBanner, removeInstallBanner, presentError } from './detect';

export { initBeacio, showInstallBanner, removeInstallBanner, presentError };

/**
 * Read `data-operator-name` from the loading <script> (the app/brand name shown
 * in the prompt, e.g. "STORZ & BICKEL"). Falls back to document.title so the
 * banner is never anonymous. document.currentScript is the executing classic
 * script during initial evaluation.
 */
function operatorNameFromScript(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const el = document.currentScript as HTMLScriptElement | null;
  const fromAttr =
    el?.dataset?.operatorName ?? el?.getAttribute?.('data-operator-name') ?? undefined;
  return fromAttr || document.title || undefined;
}

// Captured at load time: document.currentScript is only the loading <script>
// during synchronous evaluation, not later inside the DOMContentLoaded handler.
const OPERATOR_NAME = operatorNameFromScript();

/**
 * (3) Auto-show the install banner once the DOM is ready, but ONLY when there is
 * no working navigator.bluetooth (iOS Safari without the extension, or an
 * unsupported browser). On Chrome/Android navigator.bluetooth is native, and on
 * iOS with the extension the polyfill above has already installed it — both
 * skip the banner. initBeacio() itself further no-ops off iOS Safari, so this is
 * doubly safe; the explicit guard keeps the banner from ever flashing where
 * Bluetooth already works.
 */
function autoShowBannerWhenUnsupported(): void {
  if (typeof navigator !== 'undefined' && (navigator as Navigator).bluetooth) {
    const bt = (navigator as Navigator & { bluetooth?: { [key: string]: string | number | boolean | object | null | undefined } }).bluetooth;
    // A real (native or extension-backed) API → Bluetooth works, no banner.
    // Our own "unsupported" stub carries CDN_STUB_MARKER; treat that as absent.
    if (bt && !bt[CDN_STUB_MARKER]) return;
  }
  void initBeacio({ operatorName: OPERATOR_NAME });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoShowBannerWhenUnsupported, { once: true });
  } else {
    autoShowBannerWhenUnsupported();
  }
}

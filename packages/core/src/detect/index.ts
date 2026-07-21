/**
 * @beacio/detect
 *
 * Detects iOS Safari, checks if the Beacio extension is installed,
 * and shows an install banner if not. No-op on all other platforms.
 *
 * Your existing Web Bluetooth code works unchanged — this package only
 * handles the "extension not installed" case on iOS Safari.
 */

export { getExtensionInstallState, isExtensionInstalled, isIOSSafari } from './detect';
export type { ExtensionInstallState } from './detect';
export { showInstallBanner, removeInstallBanner, SETUP_STEPS } from './banner';
export type { BannerOptions, BannerState, SetupStep } from './banner';
// SB-SDK-12: the framework-agnostic, ZERO-DOM headless onboarding API for
// vanilla-JS partners (Storz & Bickel's app is vanilla JS + jQuery and cannot use
// the React wizard; showInstallBanner injects beacio chrome). A partner draws its
// OWN "Enable Bluetooth in Safari" card and drives it with these primitives —
// install-state detection (SHARED with detect.ts + the react-sdk
// ExtensionDetector), the EXTENSION_READY-aware observer, the return-link/clipboard
// context helper, the dismissal frequency-cap, and the id-form App Store URL. None
// of these inject DOM.
// SB-PRD-08: the soft/hard dismissal split is part of the headless API too. A
// vanilla-JS partner drawing its OWN onboarding card needs the soft "Not now"
// primitive (dismissShort, a short 1-day suppression) — not just the long
// `dismiss` — plus the documented window lengths, so it can mirror the banner's
// soft/hard behaviour without hand-writing the internal localStorage key.
export {
  APP_STORE_URL,
  DEFAULT_DISMISS_DAYS,
  dismiss,
  dismissShort,
  getInstallState,
  getReturnContext,
  isDismissed,
  isExtensionActive,
  observeInstallState,
  saveReturnContext,
  SHORT_DISMISS_DAYS,
} from './install-state';
// SB-SDK-05: the branded, framework-free error presenter — the FAILURE-path
// sibling of showInstallBanner. Re-exported from the package root (and from
// core/browser-auto) so a classic <script> site can call
// beacioDetect.presentError(error) with no module setup.
export { presentError } from './error-presenter';
export type { PresentErrorOptions, PresentErrorStrings, BeacioErrorCode } from './error-presenter';
// SB-SDK-07: the shared localized-string seam (built-in en/de packs + the pure
// resolver) that both showInstallBanner and presentError consume. Exported so a
// consumer can inspect/extend the packs or pre-resolve copy. The BeacioErrorCode
// type is already exported above (the identical local union), so it is NOT
// re-exported here to avoid an ambiguous re-export.
export { DE_STRINGS, EN_STRINGS, resolveStrings } from './i18n';
export type {
  DeepPartial,
  ErrorCopy,
  ErrorStrings,
  LocaleStrings,
  ResolveStringsOptions,
  SetupStepCopy,
  StateCopy,
} from './i18n';
export { reportEvent, validateApiKey } from './api';
import { reportEvent } from './api';
import type { ExtensionInstallState } from './detect';
// detect now lives INSIDE @beacio/core, so the canonical event-name map is an
// intra-package import from core's events module — the single source of truth
// (events.test.ts remains the seam-crossing control that the wire literals match).
import { BEACIO_EVENTS } from '../events';
// SBOPT-P2.4 (tier-3 headless): the id-form App Store URL + the pure return-link
// builder come from the shared zero-DOM install-state module (both are also part
// of the SB-SDK-12 headless surface); SETUP_URL is core's canonical /setup page.
// buildOnboardingUrl (banner.ts) is imported LAZILY inside resolveOnboardingState —
// like initBeacio's own `await import('./banner')` — so a pure-headless consumer
// that only imports resolveOnboardingState never pulls the banner DOM code.
import { APP_STORE_URL, buildReturnLink } from './install-state';
import { SETUP_URL } from '../urls';
export interface BeacioOptions {
  /** Optional API key for campaign tracking */
  key?: string;
  /** Operator/app name shown in the prompt (e.g. "FitTracker") */
  operatorName?: string;
  /**
   * SB-SDK-07: BCP-47 UI language (e.g. 'de') for the install banner. Threaded
   * to showInstallBanner so the zero-config initBeacio path is localizable;
   * omitted ⇒ the banner derives the language from navigator.language, else
   * English. A `banner.lang` (below) overrides this for the banner specifically.
   */
  lang?: string;
  /** Install banner configuration, or false to disable */
  banner?:
    | {
        /** 'sheet' (default) for iOS bottom sheet, 'banner' for lightweight bar */
        mode?: 'sheet' | 'banner';
        position?: 'top' | 'bottom';
        text?: string;
        buttonText?: string;
        style?: Record<string, string>;
        startOnboardingUrl?: string;
        appStoreUrl?: string;
        /** Days to suppress after the explicit "Don't show again" opt-out (default: 14) */
        dismissDays?: number;
        /**
         * SB-PRD-08 (AC3): ignore the dismissal cooldown and show anyway. Set this
         * on a user-initiated recovery call (e.g. re-invoking initBeacio from a
         * Connect / "Can't connect?" gesture) so a previously-dismissed user can
         * re-open setup without clearing localStorage.
         */
        forceShow?: boolean;
        /** SB-SDK-07: BCP-47 language override for the banner (wins over the top-level `lang`). */
        lang?: string;
        /** SB-SDK-11 (tier-2 co-brand): partner accent colour for the prompt chrome. */
        accentColor?: string;
        /** SB-SDK-11: partner logo URL (http(s) only; validated). Replaces the beacio glyph. */
        brandLogoUrl?: string;
        /** SB-SDK-11: the connected device's display name (e.g. "VOLCANO HYBRID"). */
        deviceName?: string;
        /** SB-SDK-11: one-shot lead body copy override (HTML-escaped). */
        body?: string;
        /** SB-SDK-11: privacy reassurance body override (HTML-escaped). */
        privacyBody?: string;
      }
    | false;
  /** Called when the extension is detected and ready */
  onReady?: () => void;
  /** Called when the extension is installed but Safari still needs activation/allow access */
  onInstalledInactive?: () => void;
  /** Called when the extension is NOT installed */
  onNotInstalled?: () => void;
}

function dispatchInstallState(state: ExtensionInstallState): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(BEACIO_EVENTS.STATE_CHANGE, {
    detail: { state }
  }));
}

/**
 * Show the install banner unless explicitly disabled.
 * No-op when `options.banner === false`.
 */
async function maybeShowBanner(
  options: BeacioOptions,
  state: ExtensionInstallState,
  // SB-SDK-03 AC2: lets the caller pass the per-site 'denied' refinement, which the
  // ExtensionInstallState markers cannot express (it has no 'denied' member).
  bannerStateOverride?: import('./banner').BannerState
): Promise<void> {
  if (options.banner === false) return;
  const { showInstallBanner } = await import('./banner');
  const bannerConfig = typeof options.banner === 'object' ? options.banner : {};
  const bannerOpts: import('./banner').BannerOptions = {
    // SB-SDK-11: the co-brand theme (accentColor / brandLogoUrl / deviceName /
    // body / privacyBody) rides through on this spread of bannerConfig into
    // BannerOptions, so the zero-config initBeacio path is fully themeable.
    ...bannerConfig,
    apiKey: options.key ?? '',
    operatorName: options.operatorName,
    // SB-SDK-07: thread the UI language so the zero-config initBeacio path is
    // localizable; banner.lang wins over the top-level lang, and an omitted lang
    // lets the banner derive from navigator.language (else English).
    lang: bannerConfig.lang ?? options.lang,
    // SB-PRD-03: feed the funnel position so the sheet shows the SPECIFIC remaining
    // step (or, on 'active', the once-only success toast) instead of restarting setup.
    state: bannerStateOverride ?? state,
  };
  showInstallBanner(bannerOpts);
}

/**
 * SB-SDK-03 AC2: the extension is installed + enabled, but is THIS origin granted
 * access? Safari's per-origin "Allow Every Website" is irreducibly manual
 * (project_ios26_safari_extension_settings_readonly). The W3C-conformant probe is
 * `navigator.bluetooth.getAvailability()`: a defined `navigator.bluetooth` that
 * reports unavailable means the polyfill is present but blocked HERE — the
 * per-site 'denied' state. Any throw / undefined surface is treated as NOT denied
 * so a genuinely-active origin never gets downgraded to the guidance sheet.
 */
async function isOriginDenied(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const bt = (navigator as Navigator & { bluetooth?: { getAvailability?: () => Promise<boolean> } })
    .bluetooth;
  if (!bt || typeof bt.getAvailability !== 'function') return false;
  try {
    return (await bt.getAvailability()) === false;
  } catch {
    return false;
  }
}

/**
 * SB-SDK-17: BEST-EFFORT Private Browsing detection. iOS Safari disables web
 * extensions in Private Browsing (no per-extension opt-in), so beacio is inert and
 * the content script sets no markers — getExtensionInstallState() resolves
 * 'not-installed' and the user wrongly gets the "install the app" sheet even though
 * the app may already be installed. The recovery is to reopen the page in a normal
 * tab, so this routes to the dedicated 'private-browsing' hint instead.
 *
 * iOS exposes NO reliable Private-Browsing API, so this is a HEURISTIC, not a
 * guarantee: historically iOS Safari Private mode gives localStorage a zero quota,
 * so a setItem write-probe throws (QuotaExceededError). We write-and-immediately-
 * remove a throwaway key; a throw is read as "extensions are likely unavailable".
 * It is deliberately conservative — ANY success (or an unexpected error shape) is
 * treated as NOT private browsing, so a normal tab is never downgraded to the hint.
 * Callers MUST gate this behind isIOSSafari() (the probe is meaningless elsewhere
 * and the false-positive risk is higher on other engines).
 */
function isPrivateBrowsingBestEffort(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const storage = window.localStorage;
    if (!storage) return false;
    const probeKey = '__beacio_pb_probe__';
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return false;
  } catch {
    // A write-probe throw (e.g. QuotaExceededError) is the classic iOS Private
    // Browsing signature. Best-effort only — see the JSDoc above.
    return true;
  }
}

/**
 * Initialize Beacio detection.
 *
 * On iOS Safari: checks if the extension is installed, dispatches events,
 * and optionally shows an install banner.
 *
 * On all other platforms: no-op (returns immediately).
 */
export async function initBeacio(options: BeacioOptions): Promise<void> {
  const { getExtensionInstallState, isIOSSafari } = await import('./detect');

  if (!isIOSSafari()) return;

  const installState = await getExtensionInstallState();
  dispatchInstallState(installState);

  if (installState === 'active') {
    // SB-SDK-03 AC2: the extension is enabled, but this ORIGIN may still be
    // blocked ("Allow Every Website" not granted here) — the one funnel position
    // the install-state markers cannot distinguish. The W3C signal is
    // navigator.bluetooth being DEFINED while getAvailability() resolves false
    // (project_ios26_safari_extension_settings_readonly: per-origin grant is
    // irreducibly manual). Derive the 'denied' refinement so the banner shows the
    // aA → Manage Extensions → Allow Every Website guidance, not the success path.
    if (await isOriginDenied()) {
      reportEvent(options.key ?? '', 'extension_installed_inactive');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(BEACIO_EVENTS.INSTALLED_INACTIVE));
      }
      options.onInstalledInactive?.();
      await maybeShowBanner(options, installState, 'denied');
      return;
    }

    reportEvent(options.key ?? '', 'extension_active');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(BEACIO_EVENTS.READY));
    }
    options.onReady?.();
    // SB-PRD-03 AC5: on the active transition, surface the once-only "beacio is
    // ready — tap Connect" toast (showReadyToast self-suppresses for returning
    // users), replacing the old silent empty state.
    await maybeShowBanner(options, installState);
    return;
  }

  // SB-SDK-17: two iOS-Safari dead ends both look like a marker-less
  // 'not-installed'/'installed-inactive' to getExtensionInstallState(), so without
  // this block initBeacio would fall through to the misleading "install the app"
  // sheet even though the app may already be installed. We reach here only for the
  // non-active states and only on iOS Safari (the isIOSSafari() guard above already
  // returned for every other platform — AC3: neither heuristic runs off-iOS, and the
  // Private-Browsing write-probe is never even invoked there). Both heuristics are
  // BEST-EFFORT (see isPrivateBrowsingBestEffort / isOriginDenied JSDoc); when
  // neither fires we fall through to today's generic guidance unchanged.

  // 1) Private Browsing wins: extensions are globally inert (markers suppressed),
  //    so per-origin signals are unreliable and the real recovery is a normal tab.
  if (isPrivateBrowsingBestEffort()) {
    reportEvent(options.key ?? '', 'detect');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(BEACIO_EVENTS.NOT_INSTALLED));
    }
    options.onNotInstalled?.();
    await maybeShowBanner(options, installState, 'private-browsing');
    return;
  }

  // 2) Marker-suppressed per-origin "Deny": no markers, yet navigator.bluetooth is
  //    defined and reports unavailable HERE → a prior "Deny" left the extension
  //    inert on this origin. Surface the SB-SDK-03 'denied' guidance (aA → Manage
  //    Extensions → Allow Every Website), the same copy block the active branch uses.
  if (await isOriginDenied()) {
    reportEvent(options.key ?? '', 'extension_installed_inactive');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(BEACIO_EVENTS.INSTALLED_INACTIVE));
    }
    options.onInstalledInactive?.();
    await maybeShowBanner(options, installState, 'denied');
    return;
  }

  if (installState === 'installed-inactive') {
    reportEvent(options.key ?? '', 'extension_installed_inactive');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(BEACIO_EVENTS.INSTALLED_INACTIVE));
    }
    options.onInstalledInactive?.();

    await maybeShowBanner(options, installState);
    return;
  }

  // Extension NOT installed
  reportEvent(options.key ?? '', 'detect');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BEACIO_EVENTS.NOT_INSTALLED));
  }
  options.onNotInstalled?.();

  // Show install banner unless explicitly disabled
  await maybeShowBanner(options, installState);
  if (options.banner !== false) {
    reportEvent(options.key ?? '', 'install_prompted');
  }
}

// ─── SBOPT-P2.4: the tier-3 HEADLESS onboarding funnel state ─────────────────
//
// initBeacio (above) welds the funnel classification to a banner render: every
// routing branch reports an event, dispatches a DOM CustomEvent, and calls
// maybeShowBanner. A tier-3 partner (Storz & Bickel) draws its OWN install prompt
// and needs that classification with NONE of those side effects. resolveOnboarding-
// State is the pure, zero-DOM projection of initBeacio's routing OUTCOMES — one
// tagged-union variant per `return` — so the partner renders its own card from the
// state instead of beacio chrome.

/**
 * Where a first-run owner is in the irreducibly-manual iOS-26 setup funnel, as
 * DATA a partner renders itself. The union is CLOSED to exactly initBeacio's six
 * routing outcomes (a discriminated union + exhaustive switch, not scattered
 * undefined checks):
 *  - 'unsupported'        → not iOS Safari; Web Bluetooth via beacio is unavailable.
 *  - 'not-installed'      → app not installed; `installUrl` is the id-form App Store link.
 *  - 'installed-inactive' → installed but the Safari extension toggle is off; `setupUrl` guides.
 *  - 'denied'             → enabled, but per-origin access not granted on THIS site; `setupUrl` guides.
 *  - 'private-browsing'   → Private Browsing disables extensions; the fix is a normal tab.
 *  - 'ready'              → the polyfill is live and this origin is granted; nothing to prompt.
 *
 * Required fields, sentinels over optionals (owner's API rule): each variant
 * carries only the render-ready URLs its OWN prompt needs, all required — no `?`.
 * `returnLink` is the tappable "return to your page" affordance
 * (`https://link.beacio.com/return?url=…`) computed purely, with no side effect.
 */
export type OnboardingState =
  | { kind: 'unsupported' }
  | { kind: 'not-installed'; installUrl: string; returnLink: string }
  | { kind: 'installed-inactive'; setupUrl: string; returnLink: string }
  | { kind: 'denied'; setupUrl: string; returnLink: string }
  | { kind: 'private-browsing'; returnLink: string }
  | { kind: 'ready' };

/**
 * The REQUIRED config for {@link resolveOnboardingState} — no optional args.
 * `apiKey` threads the App Store campaign token (ct/mt) onto the install deep link
 * exactly as the banner's install button does; `operatorName` threads the operator
 * identity onto the guided /setup deep link so it can render "Return to <operator>".
 * Pass empty-string sentinels when a field is not in play.
 */
export interface OnboardingConfig {
  operatorName: string;
  apiKey: string;
}

/**
 * The guided /setup deep link carrying the operator identity + return origin, so
 * /setup renders the branded return CTA instead of generic copy. Built with
 * encodeURIComponent (not URLSearchParams) so the operator name round-trips in the
 * `%20` percent form the /setup page and the partner's rendered link both expect.
 */
function buildSetupDeepLink(config: OnboardingConfig): string {
  const returnUrl = typeof window !== 'undefined' ? window.location.href : '';
  return `${SETUP_URL}?operatorName=${encodeURIComponent(config.operatorName)}&return=${encodeURIComponent(returnUrl)}`;
}

/**
 * Resolve the current tier-3 onboarding funnel position WITHOUT rendering any
 * beacio chrome. This is the headless projection of initBeacio's routing: the same
 * isIOSSafari early-return, the same active → (denied?) → ready split, and the same
 * "Private Browsing wins over a marker-suppressed denied" precedence for the
 * non-active states — but it returns the position as data for a partner to render,
 * dispatching NO events and injecting NO DOM.
 */
export async function resolveOnboardingState(config: OnboardingConfig): Promise<OnboardingState> {
  const { getExtensionInstallState, isIOSSafari } = await import('./detect');

  if (!isIOSSafari()) return { kind: 'unsupported' };

  const returnLink = buildReturnLink();
  const setupUrl = buildSetupDeepLink(config);
  const installState = await getExtensionInstallState();

  if (installState === 'active') {
    // Enabled globally, but is THIS origin granted? getAvailability()===false is
    // the per-origin block — initBeacio's active-branch 'denied' refinement.
    if (await isOriginDenied()) return { kind: 'denied', setupUrl, returnLink };
    return { kind: 'ready' };
  }

  // Non-active on iOS Safari — mirror initBeacio's precedence exactly:
  // 1) Private Browsing wins (extensions are globally inert; per-origin signals unreliable).
  if (isPrivateBrowsingBestEffort()) return { kind: 'private-browsing', returnLink };
  // 2) Marker-suppressed per-origin Deny (no markers, yet getAvailability()===false here).
  if (await isOriginDenied()) return { kind: 'denied', setupUrl, returnLink };
  // 3) Installed but the Safari extension toggle is off.
  if (installState === 'installed-inactive') return { kind: 'installed-inactive', setupUrl, returnLink };

  // 4) App not installed — the id-form App Store deep link (banner.ts's own builder,
  //    imported lazily so a pure-headless consumer never pulls the banner DOM code).
  const { buildOnboardingUrl } = await import('./banner');
  return {
    kind: 'not-installed',
    installUrl: buildOnboardingUrl(APP_STORE_URL, { apiKey: config.apiKey, operatorName: config.operatorName }),
    returnLink,
  };
}

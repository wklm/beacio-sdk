/**
 * SB-SDK-12: the framework-agnostic, ZERO-DOM headless onboarding primitive for
 * vanilla-JS partners (Storz & Bickel's app is vanilla JS + jQuery and cannot use
 * the React wizard; the only vanilla option before this — showInstallBanner —
 * injects beacio chrome).
 *
 * This is the SINGLE shared derivation of install state + the return-link and
 * dismissal bookkeeping. Before this module the same marker logic was duplicated
 * THREE ways (detect.ts resolveInstallState, react-sdk ExtensionDetector
 * readInstallState, banner.ts isExtensionActiveNow) and the return-link/dismissal
 * helpers were module-private in banner.ts, exported nowhere. Now:
 *   - detect.ts and the react-sdk ExtensionDetector consume getInstallState()
 *     (AC1 "the detection logic is SHARED, not duplicated").
 *   - banner.ts consumes saveReturnContext / getReturnContext / isDismissed /
 *     setDismissed from here (behavior + private call sites unchanged).
 *   - index.ts re-exports the headless surface so a classic <script> partner can
 *     draw its OWN "Enable Bluetooth in Safari" card with no beacio pixels.
 *
 * NONE of these helpers inject DOM.
 *
 * SB-SDK-02 (Part B) constraint: this module is reachable from the package-root
 * barrel, and `@beacio/core` is an OPTIONAL peer (it may be absent on a standalone
 * `npm i @beacio/detect`). So it must NOT hard-import core at module top level —
 * that throws at load (guarded by optional-core.test.ts + no-toplevel-core-import
 * .test.ts). The one core value it needs — the EXTENSION_READY event name — is
 * inlined here and pinned to core's BeacioEventName union via a fully-erased
 * `import type` + `satisfies`, exactly like index.ts's BEACIO_EVENTS map: a name
 * that diverges from core's source of truth becomes a COMPILE error while no
 * runtime core load is required (events.test.ts is the seam-crossing control).
 */
import type { BeacioEventName } from '@beacio/core';

/**
 * Where the user is in the irreducibly-manual iOS-26 setup funnel, derived purely
 * from the in-page markers the content script / injected polyfill set:
 *  - 'not-installed'      → no markers; the app is not installed
 *  - 'installed-inactive' → installed, but the Safari extension toggle is off
 *  - 'active'             → the polyfill is live on this page
 *
 * The shared shape consumed by detect.ts, the react-sdk ExtensionDetector, and
 * the headless API. (The per-site 'denied' refinement is NOT a marker state — it
 * is derived separately in initBeacio from navigator.bluetooth.getAvailability().)
 */
export type ExtensionInstallState = 'not-installed' | 'installed-inactive' | 'active';

/**
 * The in-page extension handshake event the injected polyfill dispatches when it
 * goes live. Kept as a local literal (no runtime `@beacio/core` load) but pinned
 * to core's canonical {@link BeacioEventName} union via `satisfies`, so it cannot
 * silently drift from BEACIO_EVENTS.EXTENSION_READY ('beacio:extension:ready').
 */
const EXTENSION_READY_EVENT = 'beacio:extension:ready' satisfies BeacioEventName;

/** localStorage keys — the SAME keys banner.ts has always used (back-compat). */
const DISMISS_KEY = 'beacio_dismiss_until';
const RETURN_KEY = 'beacio_return';
const RETURN_LINK_HOST = 'link.beacio.com';

/**
 * SB-SDK-12 (AC4): the canonical id-form App Store URL for the public beacio app.
 * The id form survives the public App Store rename — pinning the banner CTA here
 * means no banner code path can hardcode a NAME slug (`/app/<slug>/id…`) that
 * would 404 or mislead if Apple's slug differs from "beacio". The slug-form URL is
 * a SEPARATE concern owned by the CDN/website surfaces; the SDK side uses the id
 * form only.
 */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6761301368';

// ─── Install-state markers (the single shared derivation) ────────────────────

function hasWindowMarker(): boolean {
  return typeof window !== 'undefined' && (window as any).__beacio?.status === 'installed';
}

function hasNavigatorMarker(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return Boolean((navigator as any).beacio && (navigator as any).beacio.__beacio);
}

function hasInstallMarker(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.beacioInstalled === 'true';
}

function hasActiveMarker(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.beacioExtension === 'true';
}

/**
 * Synchronously read the current install state from the in-page markers. Pure,
 * zero-DOM, side-effect-free — the one accessor detect.ts, the react-sdk
 * ExtensionDetector, and the banner all share. A vanilla-JS partner calls this
 * to decide whether to render its own "Enable Bluetooth in Safari" card.
 */
export function getInstallState(): ExtensionInstallState {
  if (hasNavigatorMarker() || hasActiveMarker()) {
    return 'active';
  }
  if (hasWindowMarker() || hasInstallMarker()) {
    return 'installed-inactive';
  }
  return 'not-installed';
}

/** True once the content script has flagged the extension active on this page. */
export function isExtensionActive(): boolean {
  return getInstallState() === 'active';
}

/**
 * SB-SDK-12 (AC3): the headless detector. Resolves the CURRENT install state
 * immediately when it is already 'active' (markers set); otherwise it waits for
 * the in-page extension to announce itself via the canonical EXTENSION_READY
 * handshake ('beacio:extension:ready') — the seam the react-sdk ExtensionDetector
 * and the in-page polyfill already speak — and resolves 'active' when it fires.
 * Falls back to a final marker read after `timeoutMs`. Injects no DOM.
 *
 * This lets a vanilla-JS partner await activation without polling and without any
 * beacio chrome: `const state = await observeInstallState();`.
 */
export function observeInstallState(timeoutMs = 3000): Promise<ExtensionInstallState> {
  const current = getInstallState();
  if (current === 'active' || typeof window === 'undefined') {
    return Promise.resolve(current);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (state: ExtensionInstallState): void => {
      if (settled) return;
      settled = true;
      window.removeEventListener(EXTENSION_READY_EVENT, onReady);
      clearTimeout(timer);
      resolve(state);
    };
    const onReady = (): void => finish('active');

    window.addEventListener(EXTENSION_READY_EVENT, onReady);
    const timer = setTimeout(() => finish(getInstallState()), timeoutMs);
  });
}

// ─── Dismissal frequency-capping (zero-DOM bookkeeping) ──────────────────────

/**
 * SB-PRD-08 (AC5): the two suppression windows, written to the SAME DISMISS_KEY.
 *
 * - LONG (`DEFAULT_DISMISS_DAYS`) is the EXPLICIT "Don't show again" — the user
 *   deliberately opted out, so honour it for a fortnight.
 * - SHORT (`SHORT_DISMISS_DAYS`) is a soft "Not now" / backdrop tap: the user is
 *   interested-but-not-ready, not opted out.
 *
 * Why the long default is 14 and NOT longer in a hardware-companion context: a
 * Storz & Bickel device is a considered EUR300-700 purchase whose owner returns
 * over days/weeks while they actually receive and set up the hardware. The old
 * behaviour applied this 14-day silence to EVERY dismiss gesture, so one reflexive
 * "Not now" churned a warm lead. We keep 14 ONLY for the explicit opt-out and make
 * the incidental dismiss a single day, so the passive on-load banner re-appears on
 * the next session while a force-show recovery path (banner.ts) always lets a
 * dismissed user re-open setup immediately. 14 stays the LONG default (configurable
 * via dismissDays) because an explicit opt-out should not nag the next day either.
 */
export const DEFAULT_DISMISS_DAYS = 14;
export const SHORT_DISMISS_DAYS = 1;

/** True while a prior dismissal is still inside its suppression window. */
export function isDismissed(): boolean {
  try {
    const until = localStorage.getItem(DISMISS_KEY);
    if (!until) return false;
    return Date.now() < parseInt(until, 10);
  } catch {
    return false;
  }
}

/**
 * Suppress the prompt for `days` (default {@link DEFAULT_DISMISS_DAYS} = 14) — the
 * LONG, explicit "Don't show again" window. Named `dismiss` on the headless
 * surface; banner.ts keeps calling it as `setDismissed` (re-exported alias) so the
 * existing private call sites are unchanged.
 */
export function dismiss(days = DEFAULT_DISMISS_DAYS): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 86400000));
  } catch {
    /* noop */
  }
}

/**
 * SB-PRD-08 (AC1): the SHORT, soft-dismissal primitive — a "Not now" / backdrop
 * tap suppresses the passive banner for {@link SHORT_DISMISS_DAYS} (1 day) only,
 * not the full fortnight, so an interested-but-not-ready user is not silenced for
 * two weeks. Writes the SAME DISMISS_KEY window as {@link dismiss}, just shorter.
 */
export function dismissShort(): void {
  dismiss(SHORT_DISMISS_DAYS);
}

/** banner.ts back-compat alias for {@link dismiss}. */
export const setDismissed = dismiss;

// ─── Return-to-web-app context (zero-DOM; clipboard + localStorage) ──────────

/**
 * Persist (and best-effort copy) the originating page so the return link survives
 * the round trip into Settings and back. The return link is the
 * `https://link.beacio.com/return?url=<encoded current href>` form. Injects no
 * DOM — a partner surfaces the link in its OWN card.
 */
export function saveReturnContext(): void {
  if (typeof window === 'undefined') return;
  const returnPageURL = new URL(window.location.href);
  const returnLink = new URL(`https://${RETURN_LINK_HOST}/return`);
  returnLink.searchParams.set('url', returnPageURL.toString());

  try {
    localStorage.setItem(
      RETURN_KEY,
      JSON.stringify({ url: returnPageURL.toString(), returnLink: returnLink.toString(), timestamp: Date.now() })
    );
    navigator.storage?.persist?.();
  } catch {
    /* noop */
  }
  try {
    navigator.clipboard?.writeText(returnLink.toString());
  } catch {
    /* noop */
  }
}

/**
 * The originating page saved by {@link saveReturnContext}, as a VISIBLE, tappable
 * affordance — never relying on a silent clipboard write. Returns the current
 * href as a sensible fallback when nothing was saved.
 */
export function getReturnContext(): { url: string; returnLink: string } {
  const here = typeof window !== 'undefined' ? window.location.href : '';
  try {
    const raw = localStorage.getItem(RETURN_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { url?: string; returnLink?: string };
      const url = parsed.url || here;
      return { url, returnLink: parsed.returnLink || url };
    }
  } catch {
    /* noop */
  }
  return { url: here, returnLink: here };
}

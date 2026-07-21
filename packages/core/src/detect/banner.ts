/**
 * Install prompt UI for Beacio
 *
 * Two modes:
 * 1. Bottom sheet (default) — iOS-native feel, shown on requestDevice() trigger
 * 2. Banner — lightweight top/bottom bar for passive prompting
 *
 * Features:
 * - Clipboard context saving for return-to-web-app flow
 * - 14-day dismissal frequency capping
 * - Configurable install/onboarding redirect
 * - Dark mode support via prefers-color-scheme
 */

// The canonical /setup URL is the single source of truth in core (urls.ts),
// shared by this install banner and the react-sdk InstallationWizard. detect now
// lives INSIDE @beacio/core, so this is a plain intra-package import — no more
// optional-peer inline-pin/`typeof import(...)` dance.
import { SETUP_URL } from '../urls';

// SB-NAT-01: the canonical event-name map — the sheet's live teardown listens on
// BOTH the package-lifecycle READY ('beacio:ready') and the extension's in-page
// handshake EXTENSION_READY ('beacio:extension:ready'), sourced from the single
// source of truth so neither literal can drift (events.test.ts is the control).
import { BEACIO_EVENTS } from '../events';

// SB-SDK-07: the shared localized-string seam. Every visible token routes
// through a resolved LocaleStrings pack (explicit `lang` > navigator.language >
// English), so a German S&B user sees German at the make-or-break moment. The
// built-in `en` pack reproduces today's copy byte-for-byte, so a caller that
// passes no lang/strings is unchanged.
import { type DeepPartial, EN_STRINGS, type LocaleStrings, resolveStrings } from './i18n';

// SB-SDK-12: the install-state marker read, the return-link/clipboard context
// helpers, and the dismissal frequency-cap now live in the single shared
// install-state module (also re-exported from the package root as the headless,
// zero-DOM onboarding API for vanilla-JS partners). The banner consumes them
// here with NO behavior change — same localStorage keys, same return-link form —
// so its private call sites below are unchanged.
import {
  APP_STORE_URL,
  dismiss,
  dismissShort,
  getReturnContext,
  isDismissed,
  isExtensionActive,
  saveReturnContext,
} from './install-state';

/**
 * Where the user is in the irreducibly-manual iOS-26 setup funnel, so the sheet
 * can render the SPECIFIC remaining step instead of restarting the whole flow:
 *  - 'not-installed'      → app not installed; full install→enable→grant walkthrough
 *  - 'installed-inactive' → installed but the Safari extension toggle is off
 *  - 'denied'             → enabled but per-origin access not granted on THIS site
 *  - 'private-browsing'   → Private Browsing disables extensions; reopen in a normal tab
 *  - 'active'             → ready; render the once-only success toast
 * Mirrors ExtensionInstallState ('active' | 'installed-inactive' | 'not-installed')
 * plus the in-page refinements only the page flow can distinguish: the per-site
 * 'denied' grant and the SB-SDK-17 'private-browsing' dead end.
 */
export type BannerState =
  | 'not-installed'
  | 'installed-inactive'
  | 'denied'
  | 'private-browsing'
  | 'active';

export interface BannerOptions {
  /** 'sheet' (default) for iOS bottom sheet, 'banner' for lightweight bar */
  mode?: 'sheet' | 'banner';
  position?: 'top' | 'bottom';
  text?: string;
  buttonText?: string;
  style?: Record<string, string>;
  /** Preferred install or onboarding URL to open when the user taps the CTA */
  startOnboardingUrl?: string;
  /** Legacy install destination option; still supported for compatibility */
  appStoreUrl?: string;
  /** Operator/app name shown in the prompt (e.g. "FitTracker") */
  operatorName?: string;
  /** API key for campaign tracking */
  apiKey?: string;
  /**
   * Days to suppress the PASSIVE on-load banner after the EXPLICIT "Don't show
   * again" opt-out (default: 14). SB-PRD-08: the soft "Not now"/backdrop tap uses
   * a separate, short (1-day) window and is NOT governed by this option, so one
   * reflexive dismiss no longer silences guidance for a fortnight.
   */
  dismissDays?: number;
  /**
   * SB-PRD-08 (AC3): ignore the active dismissal cooldown and render anyway. The
   * passive on-load banner leaves this false so a dismissed user is not nagged;
   * a USER-INITIATED recovery gesture (e.g. tapping Connect, or a "Set up
   * Bluetooth"/"Can't connect?" affordance) passes `forceShow: true` to re-open
   * the activation flow without the integrator having to clear localStorage.
   */
  forceShow?: boolean;
  /**
   * Funnel position. Lets initBeacio render state-specific guidance (and, on
   * 'active', the once-only "ready" toast) without restarting setup. Defaults to
   * 'not-installed' for the legacy "show the full walkthrough" call site.
   */
  state?: BannerState;
  /**
   * Setup destination shown behind the "still stuck?" affordance and the
   * "How does setup work?" disclosure. Defaults to the canonical /setup page;
   * an operator (e.g. Storz & Bickel) can point it at their own branded help.
   */
  setupUrl?: string;
  /**
   * SB-SDK-07: BCP-47 UI language (e.g. 'de'). When set, its primary subtag
   * selects the built-in pack; when omitted, the language is derived from
   * navigator.language, else English. Always wins over navigator.language.
   */
  lang?: string;
  /**
   * SB-SDK-07: partial copy overrides deep-merged over the selected language
   * pack — override one field (e.g. `buttonText`) without restating the rest.
   * Supersedes the legacy `text`/`buttonText` fields for the strings it covers.
   */
  strings?: DeepPartial<LocaleStrings>;
  /**
   * SB-SDK-11 (tier-2 co-brand): partner accent colour applied to the sheet/bar
   * chrome (icon tile, step bullets, primary CTA, disclosure links). Routed
   * through a `--bc-accent` CSS variable so every accent rule switches to
   * var(--bc-accent); when omitted the variable defaults to the beacio Apple-blue
   * (#007aff) and the prompt renders exactly as before. Any CSS colour token.
   */
  accentColor?: string;
  /**
   * SB-SDK-11: partner logo, restricted to a URL (no raw SVG markup) so it can
   * never inject script. Validated with `new URL()` against the page origin and
   * accepted ONLY when the resolved protocol is http(s); a `javascript:`/`data:`/
   * `ftp:` value is dropped and the default beacio chrome icon is kept. Rendered
   * as an <img> in place of the inline beacio <svg>.
   */
  brandLogoUrl?: string;
  /**
   * SB-SDK-11: the specific device being connected (e.g. "VOLCANO HYBRID"). When
   * set it is interpolated into the `{device}` token of any copy that carries it,
   * so a co-brand sheet can read "Connect your VOLCANO HYBRID in Safari".
   */
  deviceName?: string;
  /**
   * SB-SDK-11: a one-shot override for the sheet's lead body copy. Wins over the
   * resolved language pack's state body (HTML-escaped via esc(), like all copy).
   * For finer-grained per-field overrides use the SB-SDK-07 `strings` seam.
   */
  body?: string;
  /**
   * SB-SDK-11: override for the privacy reassurance body (the medical-market
   * trust line). HTML-escaped. Defaults to the resolved pack's privacyBody.
   */
  privacyBody?: string;
}

// AIDEV-NOTE: SB-PRD-03 — the single canonical onboarding copy block. The
// irreducibly-manual iOS-26 enable + per-origin grant is the weakest funnel point
// (memory project_ios26_safari_extension_settings_readonly), and the decisive
// GESTURE — tap aA in the address bar → Manage Extensions → Allow Every Website —
// previously lived ONLY in troubleshooting.md, surfaced nowhere the user is stuck.
// This is the verbatim source of truth reused by the bottom sheet AND mirrored by
// the react-sdk InstallationWizard so web and react paths never drift. iOS-26
// accurate; uses neutral install-path framing only (feedback_no_app_store_status_claims).
export interface SetupStep {
  /** Imperative step label the user taps. */
  label: string;
  /** One-line "why this is required", shown under the label. */
  why: string;
}

/**
 * The real sequence a first-run owner actually taps on a physical iPhone, each
 * grant with its own "why" so no system prompt is a surprise. Ordering and count
 * are the contract: install → open app → enable extension → allow website access
 * (the aA gesture) → allow Bluetooth on first scan → return.
 *
 * SB-SDK-07: this is the ENGLISH step list, now sourced from EN_STRINGS.steps so
 * the exported constant (mirrored by the react-sdk InstallationWizard) and the
 * localized pack never drift. Localized rendering reads the resolved pack's
 * steps; the per-state filtering below is by INDEX into this canonical order, so
 * it is language-independent (German labels do not match the old English regex).
 */
export const SETUP_STEPS: readonly SetupStep[] = EN_STRINGS.steps;

/**
 * Per-state index sets into the canonical SETUP_STEPS order. installed-inactive →
 * enable toggle + Bluetooth prompt + return (indices 2,4,5); denied → the aA
 * website-access gesture + Bluetooth prompt + return (indices 3,4,5). Keyed by
 * index (not label text) so localization cannot change which steps show.
 *
 * SB-SDK-17: 'private-browsing' shows NO steps — the only action is "open this
 * page in a normal tab" (no Settings walkthrough), so the sheet renders just the
 * distinct hint with an empty step strip.
 */
const STATE_STEP_INDICES: Record<Exclude<BannerState, 'active' | 'not-installed'>, readonly number[]> = {
  'installed-inactive': [2, 4, 5],
  denied: [3, 4, 5],
  'private-browsing': [],
};

// AIDEV-NOTE: Canonical zero-config onboarding default — the guided /setup page (install →
// enable Safari extension → return), not a bare App Store search. Lets an agent wire the banner
// with no URL config and still send users to a flow that actually completes setup. Imported from
// @beacio/core (SETUP_URL) so the banner and the react-sdk InstallationWizard share one constant.
const DEFAULT_ONBOARDING_URL = SETUP_URL;
// SB-PRD-03 AC5: once-only success toast. Set on the first load that observes the
// 'active' transition so returning users get the fast path (no banner, no toast).
const READY_SHOWN_KEY = 'beacio_ready_shown';

// SB-SDK-03 AC4: the install sheet is a LIVE affordance. The irreducibly-manual
// iOS-26 enable step (project_ios26_safari_extension_settings_readonly) happens
// OUTSIDE the page in Settings, so a visible sheet must re-check on foreground
// return + on the extension's READY signal and remove itself the moment the
// extension goes active — with no manual reload. These mirror the canonical
// names: the active DOM marker the content script sets (detect.ts hasActiveMarker)
// and BEACIO_EVENTS.READY dispatched by initBeacio (index.ts:114).
const READY_EVENT = BEACIO_EVENTS.READY;
// SB-NAT-01 regression fix (2026-07-21): READY alone is DEAF to same-load late
// activation. 'beacio:ready' is dispatched ONLY by initBeacio's active path — a
// path that, by construction, never ran in the page-load that rendered this
// non-active sheet — and visibilitychange never fires while Safari stays
// foregrounded. On a cold-appex first load the injected polyfill announces
// itself AFTER detect's 2s window via its OWN in-page handshake event
// (BEACIO_EVENTS.EXTENSION_READY, the same seam observeInstallState awaits), so
// the sheet must ALSO listen there or it sits over the operator's app forever
// and swallows the Connect tap (hardware-observed on the S&B fork).
const EXTENSION_READY_EVENT = BEACIO_EVENTS.EXTENSION_READY;
// Bounded foreground re-check poll, modeled on website-src/scripts/setup-verify.js
// (PING_ATTEMPTS/PING_INTERVAL_MS): a capped number of attempts so we never leave
// a live timer running for battery safety if activation never happens.
const RECHECK_ATTEMPTS = 5;
const RECHECK_INTERVAL_MS = 300;

// SB-SDK-12: isExtensionActiveNow / isDismissed / dismiss / saveReturnContext
// / getReturnContext were promoted into the shared install-state module (imported
// above) and re-exported from the package root as the headless API. They keep the
// same localStorage keys and return-link form, so the call sites below are
// unchanged. `isExtensionActiveNow` is now `isExtensionActive` from that module.

function resolveOnboardingUrl(options: Pick<BannerOptions, 'startOnboardingUrl' | 'appStoreUrl'>): string {
  return options.startOnboardingUrl ?? options.appStoreUrl ?? DEFAULT_ONBOARDING_URL;
}

/**
 * SB-PRD-07 AC4: PURE URL builder for the onboarding redirect — the durable seam
 * the click handlers delegate to (jsdom 26 makes window.location.href set/readback
 * un-observable, so the branded-continuity contract is pinned here, not on a
 * navigation). Two mutually-exclusive shapes by destination:
 *  - App Store (apps.apple.com): campaign ct/mt ONLY, exactly as before — the deep
 *    link must NOT carry the operator identity / return origin. SB-SDK-12 AC4: the
 *    path is normalized to the id form (apps.apple.com/app/id<digits>) using the
 *    canonical APP_STORE_URL, so a caller-supplied NAME slug (/app/<slug>/id…) — the
 *    form that 404s / misleads if Apple's slug differs from "beacio" — is stripped.
 *  - canonical onboarding (beacio.com/setup, or an operator's own help URL): thread
 *    operatorName + the originating return URL as query params so the guided /setup
 *    page renders "Return to <operator>" instead of generic copy. Existing params
 *    on the target are preserved; we never overwrite an operatorName/return already
 *    present on the URL.
 */
export function buildOnboardingUrl(
  url: string,
  opts: { apiKey?: string; operatorName?: string; returnUrl?: string } = {}
): string {
  const base = typeof window !== 'undefined' ? window.location.href : undefined;
  const parsed = new URL(url, base);
  const isAppStore = parsed.hostname === 'apps.apple.com';

  if (isAppStore) {
    // SB-SDK-12 AC4: collapse the path to the id form. Keep the app id segment
    // (idNNNN) if the caller supplied one; otherwise fall back to the canonical
    // APP_STORE_URL path. Either way no NAME slug survives onto the deep link.
    const idSegment = parsed.pathname.match(/id\d+/)?.[0];
    parsed.pathname = idSegment ? `/app/${idSegment}` : new URL(APP_STORE_URL).pathname;
    if (opts.apiKey && !parsed.searchParams.has('ct')) {
      parsed.searchParams.set('ct', opts.apiKey);
      parsed.searchParams.set('mt', '8');
    }
    return parsed.toString();
  }

  // Non-App-Store onboarding target → carry the branded continuity through.
  if (opts.operatorName && !parsed.searchParams.has('operatorName')) {
    parsed.searchParams.set('operatorName', opts.operatorName);
  }
  if (opts.returnUrl && !parsed.searchParams.has('return')) {
    parsed.searchParams.set('return', opts.returnUrl);
  }
  return parsed.toString();
}

function redirectToOnboarding(url: string, apiKey?: string, operatorName?: string): void {
  saveReturnContext();

  // SB-PRD-07 AC4: thread the operator identity + the originating page through the
  // redirect so /setup (and /setup-verify) can render the branded return CTA.
  const returnUrl = getReturnContext().url;
  window.location.href = buildOnboardingUrl(url, { apiKey, operatorName, returnUrl });
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// SB-SDK-07: substitute the resolved operator name into a localized template's
// `{operator}` token. All operator-bearing strings (the not-installed body, the
// return CTA, the clipboard hint, the ready toast) carry `{operator}` in BOTH
// language packs, so this is the single, language-independent interpolation.
// SB-SDK-11: also substitutes the optional `{device}` token (the connected
// device's display name) where co-brand copy names it; an empty deviceName
// leaves a bare token-free string.
function fill(template: string, operatorName: string, deviceName = ''): string {
  return template.replace(/\{operator\}/g, operatorName).replace(/\{device\}/g, deviceName);
}

/**
 * SB-SDK-11 AC2 injection guard: a partner logo is accepted ONLY as a URL that
 * resolves (against the page origin) to an http(s) resource. A `javascript:`,
 * `data:`, `ftp:` (or any non-http) value — the XSS vectors — is rejected and the
 * caller falls back to the default beacio chrome icon. Relative URLs (e.g. a
 * site-hosted `logo-sb.svg`) resolve to the page's http(s) origin and are allowed.
 * Returns the resolved absolute URL string when safe, else null. Never throws.
 */
function safeLogoUrl(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const base = typeof window !== 'undefined' ? window.location.href : 'https://beacio.com';
  try {
    const u = new URL(raw, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

// ─── Bottom Sheet ──────────────────────────────────────────────────────────

function showBottomSheet(options: BannerOptions): HTMLElement {
  const {
    operatorName = document.title || window.location.hostname,
    apiKey,
    dismissDays = 14,
    state = 'not-installed',
  } = options;
  const onboardingUrl = resolveOnboardingUrl(options);
  // SB-SDK-07: resolve the localized pack ONCE (explicit lang > navigator.language
  // > English), then deep-merge any partial `strings` override. The legacy
  // `buttonText` field, when supplied, still wins for the CTA (back-compat).
  const t = resolveStrings({ lang: options.lang, strings: options.strings });
  const buttonText = options.buttonText ?? t.buttonText;
  // 'active' never reaches here (showInstallBanner routes it to the toast); the
  // remaining states each carry their own lead copy + only-the-relevant steps.
  const sheetState = (state === 'active' ? 'not-installed' : state) as Exclude<BannerState, 'active'>;
  const { title } = t.states[sheetState];
  // SB-SDK-11: a top-level `body` override wins over the resolved pack body so a
  // co-brand caller can pass device-specific lead copy; else use the pack's state
  // body with {operator}/{device} interpolated.
  const body = options.body ?? t.states[sheetState].body;
  const setupUrl = options.setupUrl ?? onboardingUrl;
  const ret = getReturnContext();

  // SB-SDK-11 (tier-2 co-brand): resolve the optional theme. The accent is routed
  // through a `--bc-accent` CSS variable defaulting to the beacio Apple-blue, so
  // every accent rule below reads var(--bc-accent) and an unthemed sheet is
  // byte-identical to before. A partner logo is URL-validated (no raw SVG) and,
  // when safe, swaps the inline beacio chrome <svg> for an <img>. `themed` is true
  // for any co-brand signal and gates the always-on trust surfaces (the VISIBLE
  // privacy line + the "not affiliated with the device maker" microcopy).
  const accent = options.accentColor ?? '#007aff';
  const logoUrl = safeLogoUrl(options.brandLogoUrl);
  const deviceName = options.deviceName ?? '';
  const themed = Boolean(options.accentColor || logoUrl || options.deviceName);
  const privacyBody = options.privacyBody ?? t.privacyBody;

  // installed-inactive → just the enable toggle; denied → just the aA gesture;
  // not-installed → the full first-run walkthrough (AC6: show the SPECIFIC step,
  // do not restart). The Bluetooth-prompt + return steps stay so the user is
  // never surprised by the first-scan permission and always has a next action.
  // SB-SDK-07: filter by INDEX into the canonical order (language-independent),
  // and render the RESOLVED pack's step copy (German labels/why when lang='de').
  const steps =
    sheetState === 'not-installed'
      ? t.steps
      : STATE_STEP_INDICES[sheetState].map((i) => t.steps[i]);

  const stepsHtml = steps
    .map(
      (s) =>
        `<li class="bc-step"><span class="bc-step-l">${esc(s.label)}</span><span class="bc-step-w">${esc(s.why)}</span></li>`
    )
    .join('');

  const overlay = document.createElement('div');
  overlay.id = 'beacio-banner';
  overlay.dataset.beacioState = sheetState;
  overlay.innerHTML = `
<style>
/* SB-SDK-11: the partner accent is exposed as a single CSS custom property on the
   sheet root; every accent rule below reads var(--bc-accent). When unthemed the
   value defaults to the beacio Apple-blue, so the rendered sheet is unchanged. */
#bc-s{--bc-accent:${esc(accent)}}
#beacio-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:flex-end;
  justify-content:center;background:rgba(0,0,0,.4);font-family:-apple-system,BlinkMacSystemFont,
  'SF Pro Text',system-ui,sans-serif;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);
  animation:bc-fi .25s ease-out}
@keyframes bc-fi{from{opacity:0}to{opacity:1}}
@keyframes bc-su{from{transform:translateY(100%)}to{transform:translateY(0)}}
#bc-s{background:#fff;border-radius:16px 16px 0 0;padding:12px 20px 28px;max-width:420px;
  width:100%;animation:bc-su .3s ease-out;max-height:90vh;overflow-y:auto;
  -webkit-overflow-scrolling:touch}
#bc-s *{box-sizing:border-box;margin:0;padding:0}
.bc-h{width:36px;height:5px;border-radius:3px;background:#d1d1d6;margin:0 auto 10px}
.bc-hdr{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.bc-ic{width:36px;height:36px;border-radius:9px;background:var(--bc-accent);display:flex;
  align-items:center;justify-content:center;flex-shrink:0;overflow:hidden}
.bc-ic svg{width:20px;height:20px;fill:#fff}
.bc-ic img{width:100%;height:100%;object-fit:contain}
.bc-tt{font-size:16px;font-weight:600;color:#000}
.bc-bd{font-size:13px;line-height:1.35;color:#8e8e93;margin-bottom:12px}
.bc-steps{list-style:none;margin:0 0 14px;padding:0;counter-reset:bc-step}
.bc-step{position:relative;padding:0 0 8px 28px;font-size:13px;line-height:1.35}
.bc-step::before{counter-increment:bc-step;content:counter(bc-step);position:absolute;left:0;top:0;
  width:18px;height:18px;border-radius:50%;background:var(--bc-accent);color:#fff;font-size:11px;
  font-weight:600;display:flex;align-items:center;justify-content:center}
.bc-step-l{display:block;font-weight:600;color:#1c1c1e}
.bc-step-w{display:block;color:#8e8e93;margin-top:1px;font-size:12px}
.bc-btn{display:block;width:100%;padding:12px;background:var(--bc-accent);color:#fff;border:none;
  border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;text-align:center;
  text-decoration:none;-webkit-tap-highlight-color:transparent}
.bc-btn:active{opacity:.85}
.bc-ret{display:block;width:100%;padding:12px;margin-top:8px;background:#34c759;color:#fff;border:none;
  border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;text-align:center;
  text-decoration:none;-webkit-tap-highlight-color:transparent}
.bc-ret:active{opacity:.85}
.bc-cb{font-size:11px;color:#8e8e93;text-align:center;margin-top:6px}
/* SB-SDK-11 AC3: VISIBLE trust surfaces (not the collapsed <details>) — the
   medical-market "No data collected" reassurance + the no-affiliation microcopy. */
.bc-privacy{font-size:12px;color:#8e8e93;line-height:1.4;margin-top:12px}
.bc-noaff{font-size:11px;color:#8e8e93;line-height:1.3;margin-top:6px;text-align:center}
.bc-det{margin-top:10px}
.bc-det summary{font-size:13px;color:var(--bc-accent);cursor:pointer;list-style:none;padding:2px 0}
.bc-det summary::before{content:'\\25B8  '}
.bc-det[open] summary::before{content:'\\25BE  '}
.bc-det p{font-size:12px;color:#8e8e93;line-height:1.4;padding:6px 0 2px}
.bc-det a{color:var(--bc-accent)}
.bc-stuck{display:block;font-size:12px;color:var(--bc-accent);text-align:center;margin-top:10px;
  text-decoration:none}
.bc-reload{display:block;width:100%;padding:11px;margin-top:8px;background:none;
  border:1px solid var(--bc-accent);border-radius:12px;font-size:15px;font-weight:600;color:var(--bc-accent);
  cursor:pointer;text-align:center;-webkit-tap-highlight-color:transparent}
.bc-reload:active{opacity:.7}
.bc-dis{display:block;width:100%;padding:8px;background:none;border:none;font-size:14px;
  color:#8e8e93;cursor:pointer;text-align:center;margin-top:4px;
  -webkit-tap-highlight-color:transparent}
/* SB-PRD-08: the explicit long opt-out (#bc-dont-show) is visually quieter than the
   soft dismiss (#bc-dismiss) above it — smaller, less padding — so the soft dismiss
   stays the default gesture and the long opt-out is a deliberate secondary choice.
   NB keep this comment free of literal UI copy: the <style> block is part of the
   banner innerHTML, so any English token here would leak into the localized DOM
   (i18n.test.ts no-English-leak guard). */
.bc-dont{font-size:12px;padding:4px 12px;margin-top:0}
@media(prefers-color-scheme:dark){
  #bc-s{background:#1c1c1e}
  .bc-tt,.bc-step-l{color:#fff}
  .bc-bd,.bc-step-w,.bc-cb,.bc-det p,.bc-privacy,.bc-noaff{color:#98989f}
  .bc-dis{color:#98989f}
  .bc-reload{color:#0a84ff;border-color:#0a84ff}
  .bc-h{background:#48484a}
}
</style>
<div id="beacio-overlay">
<div id="bc-s" role="dialog" aria-label="${esc(title)}">
  <div class="bc-h"></div>
  <div class="bc-hdr">
    <div class="bc-ic">${
      logoUrl
        ? `<img src="${esc(logoUrl)}" alt="" aria-hidden="true">`
        : '<svg viewBox="0 0 24 24"><path d="M12 2L7 7l5 5-5 5 5 5V2zm0 6.83L10.83 7 12 5.83v2.34zm0 8.34L10.83 17 12 15.83v1.34zM17 7l-5 5 5 5-2.12 2.12L12 17l-2.88 2.12L7 17l5-5-5-5 2.12-2.12L12 7l2.88-2.12L17 7z"/></svg>'
    }</div>
    <div class="bc-tt">${esc(title)}</div>
  </div>
  <div class="bc-bd">${esc(fill(body, operatorName, deviceName))}</div>
  <ol class="bc-steps">${stepsHtml}</ol>
  ${
    sheetState === 'not-installed'
      ? `<button class="bc-btn" id="bc-install">${esc(buttonText)}</button>`
      : ''
  }
  <a class="bc-ret" id="bc-return" href="${esc(ret.returnLink)}">${esc(fill(t.returnCta, operatorName))}</a>
  <p class="bc-cb">${esc(fill(t.clipboardHint, operatorName))}</p>
  <button class="bc-reload" id="bc-reload">${esc(t.reload)}</button>
  <details class="bc-det"><summary>${esc(t.howSummary)}</summary><p>${esc(t.howBody)} <a href="${esc(setupUrl)}" target="_blank" rel="noopener">${esc(t.howLink)}</a>.</p></details>
  <details class="bc-det"><summary>${esc(t.privacySummary)}</summary><p>${esc(privacyBody)}</p></details>
  ${
    themed
      ? // SB-SDK-11 AC3: a VISIBLE privacy reassurance (the medical-market trust
        // angle) — distinct from the collapsed <details> above — plus a
        // no-affiliation microcopy line. Device-agnostic, neutral install-path
        // framing only (no App-Store-approved/cleared/audited claims).
        `<p class="bc-privacy" id="bc-privacy">${esc(t.privacySummary)} — ${esc(privacyBody)}</p>` +
        `<p class="bc-noaff" id="bc-noaff">beacio is an independent Safari extension and is not affiliated with the device maker.</p>`
      : ''
  }
  <a class="bc-stuck" id="bc-stuck" href="${esc(setupUrl)}" target="_blank" rel="noopener">${esc(t.stillStuck)}</a>
  <button class="bc-dis" id="bc-dismiss">${esc(t.dismiss)}</button>
  <button class="bc-dis bc-dont" id="bc-dont-show">${esc(t.dontShowAgain)}</button>
</div>
</div>`;

  // SB-PRD-03 AC4: persist the originating page so the return link survives the
  // round trip, and (best-effort) copy it — but the link above is the primary,
  // VISIBLE affordance and the copy is announced in the .bc-cb line, not silent.
  saveReturnContext();

  // SB-SDK-03 AC4/AC5: wire the LIVE lifecycle synchronously (not deferred to
  // rAF) so a foreground return / READY signal that lands in the same tick — e.g.
  // the content script setting the active marker the instant the sheet renders —
  // still tears the sheet down. Each listener and the bounded poll are unwound by
  // detachLifecycle() so nothing keeps firing after the sheet is gone (battery).
  //
  // SB-PRD-08 AC3 (2026-07-21 device evidence): a `forceShow: true` sheet is a
  // USER-INITIATED recovery gesture ("Can't connect?" / the E2E selector-liveness
  // control) — the user explicitly asked for the guidance even though the markers
  // may already read 'active', so the automatic self-clearing lifecycle is
  // SKIPPED for it (on hardware it removed the requested sheet in the same tick,
  // rendering the affordance blank). The explicit dismiss controls and the
  // reload re-check remain the ways a forced sheet leaves the page.
  const persistent = options.forceShow === true;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let detached = false;

  function detachLifecycle(): void {
    detached = true;
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    window.removeEventListener(READY_EVENT, onReady);
    window.removeEventListener(EXTENSION_READY_EVENT, onExtensionReady);
    document.removeEventListener('visibilitychange', onVisibility);
  }

  // AC5: the extension went active — drop the sheet with no manual reload. The
  // once-only "you can scan now" toast is the caller's job (initBeacio re-derives
  // 'active' on the next load); here we just clear the stale guidance.
  function clearIfActive(): boolean {
    if (!isExtensionActive()) return false;
    detachLifecycle();
    overlay.remove();
    return true;
  }

  function onReady(): void {
    clearIfActive();
  }

  // SB-NAT-01: the injected polyfill just announced it is live in THIS page-load
  // (cold-appex late activation — the scenario READY structurally cannot cover).
  // The active marker normally lands in the same tick as the event; when the
  // ordering races, the bounded re-check absorbs it (battery-safe, capped).
  function onExtensionReady(): void {
    if (clearIfActive()) return;
    startBoundedRecheck();
  }

  // AC4: bounded ping-style re-check on foreground return, modeled on
  // setup-verify.js startPingLoop — capped attempts, fully torn down when it
  // gives up so no timer survives if activation never happens.
  function startBoundedRecheck(): void {
    if (detached || pollTimer !== null) return;
    let attempts = 0;
    const tick = (): void => {
      pollTimer = null;
      if (detached) return;
      if (clearIfActive()) return;
      attempts += 1;
      if (attempts >= RECHECK_ATTEMPTS) return; // give up; leave no live timer
      pollTimer = setTimeout(tick, RECHECK_INTERVAL_MS);
    };
    tick();
  }

  function onVisibility(): void {
    if (document.visibilityState !== 'visible') return;
    // Immediate check (the marker may already be set), then a short bounded poll
    // to absorb the content-script/injected.js activation race on return.
    if (clearIfActive()) return;
    startBoundedRecheck();
  }

  if (!persistent) {
    window.addEventListener(READY_EVENT, onReady);
    window.addEventListener(EXTENSION_READY_EVENT, onExtensionReady);
    document.addEventListener('visibilitychange', onVisibility);
  }

  requestAnimationFrame(() => {
    overlay.querySelector('#bc-install')?.addEventListener('click', () => {
      redirectToOnboarding(onboardingUrl, apiKey, operatorName);
    });
    overlay.querySelector('#bc-reload')?.addEventListener('click', () => {
      // AC3: re-check after the user changed Settings, without manual navigation.
      // If the extension is already active, drop the sheet in place; otherwise
      // reload so getExtensionInstallState() re-runs against fresh markers.
      if (clearIfActive()) return;
      window.location.reload();
    });
    // SB-PRD-08 (AC1): "Not now" is a SOFT dismissal — suppress the passive banner
    // for one day only, not the full dismissDays window, so an interested user is
    // not silenced for a fortnight by one reflexive tap.
    overlay.querySelector('#bc-dismiss')?.addEventListener('click', () => {
      detachLifecycle();
      overlay.remove();
      dismissShort();
    });
    // SB-PRD-08 (AC1): the EXPLICIT "Don't show again" opt-out — the LONG
    // (dismissDays, default 14) suppression. Only this deliberate control earns
    // the long silence.
    overlay.querySelector('#bc-dont-show')?.addEventListener('click', () => {
      detachLifecycle();
      overlay.remove();
      dismiss(dismissDays);
    });
    // Backdrop tap is incidental, like "Not now" → soft dismissal.
    overlay.querySelector('#beacio-overlay')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'beacio-overlay') {
        detachLifecycle();
        overlay.remove();
        dismissShort();
      }
    });
  });

  document.body.appendChild(overlay);
  // The sheet may render into an already-active page (marker set before init ran);
  // clear immediately so we never show stale guidance over a working extension.
  // A forced (user-initiated) sheet is exempt — see the `persistent` note above.
  if (!persistent) clearIfActive();
  return overlay;
}

// ─── Lightweight Banner ────────────────────────────────────────────────────

function showBarBanner(options: BannerOptions): HTMLElement {
  const {
    position = 'bottom',
    style = {},
    apiKey,
    operatorName,
  } = options;
  // SB-SDK-07: resolve the localized pack; the legacy `text`/`buttonText` fields
  // still win when supplied (back-compat), else fall back to the pack's bar copy.
  const t = resolveStrings({ lang: options.lang, strings: options.strings });
  const text = options.text ?? t.barText;
  const buttonText = options.buttonText ?? t.buttonText;
  const onboardingUrl = resolveOnboardingUrl(options);
  // SB-SDK-11: the same co-brand theme as the sheet — accent (default beacio
  // Apple-blue) + URL-validated partner logo (else the default beacio glyph).
  const accent = options.accentColor ?? '#007AFF';
  const logoUrl = safeLogoUrl(options.brandLogoUrl);

  const el = document.createElement('div');
  el.id = 'beacio-banner';

  const posStyle =
    position === 'top'
      ? 'top:0;border-bottom:1px solid #e5e7eb;'
      : 'bottom:0;border-top:1px solid #e5e7eb;';

  const customStyle = Object.entries(style)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');

  el.innerHTML = `
    <div style="position:fixed;${posStyle}left:0;right:0;z-index:2147483646;
      background:#fff;padding:16px;
      display:flex;align-items:center;gap:12px;font-family:system-ui,-apple-system,sans-serif;
      box-shadow:0 ${position === 'top' ? '2px' : '-2px'} 10px rgba(0,0,0,0.1);${customStyle}">
      ${
        logoUrl
          ? `<img src="${esc(logoUrl)}" alt="" aria-hidden="true" width="24" height="24" style="object-fit:contain;flex-shrink:0">`
          : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="${esc(accent)}"/>
        <path d="M12 7a1 1 0 0 1 1 1v4a1 1 0 0 1-2 0V8a1 1 0 0 1 1-1zm0 8a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" fill="white"/>
      </svg>`
      }
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600;color:#1f2937">${esc(t.barTitle)}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px">${esc(text)}</div>
      </div>
      <button id="beacio-banner-install"
         style="background:${esc(accent)};color:white;padding:8px 16px;border-radius:8px;
         border:none;font-size:14px;font-weight:500;white-space:nowrap;cursor:pointer">
        ${esc(buttonText)}</button>
      <button id="beacio-banner-close"
              style="background:none;border:none;color:#9ca3af;font-size:20px;
              cursor:pointer;padding:4px;line-height:1"
              aria-label="Close">&times;</button>
    </div>`;

  el.querySelector('#beacio-banner-install')?.addEventListener('click', () => {
    redirectToOnboarding(onboardingUrl, apiKey, operatorName);
  });
  // SB-PRD-08 (AC1): the bar's × is an incidental close → SOFT (1-day) dismissal,
  // matching the sheet's "Not now"; the lightweight bar has no explicit
  // "Don't show again" opt-out, so it never triggers the long window.
  el.querySelector('#beacio-banner-close')?.addEventListener('click', () => {
    el.remove();
    dismissShort();
  });

  document.body.appendChild(el);
  return el;
}

// ─── Success Toast ─────────────────────────────────────────────────────────

function hasReadyBeenShown(): boolean {
  try {
    return localStorage.getItem(READY_SHOWN_KEY) === '1';
  } catch {
    return false;
  }
}

function markReadyShown(): void {
  try {
    localStorage.setItem(READY_SHOWN_KEY, '1');
  } catch {
    /* noop */
  }
}

/**
 * SB-PRD-03 AC5: the FIRST page load that observes the 'active' transition gets a
 * dismissible "beacio is ready — tap Connect" toast, exactly once. Returning users
 * (key already set) get the fast path: no toast, no banner. Returns null on the
 * second+ call so callers can treat it like the suppressed banner.
 */
function showReadyToast(options: BannerOptions): HTMLElement | null {
  if (hasReadyBeenShown()) return null;
  markReadyShown();

  const operatorName = options.operatorName || document.title || window.location.hostname;
  // SB-SDK-07: localized success-toast copy (explicit lang > navigator.language >
  // English), with `{operator}` filled by the resolved operator name.
  const t = resolveStrings({ lang: options.lang, strings: options.strings });
  const el = document.createElement('div');
  el.id = 'beacio-banner';
  el.dataset.beacioState = 'active';
  el.innerHTML = `
<style>
#bc-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;
  max-width:420px;width:calc(100% - 32px);background:#34c759;color:#fff;border-radius:14px;
  padding:14px 16px;display:flex;align-items:center;gap:12px;
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;
  box-shadow:0 6px 20px rgba(0,0,0,.2);animation:bc-tu .3s ease-out}
@keyframes bc-tu{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
#bc-toast svg{width:22px;height:22px;flex-shrink:0;fill:#fff}
.bc-toast-tx{flex:1;font-size:15px;font-weight:600;line-height:1.3}
#bc-toast-x{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:0 4px;
  line-height:1;-webkit-tap-highlight-color:transparent}
</style>
<div id="bc-toast" role="status">
  <svg viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
  <span class="bc-toast-tx">${esc(fill(t.readyToast, operatorName))}</span>
  <button id="bc-toast-x" aria-label="Dismiss">&times;</button>
</div>`;

  requestAnimationFrame(() => {
    el.querySelector('#bc-toast-x')?.addEventListener('click', () => el.remove());
  });

  document.body.appendChild(el);
  return el;
}

// ─── Public API ────────────────────────────────────────────────────────────

export function showInstallBanner(options: BannerOptions = {}): HTMLElement | null {
  // SB-PRD-03 AC5: the ready toast is its OWN affordance and must fire even
  // during the dismiss window — a returning, now-ready user should be welcomed,
  // not silenced by an old "Not now". Only the install/guidance sheets honour dismiss.
  if (options.state === 'active') return showReadyToast(options);
  // SB-PRD-08 (AC3): the passive on-load banner honours the dismissal cooldown so
  // it is not nagging; a user-initiated recovery gesture passes forceShow:true to
  // re-open the flow without waiting out the timer (no localStorage clearing).
  if (!options.forceShow && isDismissed()) return null;
  return options.mode === 'banner' ? showBarBanner(options) : showBottomSheet(options);
}

export function removeInstallBanner(): void {
  const el = document.getElementById('beacio-banner');
  if (el) el.remove();
}

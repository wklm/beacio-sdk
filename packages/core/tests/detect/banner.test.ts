/**
 * Onboarding-copy + return-affordance guard for @beacio/detect's install banner.
 *
 * SB-PRD-03: the irreducibly-manual iOS-26 step (enable the Safari extension +
 * grant per-origin "Allow Every Website" access + the first-scan Bluetooth
 * prompt) is the weakest funnel point. The decisive, non-obvious GESTURE —
 * tap the `AA` button in the address bar -> Manage Extensions -> beacio ->
 * Allow Every Website — was documented only in troubleshooting.md and surfaced
 * NOWHERE the user is when stuck. This test pins that copy + the visible,
 * origin-correct return affordance + the once-only "ready" success toast +
 * per-state guidance INTO the bottom sheet so they cannot silently regress.
 *
 * jsdom; mirrors events.test.ts import style (`@jest/globals`). Run via
 *   npx jest --config packages/detect/jest.config.js --rootDir packages/detect
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type BannerOptions, removeInstallBanner, showInstallBanner } from '../../src/detect/banner';
import * as banner from '../../src/detect/banner';

// SB-PRD-07 AC4: the install CTA must thread the operator identity + the originating
// return URL THROUGH the redirect into /setup, so the guided page stays branded and
// the "Return to <operator>" continuity survives. jsdom 26 makes window.location.href
// set/readback + window.location.assign un-observable (same constraint the AC3 test
// notes for window.location.reload), so the durable seam is a PURE, synchronous URL
// builder the click handler delegates to — asserted here without any navigation.
type BuildOnboardingUrl = (
  url: string,
  opts: { apiKey?: string; operatorName?: string; returnUrl?: string }
) => string;
const buildOnboardingUrl = (banner as unknown as { buildOnboardingUrl?: BuildOnboardingUrl })
  .buildOnboardingUrl;

const RETURN_KEY = 'beacio_return';
const READY_SHOWN_KEY = 'beacio_ready_shown';

/**
 * Render the banner for a given extension state. SB-PRD-03 requires
 * showInstallBanner to be state-aware (installed-inactive / per-site denied /
 * active); the `state` option does not exist on BannerOptions yet, so this
 * helper expresses the intended seam without breaking the test-suite compile.
 */
function showForState(state: string, opts: BannerOptions = {}): HTMLElement | null {
  return showInstallBanner({ mode: 'sheet', ...opts, ...{ state } } as BannerOptions);
}

function clearBeacioStorage(): void {
  try {
    localStorage.removeItem(RETURN_KEY);
    localStorage.removeItem('beacio_dismiss_until');
    localStorage.removeItem(READY_SHOWN_KEY);
  } catch {
    /* noop */
  }
}

/** Full rendered text of the banner currently in the DOM (normalised whitespace). */
function bannerText(): string {
  const el = document.getElementById('beacio-banner') || document.body;
  return (el.textContent || '').replace(/\s+/g, ' ');
}

describe('SB-PRD-03 install banner authors the iOS-26 enable + grant copy', () => {
  beforeEach(() => {
    clearBeacioStorage();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    removeInstallBanner();
    document.body.innerHTML = '';
    clearBeacioStorage();
  });

  it('AC1: names the per-origin grant GESTURE verbatim (aA -> Manage Extensions -> Allow Every Website)', () => {
    showInstallBanner({ mode: 'sheet', operatorName: 'Storz & Bickel' });
    const text = bannerText();

    // The address-bar gesture, not just a menu-item name.
    expect(text).toMatch(/\bAA\b|address bar/);
    expect(text).toContain('Manage Extensions');
    expect(text).toContain('Allow Every Website');
    // The first grant path (enable the extension in Settings) is also named.
    expect(text).toMatch(/Allow Extension|Safari Settings|Settings/);
  });

  it('AC3: the step summary reflects the real tapped sequence incl. website-access grant and the Bluetooth prompt', () => {
    showInstallBanner({ mode: 'sheet', operatorName: 'Storz & Bickel' });
    const text = bannerText();

    // Website-access grant step is present (the current 4-pill strip omits it).
    expect(text).toMatch(/allow website access|website access|Allow Every Website/i);
    // The first-scan Bluetooth permission step is named with its 'why'.
    expect(text).toMatch(/allow Bluetooth|Safari will ask.*Allow|tap Allow/i);
  });

  it('AC4: renders a VISIBLE return affordance whose href derives from beacio_return (not a silent clipboard write)', () => {
    const origin = 'https://app.storz-bickel.com/connect?session=abc';
    localStorage.setItem(
      RETURN_KEY,
      JSON.stringify({ url: origin, returnLink: origin, timestamp: Date.now() })
    );

    showInstallBanner({ mode: 'sheet', operatorName: 'Storz & Bickel' });

    const el = document.getElementById('beacio-banner')!;
    const returnLink = el.querySelector<HTMLAnchorElement>('a[href]');
    expect(returnLink).not.toBeNull();
    // The affordance targets the actual originating URL, not a bare generic label.
    expect(returnLink!.getAttribute('href')).toContain('app.storz-bickel.com');
    expect((returnLink!.textContent || '').trim().length).toBeGreaterThan(0);
    expect(bannerText()).not.toMatch(/Return to beacio App/);
  });

  // SB-PRD-07 AC4: the redirect into /setup must CARRY the operator identity and the
  // originating return URL as query params, so the guided setup page renders branded
  // ("Return to STORZ & BICKEL") instead of generic copy. Today redirectToOnboarding()
  // appends ONLY App Store ct/mt to apps.apple.com and NOTHING to the canonical
  // beacio.com/setup target, so the operator identity is dropped at the boundary.
  // This pins the param-threading at the pure URL-builder seam the click handler uses.
  it('AC4(SB-PRD-07): the onboarding redirect URL carries operatorName + the return origin into /setup', () => {
    expect(typeof buildOnboardingUrl).toBe('function');

    const operatorName = 'Storz & Bickel';
    const returnUrl = 'https://app.storz-bickel.com/connect?session=abc';
    const setupUrl = 'https://beacio.com/setup';

    const out = buildOnboardingUrl!(setupUrl, { operatorName, returnUrl });
    const parsed = new URL(out);

    // The guided /setup page receives the operator identity verbatim …
    expect(parsed.searchParams.get('operatorName')).toBe(operatorName);
    // … and the originating page so it can render a real "Return to <operator>" CTA.
    const carriedReturn =
      parsed.searchParams.get('return') ||
      parsed.searchParams.get('url') ||
      parsed.searchParams.get('from');
    expect(carriedReturn).toContain('app.storz-bickel.com');
    // It still targets the canonical setup page (no host hijack).
    expect(parsed.hostname).toBe('beacio.com');
    expect(parsed.pathname).toBe('/setup');
  });

  // SB-PRD-07 AC4 (regression guard): the App Store branch is UNCHANGED — campaign
  // ct/mt only, never an operatorName/return leak onto the apps.apple.com URL.
  it('AC4(SB-PRD-07): the App Store redirect keeps ct/mt only — no operatorName/return on apps.apple.com', () => {
    expect(typeof buildOnboardingUrl).toBe('function');

    const out = buildOnboardingUrl!('https://apps.apple.com/app/id6761301368', {
      apiKey: 'beacio_live_demo',
      operatorName: 'Storz & Bickel',
      returnUrl: 'https://app.storz-bickel.com/connect',
    });
    const parsed = new URL(out);

    expect(parsed.hostname).toBe('apps.apple.com');
    expect(parsed.searchParams.get('ct')).toBe('beacio_live_demo');
    expect(parsed.searchParams.get('mt')).toBe('8');
    // The App Store deep link must NOT carry the operator identity / return URL.
    expect(parsed.searchParams.has('operatorName')).toBe(false);
    expect(parsed.searchParams.has('return')).toBe(false);
  });

  // SB-SDK-12 AC4: the banner's App Store CTA must resolve to the id form
  // (apps.apple.com/app/id6761301368) so it survives the public App Store rename.
  // The threat is a caller (or a legacy default) supplying the NAME-slug form
  // `/app/<slug>/id6761301368`: if Apple's published slug differs from "beacio",
  // that path 404s / misleads. buildOnboardingUrl is the single CTA-construction
  // seam every click handler (#bc-install, #beacio-banner-install) delegates to,
  // so collapsing the slug HERE pins it for the whole banner. The sibling SB-PRD-07
  // case above only feeds an already-id-form URL, so the slug-stripping branch was
  // untested; this is the durable guard that no banner code path keeps a name slug.
  it('AC4(SB-SDK-12): buildOnboardingUrl collapses a NAME-slug App Store URL to the id form (id6761301368, no slug)', () => {
    expect(typeof buildOnboardingUrl).toBe('function');

    // A caller-supplied name-slug deep link — the exact 404/mislead vector.
    const out = buildOnboardingUrl!('https://apps.apple.com/app/beacio/id6761301368', {
      apiKey: 'beacio_live_demo',
    });
    const parsed = new URL(out);

    expect(parsed.hostname).toBe('apps.apple.com');
    // The constructed CTA still reaches the canonical app id …
    expect(out).toContain('id6761301368');
    // … but the `/app/<slug>/id…` name segment is stripped to the id form, so a
    // diverging Apple slug can never 404 the install CTA.
    expect(parsed.pathname).toBe('/app/id6761301368');
    expect(out).not.toMatch(/\/app\/[^/]+\/id/);
    // Campaign attribution is preserved on the collapsed URL (unchanged behavior).
    expect(parsed.searchParams.get('ct')).toBe('beacio_live_demo');
    expect(parsed.searchParams.get('mt')).toBe('8');
  });

  it('AC5: shows a once-only "beacio is ready -- tap Connect" success toast on the active transition', () => {
    // First active load: toast renders.
    const first = showForState('active');
    expect(first).not.toBeNull();
    expect(bannerText()).toMatch(/ready/i);
    expect(bannerText()).toMatch(/Connect/);

    removeInstallBanner();
    document.body.innerHTML = '';

    // Second active load (returning user): no toast, fast path.
    const second = showForState('active');
    expect(second).toBeNull();
    expect(bannerText()).not.toMatch(/ready/i);
  });

  it('AC6: renders DISTINCT guidance for installed-inactive vs per-site-denied vs ready', () => {
    showForState('installed-inactive');
    const inactive = bannerText();
    removeInstallBanner();
    document.body.innerHTML = '';
    clearBeacioStorage();

    showForState('denied');
    const denied = bannerText();
    removeInstallBanner();
    document.body.innerHTML = '';
    clearBeacioStorage();

    // installed-inactive -> guide to enabling the extension in Settings.
    expect(inactive).toMatch(/Allow Extension|Safari Settings|enable/i);
    // per-site-denied -> guide to the aA -> Allow Every Website gesture specifically.
    expect(denied).toContain('Allow Every Website');
    // The two states do not render identical copy.
    expect(inactive).not.toBe(denied);
  });

  // AC2 (CTA destination): the install CTA exists ONLY in the not-installed state
  // and routes to the canonical /setup flow; the half-onboarded states
  // (installed-inactive / denied) must NOT render an install button and must NOT
  // link anywhere on apps.apple.com — the exact "sent back to the App Store"
  // regression the rationale warns about. The pre-fix sheet showed #bc-install in
  // EVERY state, so this pins the state-aware CTA so it cannot silently return.
  it('AC2: install CTA -> /setup only on not-installed; no App Store CTA on installed-inactive/denied', () => {
    // not-installed: the install CTA is present and reaches the canonical setup URL
    // (the click handler navigates to the resolved onboarding URL, default SETUP_URL).
    showForState('not-installed');
    let el = document.getElementById('beacio-banner')!;
    expect(el.querySelector('#bc-install')).not.toBeNull();
    // The "how setup works" / "still stuck" affordances point at the /setup guide,
    // never a bare App Store search.
    const setupHrefs = Array.from(el.querySelectorAll<HTMLAnchorElement>('a[href]')).map((a) =>
      a.getAttribute('href')
    );
    expect(setupHrefs.some((h) => /beacio\.com\/setup/.test(h || ''))).toBe(true);
    removeInstallBanner();
    document.body.innerHTML = '';
    clearBeacioStorage();

    // installed-inactive + denied: NO install button, and nothing links to the
    // App Store — these states deep-link to enable/grant guidance, not back to
    // the store (the rationale's permanent-drop-off failure mode).
    for (const state of ['installed-inactive', 'denied']) {
      showForState(state);
      el = document.getElementById('beacio-banner')!;
      expect(el.querySelector('#bc-install')).toBeNull();
      const appStoreLinks = Array.from(el.querySelectorAll<HTMLAnchorElement>('a[href]')).filter(
        (a) => /apps\.apple\.com/.test(a.getAttribute('href') || '')
      );
      expect(appStoreLinks).toHaveLength(0);
      removeInstallBanner();
      document.body.innerHTML = '';
      clearBeacioStorage();
    }
  });
});

/**
 * SB-SDK-03: the DYNAMIC half — the install sheet is a LIVE affordance, not a
 * one-shot static render. The irreducibly-manual iOS-26 enable step
 * (project_ios26_safari_extension_settings_readonly) happens OUTSIDE the page in
 * Settings, so the visible sheet must (a) offer a "Reload page" control to
 * re-check after the user changes Settings, (b) re-check on foreground return
 * (visibilitychange) + on the BEACIO_EVENTS.READY signal using a BOUNDED poll
 * (battery safety — modeled on website-src/scripts/setup-verify.js), and
 * (c) remove itself the moment the extension goes active, with no manual reload.
 */
const BEACIO_READY_EVENT = 'beacio:ready';

function dispatchReady(): void {
  window.dispatchEvent(new CustomEvent(BEACIO_READY_EVENT));
}

function fireVisible(): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('SB-SDK-03 install sheet is a live, self-clearing affordance', () => {
  beforeEach(() => {
    clearBeacioStorage();
    document.body.innerHTML = '';
    delete document.documentElement.dataset.beacioExtension;
  });

  afterEach(() => {
    removeInstallBanner();
    document.body.innerHTML = '';
    delete document.documentElement.dataset.beacioExtension;
    clearBeacioStorage();
    jest.useRealTimers();
  });

  // AC3: every non-active state must expose a dedicated "Reload page" RE-CHECK
  // control (so the user can re-check after changing Settings without manual
  // navigation). jsdom 26 makes window.location.reload un-spyable, so the durable
  // assertion is on the control's PRESENCE + WIRING: it is an actionable element
  // (button/anchor with an id, not just step prose) whose click triggers the live
  // re-check — proven by the marker-already-active → self-clear in AC4/AC5 below.
  it.each(['not-installed', 'installed-inactive', 'denied'])(
    'AC3: state %s renders a dedicated, actionable "Reload page" re-check control',
    (state) => {
      showForState(state);
      const el = document.getElementById('beacio-banner');
      expect(el).not.toBeNull();

      // An ACTIONABLE control whose own label is "reload" — not a step <li> that
      // merely contains the word "reload" ("Return and reload").
      const controls = Array.from(el!.querySelectorAll<HTMLElement>('button, a'));
      const reloadCtl = controls.find((c) => /reload/i.test((c.textContent || '').trim()));
      expect(reloadCtl).toBeDefined();
      // It must be a first-class interactive element, distinct from the step list.
      expect(['BUTTON', 'A']).toContain(reloadCtl!.tagName);
      expect(reloadCtl!.closest('.bc-steps, ol, li')).toBeNull();
    }
  );

  // AC4 + AC5: a visible installed-inactive sheet listens for activation and
  // removes itself when the extension goes active — no manual reload.
  it('AC4/AC5: installed-inactive sheet auto-removes when data-beacioExtension flips + READY fires', () => {
    showForState('installed-inactive');
    expect(document.getElementById('beacio-banner')).not.toBeNull();

    // Simulate the user enabling the extension in Settings and returning: the
    // content script sets the active marker, injected.js dispatches READY.
    document.documentElement.dataset.beacioExtension = 'true';
    dispatchReady();

    expect(document.getElementById('beacio-banner')).toBeNull();
  });

  it('AC4/AC5: installed-inactive sheet auto-removes on foreground return (visibilitychange) once active', () => {
    showForState('installed-inactive');
    expect(document.getElementById('beacio-banner')).not.toBeNull();

    // Marker flips while the tab is backgrounded; the re-check happens when the
    // user foregrounds Safari again (visibilitychange), not via READY.
    document.documentElement.dataset.beacioExtension = 'true';
    fireVisible();

    expect(document.getElementById('beacio-banner')).toBeNull();
  });

  // AC4: the foreground re-check poll is BOUNDED — if the extension never goes
  // active, the sheet stays put AND no interval/timeout is left running (battery).
  it('AC4: the re-check poll is bounded and leaves no live timers when activation never happens', () => {
    jest.useFakeTimers();
    showForState('installed-inactive');
    expect(document.getElementById('beacio-banner')).not.toBeNull();

    // Foreground return with NO active marker: the bounded poll runs and gives up.
    fireVisible();
    jest.advanceTimersByTime(60000);

    // Still showing (never went active) and no leaked timer keeps firing.
    expect(document.getElementById('beacio-banner')).not.toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  // SB-NAT-01 regression (2026-07-21 device evidence): on the session-first load
  // the appex is COLD, so the injected polyfill announces itself AFTER detect's
  // 2s poll window — initBeacio renders the installed-inactive sheet, and then
  // the ONLY same-load activation signal is the extension's own in-page handshake
  // event BEACIO_EVENTS.EXTENSION_READY ('beacio:extension:ready'). The
  // package-lifecycle 'beacio:ready' can NEVER fire in that load (it is
  // dispatched solely by initBeacio's active path, which by construction did not
  // run), and visibilitychange never fires in a foregrounded Safari session — so
  // a sheet deaf to EXTENSION_READY sits over the operator's app forever and
  // swallows the Connect tap (the observed 60s chooser-row timeout).
  it('SB-NAT-01: sheet tears down on the extension in-page handshake (beacio:extension:ready)', () => {
    showForState('installed-inactive');
    expect(document.getElementById('beacio-banner')).not.toBeNull();

    // The polyfill goes live: it sets the active marker and dispatches its
    // OWN handshake event — NOT 'beacio:ready'.
    document.documentElement.dataset.beacioExtension = 'true';
    window.dispatchEvent(new CustomEvent('beacio:extension:ready'));

    expect(document.getElementById('beacio-banner')).toBeNull();
  });

  it('SB-NAT-01: absorbs the handshake-before-marker ordering race via the bounded re-check', () => {
    jest.useFakeTimers();
    showForState('installed-inactive');
    expect(document.getElementById('beacio-banner')).not.toBeNull();

    // Event arrives a beat before the marker write lands.
    window.dispatchEvent(new CustomEvent('beacio:extension:ready'));
    expect(document.getElementById('beacio-banner')).not.toBeNull();

    document.documentElement.dataset.beacioExtension = 'true';
    jest.advanceTimersByTime(2000);

    expect(document.getElementById('beacio-banner')).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });
});

/**
 * SB-PRD-08 AC3 (2026-07-21 device evidence): `forceShow: true` marks a
 * USER-INITIATED recovery gesture ("Can't connect?" / a Connect-tap fallback /
 * the E2E selector-liveness control page). Such a sheet must not only bypass the
 * dismissal cooldown — it must also be EXEMPT from the live self-clearing
 * lifecycle, because on a device where the extension markers already read
 * 'active' the automatic clearIfActive() removed the explicitly requested sheet
 * in the same tick, rendering the affordance blank (hardware-observed on
 * sb-control-noinject.html: showInstallBanner rendered nothing at all).
 */
describe('SB-PRD-08 AC3: a forceShow sheet is user-initiated and persists', () => {
  beforeEach(() => {
    clearBeacioStorage();
    document.body.innerHTML = '';
    delete document.documentElement.dataset.beacioExtension;
  });

  afterEach(() => {
    removeInstallBanner();
    document.body.innerHTML = '';
    delete document.documentElement.dataset.beacioExtension;
    clearBeacioStorage();
  });

  it('renders and PERSISTS on a page where the extension is already active', () => {
    // The healthy-device shape: content script set the active marker BEFORE the
    // user asked for guidance.
    document.documentElement.dataset.beacioExtension = 'true';

    const el = showInstallBanner({
      mode: 'sheet',
      operatorName: 'STORZ & BICKEL Web App',
      forceShow: true,
    });

    expect(el).not.toBeNull();
    expect(document.getElementById('beacio-banner')).not.toBeNull();

    // Neither activation signal may tear down an explicitly requested sheet.
    window.dispatchEvent(new CustomEvent('beacio:extension:ready'));
    window.dispatchEvent(new CustomEvent('beacio:ready'));
    expect(document.getElementById('beacio-banner')).not.toBeNull();
  });

  it('keeps the explicit dismiss controls on the persistent sheet (manual close stays possible)', () => {
    document.documentElement.dataset.beacioExtension = 'true';
    showInstallBanner({ mode: 'sheet', operatorName: 'X', forceShow: true });
    // Click wiring is attached on rAF (pinned by the SB-PRD-08 dismissal tests);
    // the durable assertion here is that both dismiss controls EXIST on a sheet
    // that no longer auto-clears.
    expect(document.querySelector('#bc-dismiss')).not.toBeNull();
    expect(document.querySelector('#bc-dont-show')).not.toBeNull();
  });
});


/**
 * SB-SDK-11: the install sheet is themeable (tier-2 co-brand). For a premium
 * partner (Storz & Bickel) the default Apple-blue, beacio-logo, "Set Up Bluetooth"
 * modal injected into THEIR site is the most visible objection to the free
 * integration. The prompt is already isolated in @beacio/detect, so the fix is
 * purely ADDITIVE (zero-consumer SDK): optional accentColor / brandLogoUrl
 * (URL-only, validated to forbid javascript: injection) / deviceName + copy
 * overrides flow through showBottomSheet (and showBarBanner). Plus two trust
 * surfaces the medical market needs: the "No data collected" line is surfaced
 * VISIBLY (not only the collapsed <details>) and a "not affiliated with the
 * device maker" microcopy line is always present.
 *
 * These FAIL on the current tree: the option fields do not exist (TS compile
 * error) and the themed DOM / visible-privacy / no-affiliation nodes are absent.
 */
const DEFAULT_ACCENT = '#007aff';
// The beacio default icon is an inline <svg>; a themed prompt swaps it for an <img>.
const BEACIO_DEFAULT_BODY =
  'Follow the steps below to enable Bluetooth and return to {operator}.';

/** The themed sheet's root node, where --bc-accent / accent styling lives. */
function sheetEl(): HTMLElement {
  return document.getElementById('beacio-banner') as HTMLElement;
}

describe('SB-SDK-11 themeable install prompt (tier-2 co-brand)', () => {
  beforeEach(() => {
    clearBeacioStorage();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    removeInstallBanner();
    document.body.innerHTML = '';
    clearBeacioStorage();
  });

  it('AC1/AC2: applies the partner accent + logo <img> + device-specific copy (no default beacio theme)', () => {
    showInstallBanner({
      mode: 'sheet',
      operatorName: 'STORZ & BICKEL',
      accentColor: '#c8102e',
      brandLogoUrl: 'https://app.storz-bickel.com/logo-sb.svg',
      deviceName: 'VOLCANO HYBRID',
      body: 'Connect your VOLCANO HYBRID in Safari to control it from app.storz-bickel.com.',
    });
    const el = sheetEl();
    expect(el).not.toBeNull();
    const html = el.innerHTML;

    // (1) THEME-APPLIED — the partner accent is routed through a CSS variable so
    // every accent rule switches to var(--bc-accent); the default Apple-blue is
    // gone from the sheet markup entirely.
    expect(html).toMatch(/--bc-accent:\s*#c8102e/i);
    expect(html.toLowerCase()).not.toContain(DEFAULT_ACCENT);

    // (2) the operator logo renders as an <img> whose src is the brandLogoUrl, and
    // the hard-coded beacio inline <svg> chrome icon is gone.
    const img = el.querySelector<HTMLImageElement>('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('https://app.storz-bickel.com/logo-sb.svg');
    expect(el.querySelector('.bc-ic svg')).toBeNull();

    // (3) the device-specific / overridden copy is shown verbatim (esc preserved).
    expect(el.textContent || '').toContain('VOLCANO HYBRID');
    expect(el.textContent || '').toContain('Connect your VOLCANO HYBRID in Safari');
    // …and the default beacio body is NOT present (it was overridden).
    expect(el.textContent || '').not.toContain('install beacio, open the app once');
  });

  it('AC3: surfaces a VISIBLE privacy line (outside <details>) + a "not affiliated" microcopy line', () => {
    showInstallBanner({
      mode: 'sheet',
      operatorName: 'STORZ & BICKEL',
      accentColor: '#c8102e',
      deviceName: 'VOLCANO HYBRID',
    });
    const el = sheetEl();

    // A visible "No data collected" reassurance line that is NOT nested under the
    // collapsed <details class="bc-det"> (medical-market trust angle).
    const visiblePrivacy = Array.from(el.querySelectorAll<HTMLElement>('*')).find(
      (n) =>
        /no data collected|processed locally|stays on your|never collected/i.test(
          n.textContent || ''
        ) && n.closest('.bc-det') === null
    );
    expect(visiblePrivacy).toBeDefined();

    // A "not affiliated with the device maker" microcopy line (no-affiliation rule).
    expect(el.textContent || '').toMatch(/not affiliated|not made by|independent/i);
    // No App-Store-approved/cleared/audited language (feedback_no_app_store_status_claims).
    expect(el.textContent || '').not.toMatch(/approved|cleared|audited|reviewed by/i);
  });

  it('AC2 (injection guard): a non-http brandLogoUrl (javascript:/data:) renders NO <img> with that src', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'ftp://x/y.svg']) {
      showInstallBanner({
        mode: 'sheet',
        operatorName: 'STORZ & BICKEL',
        accentColor: '#c8102e',
        brandLogoUrl: bad,
      });
      const el = sheetEl();
      const imgs = Array.from(el.querySelectorAll<HTMLImageElement>('img'));
      // The dangerous URL is dropped — no <img> carries it as its src.
      expect(imgs.some((i) => (i.getAttribute('src') || '') === bad)).toBe(false);
      // Falling back to the default beacio icon (the inline <svg>) is acceptable.
      removeInstallBanner();
      document.body.innerHTML = '';
      clearBeacioStorage();
    }
  });

  it('REGRESSION: omitting theme props preserves the default beacio theme + EN copy unchanged', () => {
    showInstallBanner({ mode: 'sheet', operatorName: 'X' });
    const el = sheetEl();
    const html = el.innerHTML;

    // Default Apple-blue accent still present; no partner accent variable override.
    expect(html.toLowerCase()).toContain(DEFAULT_ACCENT);
    // The default beacio inline <svg> chrome icon is present and there is NO <img>.
    expect(el.querySelector('.bc-ic svg')).not.toBeNull();
    expect(el.querySelector('img')).toBeNull();
    // Copy is the EN pack (operator interpolated), not an override.
    expect(el.textContent || '').toContain(BEACIO_DEFAULT_BODY.replace('{operator}', 'X'));
  });
});

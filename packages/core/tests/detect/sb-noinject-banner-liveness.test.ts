/**
 * SB cross-wire (fast half) — the on-device selector-liveness control page
 * (outreach/storz-bickel/integration-demo/app/sb-control-noinject.html) exists to
 * prove that the Swift injection oracle's banner SELECTORS
 * (StorzBickelWebE2ETests.installBannerHeading / installBannerBodyFragment) can
 * match a real, currently-rendered beacio banner. This test is the fast, gated
 * mirror of that device oracle, and it runs against the exact bytes the device
 * loads: the VENDORED drop-in bundle (js/vendor/beacio-detect.js, digest-gated by
 * vendor:sb:check) driven by the exact showInstallBanner(...) call extracted from
 * the control page's own source — so neither side can drift from the other.
 *
 * 2026-07-21 device evidence (testInstallBannerSelectorIsLive_crossWire RED): on
 * a healthy device the content script sets the ACTIVE markers on every https
 * origin (all-sites grant), and the state-aware live sheet self-cleared the
 * control page's banner in the same tick — the old "gated ONLY by isDismissed()"
 * premise was stale. The control page therefore must pass `forceShow: true`
 * (SB-PRD-08 AC3: a user-initiated/forced sheet renders AND persists regardless
 * of dismissal state and install-state markers), and this test replays that
 * against the ACTIVE-marker shape that broke on hardware.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const CONTROL_PAGE = resolve(
  REPO_ROOT,
  'outreach/storz-bickel/integration-demo/app/sb-control-noinject.html'
);
const VENDORED_DETECT = resolve(
  REPO_ROOT,
  'outreach/storz-bickel/integration-demo/app/js/vendor/beacio-detect.js'
);

// The Swift selectors this cross-wire keeps honest — verbatim from
// Tests/BeacioUITests/StorzBickelWebE2ETests.swift (installBannerHeading /
// installBannerBodyFragment; both matched with CONTAINS[c], i.e. case-insensitive).
const SWIFT_HEADING = 'Set Up Bluetooth in Safari';
const SWIFT_BODY_FRAGMENT = /install beacio/i;

/**
 * The control page's literal showInstallBanner argument object, as source text.
 * HTML comments are stripped first: the page's header documentation quotes the
 * call, and only the executable <script> occurrence is the contract.
 */
function extractControlPageCall(): string {
  const html = readFileSync(CONTROL_PAGE, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const matches = [...html.matchAll(/showInstallBanner\((\{[\s\S]*?\})\)/g)];
  expect(matches).toHaveLength(1);
  return matches[0]![1]!;
}

type BeacioDetectGlobal = {
  showInstallBanner: (options: Record<string, unknown>) => HTMLElement | null;
};

function loadVendoredDetect(): BeacioDetectGlobal {
  const bundle = readFileSync(VENDORED_DETECT, 'utf8');
  // The vendored bundle is the classic-<script> IIFE (globalName beacioDetect).
  // A real <script> tag runs it as sloppy-mode global code, so its top-level
  // `var beacioDetect` lands on window; an indirect eval of STRICT code keeps
  // that var in the eval's own scope instead — so re-export it to window from
  // INSIDE the same eval scope (newline-prefixed in case the bundle ends in a
  // line comment).
  (window as unknown as { eval: (code: string) => void }).eval(
    `${bundle}\nwindow.beacioDetect = beacioDetect;`
  );
  const g = (window as unknown as { beacioDetect?: BeacioDetectGlobal }).beacioDetect;
  expect(g).toBeDefined();
  return g!;
}

function clearBeacioStorage(): void {
  try {
    localStorage.removeItem('beacio_return');
    localStorage.removeItem('beacio_dismiss_until');
    localStorage.removeItem('beacio_ready_shown');
  } catch {
    /* noop */
  }
}

describe('SB cross-wire: control page + vendored bundle render a selector-matching, persistent banner', () => {
  beforeEach(() => {
    clearBeacioStorage();
    document.body.innerHTML = '';
    // The hardware shape that broke the device oracle: extension ACTIVE on this
    // origin (all-sites grant), markers set before the page script runs.
    document.documentElement.dataset.beacioExtension = 'true';
  });

  afterEach(() => {
    document.getElementById('beacio-banner')?.remove();
    document.body.innerHTML = '';
    delete document.documentElement.dataset.beacioExtension;
    clearBeacioStorage();
  });

  it('the control page pins forceShow: true (the only deterministic render on a healthy device)', () => {
    const argsLiteral = extractControlPageCall();
    const args = new Function(`return (${argsLiteral});`)() as Record<string, unknown>;
    expect(args.forceShow).toBe(true);
    expect(args.operatorName).toBe('STORZ & BICKEL Web App');
  });

  it('replaying the control page call against the vendored bundle yields a PERSISTENT banner matching the Swift selectors', () => {
    const beacioDetect = loadVendoredDetect();
    const argsLiteral = extractControlPageCall();
    const args = new Function(`return (${argsLiteral});`)() as Record<string, unknown>;

    const el = beacioDetect.showInstallBanner(args);
    expect(el).not.toBeNull();

    const banner = document.getElementById('beacio-banner');
    expect(banner).not.toBeNull();
    const text = (banner!.textContent || '').replace(/\s+/g, ' ');
    expect(text).toContain(SWIFT_HEADING);
    expect(text).toMatch(SWIFT_BODY_FRAGMENT);

    // The live-teardown signals (unit SB-NAT-01) must not clear the forced
    // control sheet — the device test polls it for up to 15s.
    window.dispatchEvent(new CustomEvent('beacio:extension:ready'));
    window.dispatchEvent(new CustomEvent('beacio:ready'));
    expect(document.getElementById('beacio-banner')).not.toBeNull();
  });
});

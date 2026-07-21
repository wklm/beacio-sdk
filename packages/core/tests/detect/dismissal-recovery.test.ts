/**
 * SB-PRD-08: soften the 14-day banner dismissal and keep a persistent recovery
 * path for interested-but-not-ready users.
 *
 * The pre-fix funnel had ONE suppression primitive (install-state.dismiss(days),
 * default 14) wired identically to every dismiss gesture — the sheet "Not now",
 * the backdrop click, and the bar close — so a single tap silenced ALL onboarding
 * guidance for two weeks, and showInstallBanner had NO way to re-open the flow
 * inside that window. For a considered EUR300-700 hardware purchase (Storz &
 * Bickel) that converts a warm lead to a churned one.
 *
 * This pins, so they cannot silently regress:
 *  - AC1: dismissal distinguishes a SHORT "Not now" suppression from a LONG,
 *    explicit "Don't show again" suppression (two distinct windows).
 *  - AC2/AC3: a force/ignore-dismissal flag on showInstallBanner re-opens the flow
 *    for a dismissed user (the Connect-gesture recovery path), while the passive
 *    on-load banner still honours the cooldown so it is not nagging.
 *  - install-state: a short-suppression primitive writes a <=1-day window distinct
 *    from the long dismiss(days) window, and the long dismiss(days) path is
 *    unchanged.
 *  - AC4 (regression guard): the EDITABLE S&B fork's "Can't connect?" link is
 *    repointed off the stale, disabled support page and re-invokes the in-app
 *    activation flow. Scoped to integration-demo/ ONLY — captured/ is the pristine,
 *    tripwire-protected vendor snapshot and is never read or edited here.
 *
 * jsdom; mirrors banner.test.ts / install-state.test.ts import style
 * (`@jest/globals`). Run via
 *   npx jest --config packages/detect/jest.config.js --rootDir packages/detect
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

// Node builtins via require() (ts-jest emits CommonJS), typed by @types/node
// through tests/tsconfig.json.
const { readFileSync } = require('fs');
const { join } = require('path');
import { removeInstallBanner, showInstallBanner } from '../../src/detect/banner';
import {
  dismiss,
  dismissShort,
  isDismissed,
  SHORT_DISMISS_DAYS,
} from '../../src/detect/install-state';
import { EN_STRINGS } from '../../src/detect/i18n';

const DISMISS_KEY = 'beacio_dismiss_until';

function clearBeacioStorage(): void {
  try {
    localStorage.removeItem(DISMISS_KEY);
    localStorage.removeItem('beacio_return');
    localStorage.removeItem('beacio_ready_shown');
  } catch {
    /* noop */
  }
}

/** The currently-stored suppression window in days (NaN when none is set). */
function dismissWindowDays(): number {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return NaN;
  return (parseInt(raw, 10) - Date.now()) / 86400000;
}

/**
 * The sheet wires its dismiss controls inside a requestAnimationFrame callback
 * (banner.ts), so a click dispatched in the same synchronous tick would find no
 * listener attached. Flush one rAF tick before interacting with #bc-dismiss /
 * #bc-dont-show. jsdom implements rAF on the real timer queue.
 */
function flushRaf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('SB-PRD-08 soft/hard dismissal split + force-show recovery', () => {
  beforeEach(() => {
    clearBeacioStorage();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    removeInstallBanner();
    document.body.innerHTML = '';
    clearBeacioStorage();
  });

  // ── install-state: the two suppression primitives ─────────────────────────

  it('AC1/AC5: dismissShort() writes a SHORT (<=1 day) window distinct from the long dismiss() window', () => {
    dismissShort();
    const shortDays = dismissWindowDays();
    expect(shortDays).toBeLessThanOrEqual(1);
    expect(shortDays).toBeGreaterThan(0);
    // The exported short constant is the source of truth and is genuinely short.
    expect(SHORT_DISMISS_DAYS).toBeLessThanOrEqual(1);
    expect(shortDays).toBeCloseTo(SHORT_DISMISS_DAYS, 1);

    clearBeacioStorage();

    // The long, explicit path still suppresses for ~14 days (default unchanged).
    dismiss();
    const longDays = dismissWindowDays();
    expect(longDays).toBeGreaterThan(7);
    // The two windows are materially different (soft != hard).
    expect(longDays).toBeGreaterThan(shortDays + 1);
  });

  it('long dismiss(days) window is unchanged', () => {
    dismiss(14);
    expect(dismissWindowDays()).toBeGreaterThan(7);
    expect(isDismissed()).toBe(true);
  });

  // ── banner gestures map to the right window ───────────────────────────────

  it('AC1: "Not now" (#bc-dismiss) sets a SHORT window; "Don\'t show again" sets a LONG window', async () => {
    // "Not now" — the soft dismissal.
    showInstallBanner({ mode: 'sheet', operatorName: 'Storz & Bickel' });
    await flushRaf();
    const sheet = document.getElementById('beacio-banner')!;
    sheet.querySelector<HTMLElement>('#bc-dismiss')!.click();
    const softDays = dismissWindowDays();
    expect(softDays).toBeLessThanOrEqual(1);
    expect(softDays).toBeGreaterThan(0);

    removeInstallBanner();
    document.body.innerHTML = '';
    clearBeacioStorage();

    // "Don't show again" — the explicit hard dismissal, a DISTINCT control.
    showInstallBanner({ mode: 'sheet', operatorName: 'Storz & Bickel' });
    await flushRaf();
    const sheet2 = document.getElementById('beacio-banner')!;
    const hardCtl = sheet2.querySelector<HTMLElement>('#bc-dont-show');
    expect(hardCtl).not.toBeNull();
    hardCtl!.click();
    const hardDays = dismissWindowDays();
    expect(hardDays).toBeGreaterThan(7);
    expect(hardDays).toBeGreaterThan(softDays + 1);
  });

  // ── AC2/AC3: force-show re-opens the flow for a dismissed user ─────────────

  it('AC2/AC3: showInstallBanner({ forceShow: true }) renders even while dismissed; the default call is suppressed', () => {
    // Seed a still-active suppression window (as if the user tapped "Not now").
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 14 * 86400000));
    expect(isDismissed()).toBe(true);

    // The passive on-load banner still honours the cooldown (not nagging).
    const passive = showInstallBanner({ mode: 'sheet', operatorName: 'Storz & Bickel' });
    expect(passive).toBeNull();
    expect(document.getElementById('beacio-banner')).toBeNull();

    // The Connect-gesture recovery path bypasses the cooldown.
    const forced = showInstallBanner({
      mode: 'sheet',
      operatorName: 'Storz & Bickel',
      forceShow: true,
    });
    expect(forced).not.toBeNull();
    expect(document.getElementById('beacio-banner')).not.toBeNull();
  });

  // ── i18n: the new copy leaves exist on the EN pack (parity test forces DE) ─

  it('i18n: EN_STRINGS exposes the explicit "Don\'t show again" copy leaf', () => {
    expect(typeof EN_STRINGS.dontShowAgain).toBe('string');
    expect(EN_STRINGS.dontShowAgain.trim().length).toBeGreaterThan(0);
  });
});

// ── AC1/AC5: the soft-dismissal primitive is on the PACKAGE-ROOT headless API ─
//
// install-state.ts is, by its own contract (its module header + index.ts), the
// zero-DOM headless onboarding surface re-exported from the package root so a
// vanilla-JS partner (S&B is vanilla JS + jQuery and cannot use the React wizard)
// draws its OWN "Enable Bluetooth in Safari" card and drives it with these
// primitives. SB-PRD-08's whole point is the soft/hard split, but the barrel
// re-exported ONLY the long `dismiss`/`isDismissed` — a partner could fire the
// 14-day hammer or hand-write the internal localStorage key, but could NOT call
// the soft "Not now" (dismissShort) or read the documented window lengths. This
// pins the soft primitive + both default constants onto the public root so the
// headless surface is symmetric and cannot silently regress to long-only.
describe('SB-PRD-08 AC1/AC5: the soft-dismissal primitive is part of the public headless API', () => {
  it('re-exports dismissShort + the window-length constants from the package root (not just src/install-state)', async () => {
    // Import from the BARREL (../src/index), not ../src/install-state, so this is
    // RED until index.ts re-exports the soft-dismissal surface.
    const root = await import('../../src/detect/index');
    expect(typeof root.dismissShort).toBe('function');
    expect(typeof root.SHORT_DISMISS_DAYS).toBe('number');
    expect(typeof root.DEFAULT_DISMISS_DAYS).toBe('number');
    // The soft window is genuinely short and strictly shorter than the long default.
    expect(root.SHORT_DISMISS_DAYS).toBeLessThanOrEqual(1);
    expect(root.DEFAULT_DISMISS_DAYS).toBeGreaterThan(root.SHORT_DISMISS_DAYS);
  });

  it('the root dismissShort writes the SAME short window a partner card needs (zero-DOM)', async () => {
    const root = await import('../../src/detect/index');
    root.dismissShort();
    const days = dismissWindowDays();
    expect(days).toBeLessThanOrEqual(1);
    expect(days).toBeGreaterThan(0);
    expect(root.isDismissed()).toBe(true);
    // The headless bookkeeping draws no beacio chrome — a partner owns the UI.
    expect(document.getElementById('beacio-banner')).toBeNull();
    expect(document.body.children.length).toBe(0);
  });
});

// ── AC4 regression guard: the EDITABLE fork's "Can't connect?" link ──────────
//
// SB-PRD-02/07 already repointed the fork; this guard prevents a revert to the
// stale, disabled support page. It reads ONLY the editable integration-demo copy
// — NEVER captured/ (the pristine, tripwire-protected vendor "before" snapshot).
describe('SB-PRD-08 AC4: S&B demo "Can\'t connect?" link is repointed (editable fork only)', () => {
  const demoIndex = join(
    __dirname,
    '../../../../outreach/storz-bickel/integration-demo/app/index.html'
  );

  it('the editable fork does NOT LINK to the stale storz-bickel troubleshooting page', () => {
    const html = readFileSync(demoIndex, 'utf8');
    // Match the stale URL only inside a real LINK attribute value (href/url=
    // "...troubleshooting..."), so the explanatory comment that NAMES the old
    // page (to document the repoint) does not false-flag this guard.
    expect(html).not.toMatch(
      /(?:href|url)\s*=\s*["'][^"']*storz-bickel\.com[^"']*\/web\/troubleshooting/i
    );
  });

  it('the #cantConnectLink re-invokes the in-app beacio activation flow', () => {
    const html: string = readFileSync(demoIndex, 'utf8');
    expect(html).toContain('id="cantConnectLink"');
    // The recovery handler hands off to the beacio onboarding (initBeacio /
    // showInstallBanner) rather than a dead external support URL.
    const linkLine = html
      .split('\n')
      .find((l: string) => l.includes('id="cantConnectLink"'));
    expect(linkLine).toBeDefined();
    expect(linkLine!).toMatch(/beacioDetect\.(initBeacio|showInstallBanner)/);
  });
});

/**
 * SB-SDK-07 — the localized-string (i18n) seam for @beacio/detect.
 *
 * The install banner is the SINGLE end-user-facing onboarding screen that
 * replaces S&B's Bluefy alert, and today it is hardcoded English: BannerOptions
 * exposes only `text`/`buttonText` overrides, and every other visible token
 * (STATE_COPY title/body, the SETUP_STEPS pills, the dismiss label, the two
 * <details> summaries+bodies, the return/clipboard/reload affordances, the ready
 * toast) is a hardcoded English literal. S&B is HQ'd in Bayreuth and its German
 * users would see English at the make-or-break moment. error-presenter.ts
 * (SB-SDK-05) already foreshadows this seam in its own header ("the i18n seam
 * SB-SDK-07 later converges on") but its `strings` override is NOT lang-aware:
 * no `lang` field, no built-in German pack, no navigator.language derivation.
 *
 * This is that missing seam's GUARD. It pins:
 *   (1) showInstallBanner({ lang: 'de', … }) renders the German title/body/
 *       button/dismiss copy AND leaks NO hardcoded English token into the DOM;
 *   (2) the selection policy — explicit `lang` always wins; with no explicit
 *       lang, navigator.language='de-DE' selects the German pack; explicit
 *       lang='en' overrides back to English (AC2);
 *   (3) byte-identical English regression — no lang/strings supplied ⇒ rendered
 *       text equals today's English defaults (AC3, no regression for callers);
 *   (4) exhaustive pack parity — the `de` pack defines EXACTLY the keys the `en`
 *       pack defines, so a future English-only string cannot silently bypass
 *       i18n (the durable drift guard, analogous to EVERY_CODE in
 *       error-presenter-core-parity.test.ts);
 *   (5) presentError(coded error, { lang: 'de' }) renders German per-code copy +
 *       German dismiss/retry from the SAME shared module (AC4 shared seam).
 *
 * This test FAILS today: `../src/i18n` does not exist, BannerOptions and
 * PresentErrorOptions have no `lang` field (ts-jest compile error), and the
 * English strings render — so it captures THIS issue and becomes the regression
 * fence. The fix makes it pass while the existing detect suite stays green.
 *
 * jsdom; @jest/globals import style (project_jest_globals_import_gotcha) — `npm
 * run typecheck` compiles .test.ts but omits jest from `types`. Run via
 *   npx jest --config packages/detect/jest.config.js --rootDir packages/detect i18n
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { type BannerOptions, removeInstallBanner, showInstallBanner } from '../src/banner';
import { presentError } from '../src/error-presenter';
// SB-SDK-07: the shared locale module the banner + error presenter both consume.
// Does not exist yet — this import is the first reason the suite is RED.
import {
  DE_STRINGS,
  EN_STRINGS,
  type LocaleStrings,
  resolveStrings,
} from '../src/i18n';

const DISMISS_KEY = 'beacio_dismiss_until';
const RETURN_KEY = 'beacio_return';
const READY_SHOWN_KEY = 'beacio_ready_shown';

function clearBeacioStorage(): void {
  try {
    localStorage.removeItem(RETURN_KEY);
    localStorage.removeItem(DISMISS_KEY);
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

/** Full rendered text of the error card currently in the DOM. */
function errorCardText(): string {
  const el = document.getElementById('beacio-error') || document.body;
  return (el.textContent || '').replace(/\s+/g, ' ');
}

/**
 * Render a banner for a given state with the given options. `state` is widened
 * through BannerOptions exactly as banner.test.ts does (showForState idiom).
 */
function showForState(state: string, opts: BannerOptions = {}): HTMLElement | null {
  return showInstallBanner({ mode: 'sheet', ...opts, ...{ state } } as BannerOptions);
}

/**
 * Stub navigator.language for the derivation-policy assertions (AC2). jsdom lets
 * us redefine it per-test; restored in afterEach so no cross-test bleed.
 */
function setNavigatorLanguage(value: string | undefined): void {
  Object.defineProperty(navigator, 'language', {
    configurable: true,
    get: () => value,
  });
}

const HARDCODED_ENGLISH_TOKENS = [
  'Start Setup',
  'Not now',
  'How does setup work?',
  'Privacy: No data collected',
  'Reload page to re-check',
  'Still stuck?',
  'Set Up Bluetooth in Safari',
];

describe('SB-SDK-07 — @beacio/detect localized-string seam', () => {
  let originalLanguage: PropertyDescriptor | undefined;

  beforeEach(() => {
    clearBeacioStorage();
    document.body.innerHTML = '';
    delete document.documentElement.dataset.beacioExtension;
    originalLanguage = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(navigator),
      'language'
    );
  });

  afterEach(() => {
    removeInstallBanner();
    document.getElementById('beacio-error')?.remove();
    document.body.innerHTML = '';
    clearBeacioStorage();
    if (originalLanguage) {
      Object.defineProperty(Object.getPrototypeOf(navigator), 'language', originalLanguage);
    }
  });

  // ── AC4 (drift guard): exhaustive pack parity ─────────────────────────────
  // The `de` pack must define EXACTLY the same keys as the `en` pack (deep, over
  // the nested `states`/`steps`/`error` maps), so a future English-only string
  // cannot silently bypass i18n. This is the structural analogue of the
  // compile-time EVERY_CODE Record in error-presenter-core-parity.test.ts.
  describe('AC4: built-in packs are key-exhaustive (no string can bypass i18n)', () => {
    // Flatten a locale pack to a sorted list of dotted key paths, ignoring the
    // leaf string VALUES (those legitimately differ per language) — only the
    // SHAPE must match. Step labels live in an array; key by index.
    function keyPaths(obj: unknown, prefix = ''): string[] {
      if (Array.isArray(obj)) {
        return obj.flatMap((v, i) => keyPaths(v, `${prefix}[${i}]`));
      }
      if (obj && typeof obj === 'object') {
        return Object.keys(obj as Record<string, unknown>)
          .sort()
          .flatMap((k) =>
            keyPaths((obj as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k)
          );
      }
      return [prefix]; // leaf
    }

    it('the de pack defines every key the en pack defines (and vice versa)', () => {
      const en = keyPaths(EN_STRINGS).sort();
      const de = keyPaths(DE_STRINGS).sort();
      expect(de).toEqual(en);
      // Sanity: a plausibly-rich pack, so an emptied object cannot pass vacuously.
      expect(en.length).toBeGreaterThanOrEqual(15);
    });

    it('every en leaf is a non-empty string and every de leaf is a non-empty string', () => {
      const assertNonEmptyLeaves = (obj: unknown): void => {
        if (Array.isArray(obj)) return obj.forEach(assertNonEmptyLeaves);
        if (obj && typeof obj === 'object') {
          return Object.values(obj as Record<string, unknown>).forEach(assertNonEmptyLeaves);
        }
        expect(typeof obj).toBe('string');
        expect((obj as string).trim().length).toBeGreaterThan(0);
      };
      assertNonEmptyLeaves(EN_STRINGS);
      assertNonEmptyLeaves(DE_STRINGS);
    });
  });

  // ── AC2: the selection policy is PURE and testable in isolation ───────────
  describe('AC2: resolveStrings selection policy (explicit > navigator.language > English)', () => {
    it('explicit lang="de" selects the German pack', () => {
      const r: LocaleStrings = resolveStrings({ lang: 'de' });
      expect(r).toEqual(DE_STRINGS);
    });

    it('navigator.language="de-DE" with NO explicit lang selects the German pack', () => {
      setNavigatorLanguage('de-DE');
      const r = resolveStrings({});
      expect(r.buttonText).toBe(DE_STRINGS.buttonText);
      expect(r).toEqual(DE_STRINGS);
    });

    it('explicit lang="en" OVERRIDES navigator.language="de-DE" back to English', () => {
      setNavigatorLanguage('de-DE');
      const r = resolveStrings({ lang: 'en' });
      expect(r).toEqual(EN_STRINGS);
    });

    it('an unknown language falls back to English', () => {
      setNavigatorLanguage('fr-FR');
      expect(resolveStrings({})).toEqual(EN_STRINGS);
      expect(resolveStrings({ lang: 'zz' })).toEqual(EN_STRINGS);
    });

    it('a partial `strings` override deep-merges over the selected pack', () => {
      const r = resolveStrings({ lang: 'de', strings: { buttonText: 'Loslegen!' } });
      // The override wins for the one field …
      expect(r.buttonText).toBe('Loslegen!');
      // … and every other field still comes from the German pack (not English).
      expect(r.dismiss).toBe(DE_STRINGS.dismiss);
    });
  });

  // ── AC1 + AC5: lang='de' renders German and leaks no English ──────────────
  describe('AC1: showInstallBanner({ lang: "de" }) renders German, no English leak', () => {
    it('renders the German title/body/button/dismiss copy', () => {
      showForState('not-installed', { lang: 'de', operatorName: 'STORZ & BICKEL' });
      const text = bannerText();

      // The German lead title + CTA + dismiss labels are present …
      expect(text).toContain(DE_STRINGS.states['not-installed'].title);
      expect(text).toContain(DE_STRINGS.buttonText);
      expect(text).toContain(DE_STRINGS.dismiss);
    });

    it('leaks NO hardcoded English token into the DOM when lang="de"', () => {
      showForState('not-installed', { lang: 'de', operatorName: 'STORZ & BICKEL' });
      const text = bannerText();
      for (const token of HARDCODED_ENGLISH_TOKENS) {
        expect(text).not.toContain(token);
      }
    });

    it('navigator.language="de-DE" with no explicit lang ALSO renders German (zero-config)', () => {
      setNavigatorLanguage('de-DE');
      showForState('not-installed', { operatorName: 'STORZ & BICKEL' });
      const text = bannerText();
      expect(text).toContain(DE_STRINGS.states['not-installed'].title);
      expect(text).not.toContain('Start Setup');
    });
  });

  // ── AC3: byte-identical English regression for current callers ────────────
  describe('AC3: no lang/strings ⇒ byte-identical to today\'s English defaults', () => {
    it('renders the exact English title/body/button/dismiss when nothing is supplied', () => {
      // navigator.language defaults to the jsdom 'en-US'; assert the English
      // defaults still render so existing callers are unchanged.
      setNavigatorLanguage('en-US');
      showForState('not-installed', { operatorName: 'STORZ & BICKEL' });
      const text = bannerText();
      expect(text).toContain(EN_STRINGS.states['not-installed'].title);
      expect(text).toContain('Start Setup');
      expect(text).toContain('Not now');
      expect(text).toContain('How does setup work?');
      expect(text).toContain('Privacy: No data collected');
    });
  });

  // ── AC4 (shared seam): presentError consumes the SAME i18n module ─────────
  describe('AC4: presentError({ lang: "de" }) renders German per-code copy + dismiss/retry', () => {
    it('renders the German per-code body and German dismiss/retry for a retriable code', () => {
      // DEVICE_DISCONNECTED is retriable (RETRIABLE_CODES) → the card shows a
      // retry affordance, so we can assert BOTH the dismiss and retry labels.
      presentError({ code: 'DEVICE_DISCONNECTED' }, { lang: 'de' });
      const text = errorCardText();

      expect(text).toContain(DE_STRINGS.error.messages.DEVICE_DISCONNECTED);
      expect(text).toContain(DE_STRINGS.error.dismiss);
      expect(text).toContain(DE_STRINGS.error.retry);
      // No English remediation leaks.
      expect(text).not.toContain('The connection to your device was lost. Reconnect to continue.');
      expect(text).not.toContain('Try again');
      expect(text).not.toContain('Dismiss');
    });
  });
});

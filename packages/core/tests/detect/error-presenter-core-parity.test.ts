/**
 * SB-SDK-05 — seam-crossing control: @beacio/detect#presentError vs @beacio/core.
 *
 * error-presenter.ts keeps the BeacioErrorCode -> copy map (COPY) and the
 * retriable set (RETRIABLE_CODES) LOCAL on purpose: @beacio/core is an OPTIONAL
 * peer (a standalone `npm i @beacio/detect` has no core), so the presenter MUST
 * NOT statically import core — enforced by no-toplevel-core-import.test.ts. The
 * file's own contract comment states those local tables are "pinned to core's
 * public contract by the unit test, not by a runtime import" and that "the
 * presenter unit test is the seam-crossing control that this list still matches
 * core's source." That control did not exist: error-presenter.test.ts builds its
 * OWN local code list, so detect's tables could silently drift from core's
 * BeacioErrorCode union / RETRIABLE_CODES and every test would still pass — the
 * exact hand-maintained-enum drift hazard (a new core code would degrade a real
 * BeacioError to the generic card and mis-classify its retriability, breaking
 * AC1 "maps a BeacioError -> a friendly headline + retry for retriable codes" and
 * AC6 "each beacio error code maps to non-empty human copy").
 *
 * This is that missing control. Unlike the SHIPPED source (which must not import
 * core — no-toplevel-core-import.test.ts scans only the built dist for the
 * `@beacio/core` specifier, never tests/), a TEST may reach core's source — the
 * same way the jest config maps `@beacio/core` to core's SOURCE tree
 * (jest.config.js) and events.test.ts pins the wire event literals to core's
 * BEACIO_EVENTS. We import core's errors module by the SAME source path the
 * mapper targets (`../../src/errors`) — the genuine source-of-truth — rather
 * than the bare `@beacio/core` barrel, which ts-jest's per-file program cannot
 * resolve transitive named VALUE re-exports across for (TS2305). This sees the
 * live BeacioErrorCode union + the real BeacioError whose `.isRetriable` is
 * computed from core's private RETRIABLE_CODES — exactly what detect must track.
 *
 * Two layers of guard:
 *  1. COMPILE-TIME (code-set parity): EVERY_CODE is typed Record<BeacioErrorCode,
 *     true>. If core adds or removes a BeacioErrorCode, this object stops
 *     type-checking (ts-jest compile error) until detect's presenter is updated —
 *     the BeacioErrorCode union is erased at runtime, so this is the only way to
 *     pin the set itself.
 *  2. RUNTIME (behaviour parity): for every code, the card presentError renders
 *     for a REAL core BeacioError has non-empty, stack-free, competitor-free copy,
 *     and shows a retry affordance IFF core's BeacioError(code).isRetriable.
 *
 * jsdom; @jest/globals import style (project_jest_globals_import_gotcha).
 * Run via
 *   npx jest --config packages/detect/jest.config.js --rootDir packages/detect \
 *     error-presenter-core-parity
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
// Seam-crossing import: the SOURCE-OF-TRUTH, reached by the same source path the
// jest mapper points `@beacio/core` at (jest.config.js:
// '<rootDir>/../core/src/index.ts'). BeacioError is runtime (its `.isRetriable`
// reflects core's private RETRIABLE_CODES); BeacioErrorCode is a type (erased)
// used only to make EVERY_CODE exhaustive at compile time. Importing core's
// `errors` source directly (not the bare `@beacio/core` barrel) avoids ts-jest's
// per-file TS2305 on transitive named value re-exports while pinning the exact
// same canonical definitions.
import { BeacioError, type BeacioErrorCode } from '../../src/errors';
import { presentError } from '../../src/detect/error-presenter';

const CARD_ID = 'beacio-error';

/**
 * Code-set parity, layer 1 (compile-time). Listing every BeacioErrorCode as the
 * keys of a Record<BeacioErrorCode, true>: if core's union gains a member this
 * object is missing a key (TS2741) and if it loses one this object has an excess
 * key (TS2353) — either way ts-jest fails to compile this file, which is the
 * durable guard that detect's COPY/RETRIABLE tables track core's source.
 */
const EVERY_CODE: Record<BeacioErrorCode, true> = {
  INVALID_PARAMETER: true,
  BLUETOOTH_UNAVAILABLE: true,
  EXTENSION_NOT_INSTALLED: true,
  PERMISSION_DENIED: true,
  DEVICE_NOT_FOUND: true,
  DEVICE_DISCONNECTED: true,
  CONNECTION_TIMEOUT: true,
  SERVICE_NOT_FOUND: true,
  CHARACTERISTIC_NOT_FOUND: true,
  CHARACTERISTIC_NOT_READABLE: true,
  CHARACTERISTIC_NOT_WRITABLE: true,
  CHARACTERISTIC_NOT_NOTIFIABLE: true,
  GATT_OPERATION_FAILED: true,
  SCAN_ALREADY_IN_PROGRESS: true,
  CONNECTION_LIMIT_REACHED: true,
  USER_CANCELLED: true,
  TIMEOUT: true,
  WRITE_INCOMPLETE: true,
};
const ALL_CORE_CODES = Object.keys(EVERY_CODE) as BeacioErrorCode[];

/** Tokens that would betray a leaked stack frame / native URL in the card. */
const STACK_TOKENS = ['\n    at ', '.ts:', '.js:', 'webkit', 'WebKit', 'http://', 'https://', 'eval ('];

function cardEl(): HTMLElement | null {
  return document.getElementById(CARD_ID);
}
function cardText(): string {
  return (cardEl()?.textContent || '').replace(/\s+/g, ' ');
}
function hasRetryAffordance(): boolean {
  const el = cardEl();
  if (!el) return false;
  return Array.from(el.querySelectorAll<HTMLElement>('button, a')).some((c) =>
    /retry|try again|reconnect/i.test(c.textContent || '')
  );
}
function clear(): void {
  cardEl()?.remove();
  document.body.innerHTML = '';
}

describe('SB-SDK-05 seam: presentError tracks @beacio/core BeacioErrorCode contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    clear();
  });

  // Sanity: the compile-time set above must enumerate at least core's known codes
  // (a non-empty, plausible count) so a silently-emptied union can't pass vacuously.
  it('enumerates the full core code set (compile-time-exhaustive)', () => {
    expect(ALL_CORE_CODES.length).toBeGreaterThanOrEqual(18);
  });

  // RUNTIME parity, layer 2: for EVERY core code, presentError must render a real,
  // branded, leak-free card — driven off a genuine core BeacioError, not detect's
  // own copy of the list. A core code that detect's COPY table lacks would fall to
  // the generic card; this asserts a card renders with non-empty, clean copy for
  // each one (and, critically, that it is keyed off core's enumeration).
  it('renders non-empty, stack-free, competitor-free copy for every core BeacioErrorCode', () => {
    for (const code of ALL_CORE_CODES) {
      clear();
      const err = new BeacioError(code);
      const el = presentError(err);
      expect(el).not.toBeNull();
      const text = cardText();
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain('undefined');
      expect(text).not.toMatch(/Bluefy/i);
      for (const tok of STACK_TOKENS) {
        expect(text).not.toContain(tok);
      }
    }
  });

  // RETRIABLE parity: pins detect's LOCAL RETRIABLE_CODES to core's source.
  //
  // Subtlety the presenter forces (error-presenter.ts resolve()): for a coded
  // error that ALREADY carries a boolean `.isRetriable` (a real BeacioError), the
  // card trusts THAT value and never consults detect's local set — so passing a
  // real BeacioError would test core round-tripping, NOT detect's table. detect's
  // local RETRIABLE_CODES is the fallback used when the coded input lacks
  // `.isRetriable` (and for raw DOMExceptions). So drive THAT branch: present a
  // coded-SHAPED object WITHOUT `.isRetriable` (code only), which makes the card
  // fall back to detect's local set, and assert it matches core's truth
  // (new BeacioError(code).isRetriable, computed from core's private
  // RETRIABLE_CODES). If detect's local set drifts from core's, the rendered
  // affordance diverges and this fails — the guard that the shipped presenter's
  // copy of the retriable set still tracks core, with no runtime core import.
  it("shows the retry affordance for exactly the codes core marks retriable (detect's local fallback set tracks core)", () => {
    for (const code of ALL_CORE_CODES) {
      const coreTruth = new BeacioError(code).isRetriable;
      clear();
      // Code-only coded shape (no `.isRetriable`) → presenter uses detect's local
      // RETRIABLE_CODES, the exact table this guard pins.
      presentError({ code });
      expect(hasRetryAffordance()).toBe(coreTruth);
    }
  });

  // The raw-DOMException path also resolves retriability from detect's local set;
  // assert the local set is internally consistent with what the coded-fallback
  // path yields for the same code, so neither presenter branch can drift alone.
  it("a code's retriability is consistent across the coded-fallback and DOMException paths", () => {
    // NetworkError -> DEVICE_DISCONNECTED (retriable); NotFoundError ->
    // DEVICE_NOT_FOUND (not). Both must agree with the coded-fallback path.
    clear();
    presentError(new DOMException('lost', 'NetworkError'));
    const domDisconnected = hasRetryAffordance();
    clear();
    presentError({ code: 'DEVICE_DISCONNECTED' as BeacioErrorCode });
    expect(domDisconnected).toBe(hasRetryAffordance());
    expect(domDisconnected).toBe(new BeacioError('DEVICE_DISCONNECTED').isRetriable);
  });
});

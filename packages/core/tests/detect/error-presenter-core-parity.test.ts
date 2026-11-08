/**
 * The control on the boundary between the SDK's `BeacioError.from`
 * and the branded card's `presentError`.
 *
 * ─── 2026-08-12: the twins were COLLAPSED; what this file still guards ───────
 *
 * Until this date `error-presenter.ts` re-declared the BeacioErrorCode union, the
 * retriable set, the NotFoundError fragment table and its own message classifier,
 * "because @beacio/core is an OPTIONAL peer of @beacio/detect". That constraint
 * was dead: there is no `packages/detect`, `./detect` is a SUBPATH EXPORT of core,
 * the detect modules already import `../events` / `../urls`, and react-sdk
 * statically imports `@beacio/core/detect` while declaring core a REQUIRED peer.
 * No test ever enforced the rule — two earlier headers here cited
 * `no-toplevel-core-import.test.ts`, a file that never existed. Both layers now
 * classify through `src/error-taxonomy.ts`.
 *
 * Three guards are GONE, because what they asserted is now structurally
 * impossible rather than merely untested: the compile-time `EVERY_CODE` Record
 * (the i18n packs are typed `Record<BeacioErrorCode, string>` over the ONE union,
 * so a new code fails to compile in SRC); the regex-scraped "both twins carry
 * identical fragment tables" pair (there is one table); and the retriability
 * pair (both sides read the same imported `RETRIABLE_CODES`).
 *
 * What remains is what a single classifier does NOT make free:
 *  1. that the shipped COPY for every code is real, non-empty, stack-free and
 *     competitor-free (a content property of the i18n packs);
 *  2. that both layers reach the ADJUDICATED code for the overloaded
 *     NotFoundError and for each of the eleven inputs on which the twins had
 *     silently diverged (see the ADJUDICATIONS block).
 *
 * A THIRD guard — "the literals the SHIPPED emitters throw still classify to
 * their own codes", tree-discovered with a repo-wide backstop (W10-PARITY3) —
 * was DEMOLISHED here by S5-F (2026-08-12) after S5 single-sourced every
 * first-party NotFoundError in packages/core/src/error-conditions.ts. Where
 * each of its properties lives now: row bytes + per-row codes + the
 * classifier-agrees-per-sentence rule + the adjudication/openQuestion prose →
 * packages/core/tests/error-conditions.test.ts (hardcoded-tuple oracle,
 * sentence-group rule, CONDITION_META); the raw-emitter ban, discovery walk,
 * repo-wide backstop with the NON_SHIPPING_EMITTERS allowlist, and the
 * planted-fixture cannot-be-fooled self-test → scripts/ci/
 * check-error-conditions.mjs (+ its __tests__, wired into gate-js and
 * verify-gate); the one licensed page-realm mint count → that lint AND the
 * error-name freeze map (src/beacio/api/error-name-freeze.test.ts,
 * NotFoundError: 1). See S5-DESIGN §5-§6 for the panel verdict.
 *
 * jsdom; @jest/globals import style (project_jest_globals_import_gotcha).
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
// The SOURCE-OF-TRUTH modules, imported directly rather than through the bare
// `@beacio/core` barrel (ts-jest's per-file program cannot resolve transitive
// named VALUE re-exports across it — TS2305).
import { BeacioError } from '../../src/errors';
import { EN_STRINGS } from '../../src/detect/i18n';
import { RETRIABLE_CODES, sanitizeNativeMessage, type BeacioErrorCode } from '../../src/error-taxonomy';
import { presentError } from '../../src/detect/error-presenter';
import { ACTIVATION_DISMISSED, ACTIVATION_ENABLE_TIMED_OUT, CDN_DORMANT, CDN_RESTORE_PENDING, GRANT_WALL, beacioDomException } from '../../src/error-conditions';

const CARD_ID = 'beacio-error';

/**
 * Every code, enumerated from a table the COMPILER already forces to be complete:
 * `EN_STRINGS.error.titles` is `Record<BeacioErrorCode, string>` over the one
 * union, so a code added to `src/error-taxonomy.ts` fails i18n.ts's compile until
 * both packs cover it. This replaces a hand-maintained 19-key Record that had to
 * be edited by hand every time the union moved.
 */
const ALL_CORE_CODES = Object.keys(EN_STRINGS.error.titles) as BeacioErrorCode[];

function cardEl(): HTMLElement | null {
  return document.getElementById(CARD_ID);
}
function cardText(): string {
  return (cardEl()?.textContent || '').replace(/\s+/g, ' ');
}
function clear(): void {
  cardEl()?.remove();
  document.body.innerHTML = '';
}

describe('Seam: presentError tracks @beacio/core BeacioErrorCode contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    clear();
  });

  // Anti-vacuity: a silently-emptied union (or an emptied pack) must not let the
  // loop below pass over zero codes.
  it('enumerates the full core code set', () => {
    expect(ALL_CORE_CODES.length).toBeGreaterThanOrEqual(19);
  });

  // For EVERY code, a core BeacioError must ROUND-TRIP through the presenter onto
  // a rendered card stamped with that same code — the seam property this file
  // owns, and the one thing a compile-time Record cannot buy. The CONTENT of the
  // shipped copy (non-empty, no leaked stack token / URL / competitor name / bare
  // "undefined") is asserted once, by error-presenter.test.ts's AC6 loop, which
  // carries the stronger bare-'https://' URL token.
  it('round-trips every core BeacioErrorCode onto the rendered card', () => {
    for (const code of ALL_CORE_CODES) {
      clear();
      const el = presentError(new BeacioError(code));
      expect(el).not.toBeNull();
      expect(el?.dataset.beacioErrorCode).toBe(code);
    }
  });

  // RETRIABLE parity used to live here as two tests: "the presenter's local
  // RETRIABLE_CODES tracks core's" and "the coded-fallback and DOMException paths
  // agree". Both are DELETED, not weakened: `BeacioError.isRetriable` and the
  // card's retry affordance now read the SAME imported
  // `src/error-taxonomy.ts#RETRIABLE_CODES`, so each assertion had become a
  // comparison of one value with itself. What the affordance MEANS (retriable ⇒
  // a retry button renders at all) is still pinned by error-presenter.test.ts.
});

/**
 * ───────────────────────────────────────────────────────────────────────────────
 * W10-PARITY2 — the DUPLICATED NotFoundError CLASSIFIER (strategic review, Risk 5)
 *
 * `error-presenter.ts` used to carry a comment-only-locked COPY of core's
 * NotFoundError classifier ("a local copy of core's `NotFoundReason`
 * (`../errors.ts`) … Keep the two in lockstep"). "Keep the two in lockstep" was
 * enforced by NOTHING until this block: no test ever pushed a
 * NotFoundError-CARRYING-A-CANCELLATION-MESSAGE through the PRESENTER, so the
 * copies could silently diverge — and the user-visible consequence is concrete
 * and bad: a user who dismisses the chooser gets a red "device not found" card
 * instead of a silent cancel. (They HAD diverged, on eleven inputs; see the
 * ADJUDICATIONS block above.) Since 2026-08-12 there is ONE classifier
 * (`src/error-taxonomy.ts`), so these rows now pin that both PUBLIC surfaces
 * still route through it — a re-divergence ratchet, not a copy-vs-copy diff.
 *
 * Web Bluetooth OVERLOADS NotFoundError (Chromium `bluetooth_error.cc` 148-178):
 * a dismissed chooser (CHOOSER_CANCELLED), an origin that never enabled the API
 * (CHOOSER_NOT_SHOWN_API_LOCALLY_DISABLED, :161-163) and a dozen genuine failures
 * all share the DOM name, so the MESSAGE is the only discriminator — which is
 * exactly why two hand-copied message classifiers are a live hazard rather than a
 * cosmetic duplication. 2026-08-12: there is now ONE classifier, whose
 * `NOT_FOUND_FRAGMENTS` rows each carry the full Classification they mean, so a
 * new row cannot be silently defaulted into DEVICE_NOT_FOUND the way the grant
 * wall originally was.
 *
 * Two layers, each of which must RED on a real divergence (the third, a regex
 * scrape asserting the two source fragment TABLES were identical, is deleted:
 * there is one table now, and `expect(x).toEqual(x)` is not coverage):
 *  1. CANONICAL: the exact Chromium cancellation string classified through BOTH
 *     paths — core `BeacioError.from(...).code` and the presenter's rendered
 *     `data-beacio-error-code` — must agree AND equal 'USER_CANCELLED'.
 *  2. VARIANT TABLE: case, stack suffix, US spelling, non-DOMException carrier —
 *     for the cancel string AND the grant-wall string — plus NEGATIVE
 *     NotFoundError messages (a "no devices" failure; Chromium's
 *     WEB_BLUETOOTH_NOT_SUPPORTED / globally-disabled wording; adapter-state
 *     wording). The negative rows are what stop a classifier perturbed to a
 *     constant, or a grant-wall fragment widened to 'web bluetooth' /
 *     'not enabled', from passing.
 *  3. EMITTER — layer DEMOLISHED by S5-F (2026-08-12; see the file header).
 *     "Each shipped literal pinned to its OWN code" is now structural: shipped
 *     emitters can only construct through the CONDITIONS table (gate:
 *     scripts/ci/check-error-conditions.mjs), whose per-row bytes and codes
 *     are pinned by packages/core/tests/error-conditions.test.ts; the
 *     classifier-vs-emitter agreement this layer bought is that suite's
 *     sentence-group rule.
 *
 * RED-arms (adversarial, both directions): perturbing the classifier (e.g.
 * dropping the 'user cancelled' branch in error-taxonomy.ts) MUST turn this
 * block RED; perturbing a shipped emitter row reds error-conditions.test.ts
 * instead. Verified by perturb → RED → revert → GREEN; see docs/reviews/
 * 2026-07-29-chromium-wpt-test-port/fixes/W10-PARITY2.md for the verbatim
 * evidence.
 */

/**
 * Chromium's fixed English string for CHOOSER_CANCELLED — the message the beacio
 * polyfill emits verbatim for parity. Declared here as the SPEC-level anchor; the
 * shipped row's bytes are pinned independently by error-conditions.test.ts's
 * hardcoded tuple ('chooser-cancelled'), so a drift in either place is caught.
 */
const CHROMIUM_CANCEL_MESSAGE = 'User cancelled the requestDevice() chooser.';

/**
 * The GRANT-WALL sentence: the polyfill's other NotFoundError emitter, thrown when
 * the extension is installed but this origin never enabled it
 * (`src/extension/page-bootstrap.ts` `scanUnavailableError`). Chromium maps the
 * same condition — CHOOSER_NOT_SHOWN_API_LOCALLY_DISABLED — onto NotFoundError
 * (bluetooth_error.cc:161-163), so the DOM name is correct and only the CODE is
 * ours to choose. Declared here as the SPEC-level anchor, exactly like
 * CHROMIUM_CANCEL_MESSAGE; the shipped row's bytes are pinned independently by
 * error-conditions.test.ts's hardcoded tuple ('grant-wall').
 */
const GRANT_WALL_MESSAGE = 'User has not enabled Web Bluetooth for this origin.';

/**
 * The CDN loader's installed-but-dormant sentence (`src/cdn/beacio.ts`
 * `requestActivation`, which REPLACES `navigator.bluetooth.requestDevice` while
 * the extension is installed but not active for this origin). Same condition as
 * GRANT_WALL_MESSAGE on a different surface, so it takes the same code. SPEC-level
 * anchor only — the shipped row's bytes are pinned independently by
 * error-conditions.test.ts's hardcoded tuple ('cdn-dormant').
 */
const CDN_INACTIVE_MESSAGE = 'Beacio is installed but not active. Follow the Beacio setup prompt, then retry.';

/**
 * @beacio/core's unsupported-platform stub sentence (`packages/core/src/auto.ts`).
 * NOTE the trap this row exists to pin: it OPENS with Chromium's
 * WEB_BLUETOOTH_NOT_SUPPORTED sentence verbatim, so only the beacio-specific tail
 * may be used to classify it — the bare Chromium sentence stays DEVICE_NOT_FOUND
 * (NEGATIVE rows below). SPEC-level anchor only; the shipped row's bytes are
 * pinned independently by error-conditions.test.ts's hardcoded tuple
 * ('unsupported-platform-install').
 */
const UNSUPPORTED_PLATFORM_MESSAGE =
  'Web Bluetooth is not supported on this platform. On iOS Safari, install the Beacio extension. See: https://beacio.com';

/** Core's classification of an arbitrary thrown value. */
function coreCode(input: unknown): string {
  return BeacioError.from(input).code;
}

/**
 * The PRESENTER's classification of the same value, observed the only way a user
 * would: through the rendered card. `presentError` stamps the resolved code onto
 * `card.dataset.beacioErrorCode`, so this reads the presenter's real decision
 * (its local `notFoundReason` copy included), not a re-implementation.
 */
function presenterCode(input: unknown): string {
  // Remove any prior card first: presentError coalesces only when an identical
  // card is STILL on screen, so clearing keeps every call independent (no
  // ordering coupling between these cases — HARD RULE: idempotent tests).
  cardEl()?.remove();
  const el = presentError(input);
  expect(el).not.toBeNull();
  return el?.dataset.beacioErrorCode ?? '';
}

describe('W10-PARITY2: detect presenter and core agree on the overloaded NotFoundError', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    clear();
  });

  it('classifies the canonical Chromium cancellation string as USER_CANCELLED through BOTH paths', () => {
    const err = new DOMException(CHROMIUM_CANCEL_MESSAGE, 'NotFoundError');
    const fromCore = coreCode(err);
    const fromPresenter = presenterCode(err);
    // Agreement (the lockstep rule) …
    expect(fromPresenter).toBe(fromCore);
    // … AND agreement on the RIGHT answer, so both drifting together still reds.
    expect(fromCore).toBe('USER_CANCELLED');
  });

  it('never presents a dismissed chooser as the DEVICE_NOT_FOUND card', () => {
    // The concrete user-visible consequence of divergence, asserted directly.
    expect(presenterCode(new DOMException(CHROMIUM_CANCEL_MESSAGE, 'NotFoundError'))).not.toBe('DEVICE_NOT_FOUND');
  });

  // Table-driven parity. POSITIVE rows pin that both copies still match the real
  // message shapes; NEGATIVE rows pin that neither copy over-matches (a predicate
  // widened to `return true` — or to a bare `includes('user')` — reds here).
  const CASES: ReadonlyArray<{ label: string; error: unknown; expected: BeacioErrorCode }> = [
    {
      label: 'canonical Chromium string (NotFoundError)',
      error: new DOMException(CHROMIUM_CANCEL_MESSAGE, 'NotFoundError'),
      expected: 'USER_CANCELLED',
    },
    {
      label: 'UPPERCASED native message (core lowercases internally; the presenter lowercases at its call site)',
      error: new DOMException(CHROMIUM_CANCEL_MESSAGE.toUpperCase(), 'NotFoundError'),
      expected: 'USER_CANCELLED',
    },
    {
      label: 'US spelling ("canceled")',
      error: new DOMException('User canceled the requestDevice() chooser.', 'NotFoundError'),
      expected: 'USER_CANCELLED',
    },
    {
      label: 'stack-suffixed native message',
      error: new DOMException(`${CHROMIUM_CANCEL_MESSAGE}\n    at foo (webkit://x.js:1:2)`, 'NotFoundError'),
      expected: 'USER_CANCELLED',
    },
    {
      label: 'cancellation message on a plain Error (falls past the DOM-name switch in both)',
      error: new Error(CHROMIUM_CANCEL_MESSAGE),
      expected: 'USER_CANCELLED',
    },
    // GRANT WALL — the SECOND overloaded meaning. An origin that never enabled the
    // extension must NOT be reported as "device not found" (that sends the user
    // hunting for their hardware at the exact moment they need to finish setup),
    // and — explicit 2026-08-12 decision — must NOT reuse USER_CANCELLED either.
    {
      label: 'grant wall: canonical sentence (NotFoundError)',
      error: new DOMException(GRANT_WALL_MESSAGE, 'NotFoundError'),
      expected: 'EXTENSION_NOT_ENABLED',
    },
    {
      label: 'grant wall: UPPERCASED (both twins lower-case the RAW text internally)',
      error: new DOMException(GRANT_WALL_MESSAGE.toUpperCase(), 'NotFoundError'),
      expected: 'EXTENSION_NOT_ENABLED',
    },
    {
      label: 'grant wall: stack-suffixed native message',
      error: new DOMException(`${GRANT_WALL_MESSAGE}\n    at foo (webkit://x.js:1:2)`, 'NotFoundError'),
      expected: 'EXTENSION_NOT_ENABLED',
    },
    {
      label: 'grant wall: on a plain Error (falls past the DOM-name switch in both)',
      error: new Error(GRANT_WALL_MESSAGE),
      expected: 'EXTENSION_NOT_ENABLED',
    },
    // CDN LOADER — the same "installed but inert for this origin" condition as the
    // grant wall, thrown by the OTHER shipped surface (src/cdn/beacio.ts). It read
    // DEVICE_NOT_FOUND until 2026-08-12 because nothing enumerated it.
    {
      label: 'cdn loader: installed-but-dormant sentence (NotFoundError)',
      error: new DOMException(CDN_INACTIVE_MESSAGE, 'NotFoundError'),
      expected: 'EXTENSION_NOT_ENABLED',
    },
    {
      label: 'cdn loader: UPPERCASED (both twins lower-case the RAW text internally)',
      error: new DOMException(CDN_INACTIVE_MESSAGE.toUpperCase(), 'NotFoundError'),
      expected: 'EXTENSION_NOT_ENABLED',
    },
    {
      label: 'cdn loader: on a plain Error (falls past the DOM-name switch in both)',
      error: new Error(CDN_INACTIVE_MESSAGE),
      expected: 'EXTENSION_NOT_ENABLED',
    },
    // UNSUPPORTED-PLATFORM STUB — beacio is not installed at all, so the remedy is
    // "install", not "enable" and not "look for your device".
    {
      label: 'unsupported-platform stub: install sentence (NotFoundError)',
      error: new DOMException(UNSUPPORTED_PLATFORM_MESSAGE, 'NotFoundError'),
      expected: 'EXTENSION_NOT_INSTALLED',
    },
    {
      label: 'unsupported-platform stub: UPPERCASED',
      error: new DOMException(UNSUPPORTED_PLATFORM_MESSAGE.toUpperCase(), 'NotFoundError'),
      expected: 'EXTENSION_NOT_INSTALLED',
    },
    {
      label: 'unsupported-platform stub: stack-suffixed native message',
      error: new DOMException(`${UNSUPPORTED_PLATFORM_MESSAGE}\n    at foo (webkit://x.js:1:2)`, 'NotFoundError'),
      expected: 'EXTENSION_NOT_INSTALLED',
    },
    // S5-B / R3: SANITIZED re-entry, one per swapped full-sentence fragment.
    // `BeacioError.message` stores the SANITIZED line (trailing period stripped,
    // URLs removed — the stub sentence ends in one), and an unknown-code
    // BeacioError re-entering the raw classification branch carries exactly that
    // form. A fragment equal to the raw full sentence would MISS it and flip
    // extension-not-* back to DEVICE_NOT_FOUND; the sanitize-fixed-point
    // fragments must keep matching.
    {
      label: 'grant wall: SANITIZED re-entry (trailing period stripped)',
      error: new DOMException(sanitizeNativeMessage(GRANT_WALL_MESSAGE), 'NotFoundError'),
      expected: 'EXTENSION_NOT_ENABLED',
    },
    {
      label: 'cdn loader: SANITIZED re-entry (trailing period stripped)',
      error: new DOMException(sanitizeNativeMessage(CDN_INACTIVE_MESSAGE), 'NotFoundError'),
      expected: 'EXTENSION_NOT_ENABLED',
    },
    {
      label: 'unsupported-platform stub: SANITIZED re-entry (URL stripped by sanitizeNativeMessage)',
      error: new DOMException(sanitizeNativeMessage(UNSUPPORTED_PLATFORM_MESSAGE), 'NotFoundError'),
      expected: 'EXTENSION_NOT_INSTALLED',
    },
    {
      label: 'NEGATIVE: genuine NotFoundError — no adapter',
      error: new DOMException('Bluetooth adapter not available.', 'NotFoundError'),
      expected: 'DEVICE_NOT_FOUND',
    },
    {
      label: 'NEGATIVE: genuine NotFoundError — nothing matched the filters',
      error: new DOMException('No Devices Found', 'NotFoundError'),
      expected: 'DEVICE_NOT_FOUND',
    },
    // OVER-MATCH guards for the grant-wall predicate. A predicate keyed on
    // 'web bluetooth' would steal Chromium's WEB_BLUETOOTH_NOT_SUPPORTED /
    // WEB_BLUETOOTH_GLOBALLY_DISABLED messages; one keyed on 'not enabled' would
    // steal adapter-state wording. Both families must stay DEVICE_NOT_FOUND.
    {
      label: 'NEGATIVE: Chromium WEB_BLUETOOTH_NOT_SUPPORTED (contains "Web Bluetooth")',
      error: new DOMException('Web Bluetooth is not supported on this platform.', 'NotFoundError'),
      expected: 'DEVICE_NOT_FOUND',
    },
    {
      label: 'NEGATIVE: Chromium WEB_BLUETOOTH_GLOBALLY_DISABLED (contains "Web Bluetooth")',
      error: new DOMException('Web Bluetooth API globally disabled.', 'NotFoundError'),
      expected: 'DEVICE_NOT_FOUND',
    },
    {
      label: 'NEGATIVE: adapter-state wording (contains "not enabled")',
      error: new DOMException('Bluetooth is not enabled.', 'NotFoundError'),
      expected: 'DEVICE_NOT_FOUND',
    },
    // OVER-MATCH guards for the two fragments added 2026-08-12 (W10-PARITY3).
    {
      label: "NEGATIVE: Chromium WEB_BLUETOOTH_NOT_SUPPORTED, full sentence — the stub's message opens with it verbatim",
      error: new DOMException(
        'Web Bluetooth is not supported on this platform. For a list of supported platforms see: https://goo.gl/J6ASzs',
        'NotFoundError'
      ),
      expected: 'DEVICE_NOT_FOUND',
    },
    {
      label: 'NEGATIVE: adapter-state wording (contains "not active") — the cdn fragment must need "installed but"',
      error: new DOMException('Bluetooth is not active.', 'NotFoundError'),
      expected: 'DEVICE_NOT_FOUND',
    },
    {
      label: 'NEGATIVE: unrelated install advice — the install fragment must need "the beacio extension"',
      error: new DOMException('Please install a Bluetooth driver and try again.', 'NotFoundError'),
      expected: 'DEVICE_NOT_FOUND',
    },
  ];

  it.each(CASES)('core and the presenter agree: $label', ({ error, expected }) => {
    const fromCore = coreCode(error);
    const fromPresenter = presenterCode(error);
    expect(fromPresenter).toBe(fromCore);
    expect(fromCore).toBe(expected);
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * ADJUDICATIONS — the eleven inputs on which the hand-copied twins DISAGREED.
   *
   * Measured 2026-08-12 against HEAD by running both public surfaces
   * (`BeacioError.from().code`; the rendered `data-beacio-error-code`) over 243
   * carrier × message probes: 66 divergent probes in 32 groups, reducible to the
   * eleven root causes below. Collapsing the twins had to PICK A WINNER for each
   * — a real behaviour change for one side, not a mechanical refactor — so each
   * row records the decision, its reasoning, AND what the loser used to answer.
   *
   * The winner is CORE in ten of eleven. The tempting justification for the split
   * — "the presenter feeds UI copy, core feeds branching, so coarser is fine for
   * the card" — is disproven by `i18n.ts`: every code the presenter could not
   * reach ALREADY has bespoke, shipped, German-localized copy. Its coarseness was
   * not a design choice, it was unreachable copy — and the fallback it landed on,
   * GATT_OPERATION_FAILED, renders "Something interrupted the connection. Switch
   * your device off and on, then try again.", i.e. it told a user to power-cycle
   * their hardware when the real cause was a denied permission or an un-enabled
   * extension. Every row asserts BOTH layers, so a one-sided edit reds here.
   */
  describe('the eleven adjudicated twin divergences', () => {
    interface Adjudication {
      readonly id: string;
      /** Who classified this correctly BEFORE the collapse. */
      readonly winner: 'core' | 'presenter';
      readonly why: string;
      readonly error: unknown;
      readonly expected: BeacioErrorCode;
      /** What the LOSING twin produced at HEAD — the behaviour this row changed. */
      readonly wasWrongly: BeacioErrorCode;
    }

    const ADJUDICATED: readonly Adjudication[] = [
      // D1-D7 — core's eight-rule message ladder vs the presenter's two-rule stub.
      {
        id: 'D1 permission',
        winner: 'core',
        why: 'PERMISSION_DENIED has shipped copy ("Bluetooth access was not granted. Tap Connect yourself…"); the card used to tell the user to power-cycle the device instead.',
        error: new Error('User denied the browser permission to scan for Bluetooth devices.'),
        expected: 'PERMISSION_DENIED',
        wasWrongly: 'GATT_OPERATION_FAILED',
      },
      {
        id: 'D2 service',
        winner: 'core',
        why: 'SERVICE_NOT_FOUND has shipped copy ("A required feature was not found on this device."). A missing GATT service is not a connection interruption.',
        error: new Error('No Services matching UUID 0000180d-0000-1000-8000-00805f9b34fb.'),
        expected: 'SERVICE_NOT_FOUND',
        wasWrongly: 'GATT_OPERATION_FAILED',
      },
      {
        id: 'D3 characteristic',
        winner: 'core',
        why: 'Same as D2 one level down: a missing characteristic is an absence, not a transport failure.',
        error: new Error('No Characteristics matching UUID 00002a37-0000-1000-8000-00805f9b34fb.'),
        expected: 'CHARACTERISTIC_NOT_FOUND',
        wasWrongly: 'GATT_OPERATION_FAILED',
      },
      {
        id: 'D4 device',
        winner: 'core',
        why: 'A filter that matched nothing is DEVICE_NOT_FOUND ("check your scan filters"), not a GATT failure — and @beacio/testing ships this exact sentence.',
        error: new Error('No devices found matching the filter criteria'),
        expected: 'DEVICE_NOT_FOUND',
        wasWrongly: 'GATT_OPERATION_FAILED',
      },
      {
        id: 'D5 not readable',
        winner: 'core',
        why: 'CHARACTERISTIC_NOT_READABLE has shipped copy ("No action is needed for this control.") — retrying a read the characteristic does not support never succeeds.',
        error: new Error('read is not supported by this characteristic'),
        expected: 'CHARACTERISTIC_NOT_READABLE',
        wasWrongly: 'GATT_OPERATION_FAILED',
      },
      {
        id: 'D6 not writable',
        winner: 'core',
        why: 'As D5, for write: CHARACTERISTIC_NOT_WRITABLE is a permanent property of the characteristic, so the card must not offer a retry that can never succeed.',
        error: new Error('write is not supported by this characteristic'),
        expected: 'CHARACTERISTIC_NOT_WRITABLE',
        wasWrongly: 'GATT_OPERATION_FAILED',
      },
      {
        id: 'D7 not notifiable',
        winner: 'core',
        why: 'As D5, for notify/indicate: the shipped copy tells the user to poll with read() instead, advice the GATT_OPERATION_FAILED card could never give.',
        error: new Error('notify is not supported by this characteristic'),
        expected: 'CHARACTERISTIC_NOT_NOTIFIABLE',
        wasWrongly: 'GATT_OPERATION_FAILED',
      },
      // D8 — fragment WIDTH, diverging the other way.
      {
        id: 'D8 disconnect stem vs disconnected state',
        winner: 'core',
        why: "The presenter matched the stem 'disconnect', so a DELIBERATE disconnect() call reported connection LOSS. Core matches 'disconnected' — a state — and this sentence is neither, so it takes the fallback.",
        error: new Error('Failed to disconnect the peripheral'),
        expected: 'GATT_OPERATION_FAILED',
        wasWrongly: 'DEVICE_DISCONNECTED',
      },
      // D9 — the ONE rule the presenter had and core lacked.
      {
        id: 'D9 timeout',
        winner: 'presenter',
        why: 'Both codes are retriable, so the retry affordance is unchanged and only the copy differs — and TIMEOUT ("That took too long. Check your device is close and powered on…") is strictly more accurate than "Switch your device off and on." Core GAINS this rule. It must stay LAST: includes("timeout") also matches CONNECTION_TIMEOUT wording and would swallow anything more specific placed after it.',
        error: new Error('Operation timeout after 10000ms'),
        expected: 'TIMEOUT',
        wasWrongly: 'GATT_OPERATION_FAILED',
      },
      // D10 — a whole missing arm.
      {
        id: 'D10 TypeError',
        winner: 'core',
        why: 'The presenter had no TypeError arm at all, so a rehydrated native validation failure (Convention 5) fell into the message heuristics and rendered "Switch your device off and on" for a malformed UUID.',
        error: new TypeError("Invalid UUID: 'bogus'"),
        expected: 'INVALID_PARAMETER',
        wasWrongly: 'GATT_OPERATION_FAILED',
      },
      // D11 — return vs break: the highest-blast-radius structural gap.
      {
        id: 'D11 InvalidStateError falls through',
        winner: 'core',
        why: 'The presenter RETURNED GATT_OPERATION_FAILED for any non-disconnect InvalidStateError; core BREAKS and continues into the message-keyed reasons. Consequence: the grant-wall sentence on an InvalidStateError carrier rendered device-failure copy — the exact onboarding path this campaign exists to fix.',
        error: new DOMException('User has not enabled Web Bluetooth for this origin.', 'InvalidStateError'),
        expected: 'EXTENSION_NOT_ENABLED',
        wasWrongly: 'GATT_OPERATION_FAILED',
      },
    ];

    it('pins all eleven root divergences (no two-sided drift can hide)', () => {
      expect(ADJUDICATED).toHaveLength(11);
      // Every row must be a REAL divergence: a row whose winner and loser agree
      // is a row that has stopped testing anything.
      for (const row of ADJUDICATED) {
        expect(row.expected).not.toBe(row.wasWrongly);
        expect(row.why.length).toBeGreaterThan(60);
      }
    });

    it.each(ADJUDICATED)('$id: both layers now agree on $expected (winner: $winner)', ({ error, expected, wasWrongly }) => {
      const fromCore = coreCode(error);
      const fromPresenter = presenterCode(error);
      // The lockstep rule …
      expect(fromPresenter).toBe(fromCore);
      // … AND the adjudicated answer, so drifting together still reds …
      expect(fromCore).toBe(expected);
      // … and neither layer may relapse to the losing twin's answer.
      expect(fromCore).not.toBe(wasWrongly);
    });

    /**
     * D9's placement is behaviour, not style: `includes('timeout')` is broad
     * enough to steal from any rule sequenced after it. Pin that the rules which
     * MUST outrank it still do, on messages that contain the word.
     */
    it('D9: the timeout rule sits LAST — more specific rules still outrank it', () => {
      expect(coreCode(new Error('Bluetooth permission timeout'))).toBe('PERMISSION_DENIED');
      expect(coreCode(new Error('GATT Server is disconnected after timeout'))).toBe('DEVICE_DISCONNECTED');
      expect(coreCode(new Error('User cancelled after a timeout'))).toBe('USER_CANCELLED');
    });

    /**
     * The message a classification CARRIES is SDK-side only (the card never
     * renders native text). Two paths reach DEVICE_NOT_FOUND and they carry
     * differently — pinned so the collapse cannot quietly normalise it.
     */
    it('preserves which classifications echo the native sentence and which fall back to the SUGGESTION', () => {
      // Restates the code → branded SUGGESTION, native text dropped.
      expect(BeacioError.from(new Error('no devices found')).message).toBe(new BeacioError('DEVICE_NOT_FOUND').suggestion);
      expect(BeacioError.from(new Error('User cancelled the requestDevice() chooser.')).message).toBe(
        new BeacioError('USER_CANCELLED').suggestion
      );
      // Adds detail → the sanitised native sentence survives.
      expect(BeacioError.from(new DOMException('Bluetooth adapter not available.', 'NotFoundError')).message).toBe(
        'Bluetooth adapter not available'
      );
      expect(BeacioError.from(new Error('oops'), 'DEVICE_NOT_FOUND').message).toBe('oops');
    });

    /** The per-code backoff hint moved into one table; pin the sites it replaced. */
    it('keeps the 1000ms retry hint on exactly the disconnect/timeout classifications', () => {
      expect(BeacioError.from(new DOMException('lost', 'NetworkError')).retryAfterMs).toBe(1000);
      expect(BeacioError.from(new DOMException('slow', 'TimeoutError')).retryAfterMs).toBe(1000);
      expect(BeacioError.from(new DOMException('disconnect in flight', 'InvalidStateError')).retryAfterMs).toBe(1000);
      expect(BeacioError.from(new Error('GATT Server is disconnected')).retryAfterMs).toBe(1000);
      // D9's new TIMEOUT path inherits the same hint …
      expect(BeacioError.from(new Error('Operation timeout after 10000ms')).retryAfterMs).toBe(1000);
      // … and a code with no hint still reports none.
      expect(BeacioError.from(new Error('something else')).retryAfterMs).toBeUndefined();
    });

    /** Retriability is now single-sourced; assert the adjudications did not move it. */
    it('leaves retriability untouched for every adjudicated code', () => {
      for (const { expected } of ADJUDICATED) {
        expect(new BeacioError(expected).isRetriable).toBe(RETRIABLE_CODES.has(expected));
      }
    });
  });

});

/**
 * GH #354 — the activation-enable-timed-out condition now carries its OWN
 * beacio-owned sentence ("Beacio activation timed out") in addition to its code
 * EXTENSION_NOT_ENABLED (the user must act at the onboarding moment — it is NOT
 * a cancellation). V7 decoupled the sentence from Chromium's byte-frozen cancel
 * bytes, which remain shared ONLY by chooser-cancelled + activation-dismissed
 * (both honest USER_CANCELLED). The out-of-band discriminator is still carried,
 * but it no longer does the whole job: the honest sentence text-classifies
 * 'extension-not-enabled' on its own, in BOTH public surfaces (core
 * `BeacioError.from`, the presenter's rendered card), on the RAW and the
 * SANITIZED re-entry paths — never DEVICE_NOT_FOUND. RED today: the row still
 * reuses the frozen cancel sentence.
 */
describe('GH #354: the activation-enable-timed-out condition carries its code out-of-band', () => {
  it('mints its OWN beacio-owned sentence and classifies EXTENSION_NOT_ENABLED through BOTH paths', () => {
    const err = beacioDomException(ACTIVATION_ENABLE_TIMED_OUT);
    expect(err.name).toBe('NotFoundError');
    expect(err.message).toBe('Beacio activation timed out');
    expect(err.message).not.toBe(CHROMIUM_CANCEL_MESSAGE); // never the frozen cancel bytes
    expect(coreCode(err)).toBe('EXTENSION_NOT_ENABLED'); // ← RED today: USER_CANCELLED
    expect(presenterCode(err)).toBe('EXTENSION_NOT_ENABLED'); // ← RED today: USER_CANCELLED
  });

  it('activation-dismissed stays USER_CANCELLED; enable-timed-out no longer shares the frozen bytes', () => {
    const dismissed = beacioDomException(ACTIVATION_DISMISSED);
    expect(dismissed.name).toBe('NotFoundError');
    expect(dismissed.message).toBe(CHROMIUM_CANCEL_MESSAGE);
    expect(coreCode(dismissed)).toBe('USER_CANCELLED'); // GREEN today (unchanged)
    expect(presenterCode(dismissed)).toBe('USER_CANCELLED');

    const timedOut = beacioDomException(ACTIVATION_ENABLE_TIMED_OUT);
    // The point of the unit: DIFFERENT bytes, DIFFERENT code.
    expect(timedOut.name).toBe(dismissed.name);
    expect(timedOut.message).not.toBe(dismissed.message);
    expect(coreCode(timedOut)).not.toBe(coreCode(dismissed));
    expect(coreCode(timedOut)).toBe('EXTENSION_NOT_ENABLED');
  });

  it('ignores a forged out-of-band code (hostile-page guard) and falls back to text classification', () => {
    // A page CAN attach the symbol itself — carriedConditionCode must reject a
    // value outside the closed carried-code set, not mint an unknown BeacioErrorCode.
    const forged = new DOMException(CHROMIUM_CANCEL_MESSAGE, 'NotFoundError');
    Object.defineProperty(forged, Symbol.for('beacio.conditionCode'), {
      value: 'NOT_A_CODE', writable: false, enumerable: false, configurable: true,
    });
    expect(coreCode(forged)).toBe('USER_CANCELLED');
    expect(presenterCode(forged)).toBe('USER_CANCELLED');
  });

  it('activation-enable-timed-out: .message echoes its OWN honest sentence (not the SUGGESTION, not the cancel bytes)', () => {
    // R3 flips: the enable-timeout no longer reuses the cancel sentence, so the
    // message-aware "drop the cancel-sentence lie" branch no longer fires for it;
    // the honest sentence is ECHOED (adds-detail), exactly like grant-wall.
    const err = BeacioError.from(beacioDomException(ACTIVATION_ENABLE_TIMED_OUT));
    expect(err.code).toBe('EXTENSION_NOT_ENABLED'); // coherence — already pinned elsewhere
    expect(err.message).toBe(sanitizeNativeMessage(ACTIVATION_ENABLE_TIMED_OUT.message)); // RED today: SUGGESTION
    expect(err.message).toBe('Beacio activation timed out');
  });

  it('the NEW sentence classifies EXTENSION_NOT_ENABLED on the RAW and SANITIZED re-entry paths — never DEVICE_NOT_FOUND', () => {
    const raw = new DOMException('Beacio activation timed out', 'NotFoundError');
    expect(coreCode(raw)).toBe('EXTENSION_NOT_ENABLED'); // ← RED today: DEVICE_NOT_FOUND
    expect(presenterCode(raw)).toBe('EXTENSION_NOT_ENABLED'); // ← RED today: DEVICE_NOT_FOUND
    // Version-skew re-entry: a sanitized message (no DOM name) must still land
    // EXTENSION_NOT_ENABLED, not silently DEVICE_NOT_FOUND (the R3 table-first contract).
    const sanitized = sanitizeNativeMessage('Beacio activation timed out');
    expect(sanitized).toBe('Beacio activation timed out');
    expect(coreCode(new Error(sanitized))).toBe('EXTENSION_NOT_ENABLED'); // ← RED today: DEVICE_NOT_FOUND
  });

  it('grant-wall / cdn-dormant / cdn-restore-pending still echo their NATIVE sentences (regression guard)', () => {
    // The L2 blind-spot guard: a naive CODE-keyed restatement would strip these
    // three too. They carry EXTENSION_NOT_ENABLED with their OWN sentences, which
    // text-classify 'extension-not-enabled' — their native text MUST survive.
    expect(BeacioError.from(beacioDomException(GRANT_WALL)).message).toBe(sanitizeNativeMessage(GRANT_WALL.message));
    expect(BeacioError.from(beacioDomException(CDN_DORMANT)).message).toBe(sanitizeNativeMessage(CDN_DORMANT.message));
    expect(BeacioError.from(beacioDomException(CDN_RESTORE_PENDING)).message).toBe(sanitizeNativeMessage(CDN_RESTORE_PENDING.message));
  });
});

/**
 * GRANT WALL — migrated 2026-08-18 from the standalone
 * `extension-not-enabled-classification.test.ts`, whose twelve table rows were
 * byte-duplicates of the CASES rows above (same inputs, same expectations, same
 * helpers). What those rows did NOT already buy lives here: the two direct
 * not-this-other-code negatives, the taxonomy sites the code drags along
 * (SUGGESTIONS + RETRIABLE_CODES), the LOCALIZED card render, and the structural
 * pins on the SHIPPED page-realm emitter.
 *
 * THE DEFECT THIS PINS: `src/extension/page-bootstrap.ts` (`scanUnavailableError`)
 * rejects with a NotFoundError when the origin has NOT enabled the beacio
 * extension. The DOM name is correct and frozen — Chromium maps
 * CHOOSER_NOT_SHOWN_API_LOCALLY_DISABLED onto NotFoundError
 * (`bluetooth_error.cc:161-163`), and the V12-03 headline invariant forbids a
 * NotAllowedError site in the page realm — so the CLASSIFICATION layers are the
 * only place this can be fixed. Before the fix the sentence matched no special
 * case and fell through to DEVICE_NOT_FOUND: an origin that had simply not
 * finished setup was told "No device found", the wrong signal at precisely the
 * onboarding moment.
 *
 * USER DECISION (2026-08-12, explicit): a DISTINCT code, not a reuse of
 * USER_CANCELLED and not an acceptance of DEVICE_NOT_FOUND. `EXTENSION_NOT_ENABLED`
 * is the deliberate sibling of `EXTENSION_NOT_INSTALLED`
 * (installed-but-not-enabled-for-this-origin vs not-installed-at-all), matching
 * the repo's SUBJECT_NOT_PREDICATE convention, and non-retriable like it.
 */
describe('GRANT-WALL: the "extension not enabled for this origin" NotFoundError is its own code', () => {
  // `satisfies` pins each literal to core's real contract WITHOUT widening the
  // comparison sites: they keep their literal string types, so a typo — or a
  // future rename of a code — is a compile error here rather than an assertion
  // that can never be true.
  const EXTENSION_NOT_ENABLED = 'EXTENSION_NOT_ENABLED' satisfies BeacioErrorCode;
  const USER_CANCELLED = 'USER_CANCELLED' satisfies BeacioErrorCode;
  const DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND' satisfies BeacioErrorCode;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    clear();
  });

  /**
   * The presenter's code for a value rendered in an EXPLICIT language — the
   * localized sibling of the module-level `presenterCode`, which lets
   * navigator.language (en-US under jsdom) select the pack.
   */
  function presenterCodeIn(input: unknown, lang: string): string {
    cardEl()?.remove();
    const el = presentError(input, { lang });
    expect(el).not.toBeNull();
    return el?.dataset.beacioErrorCode ?? '';
  }

  function hasRetryAffordance(): boolean {
    const el = cardEl();
    if (!el) return false;
    return Array.from(el.querySelectorAll<HTMLElement>('button, a')).some((c) =>
      /retry|try again|reconnect|erneut/i.test(c.textContent || '')
    );
  }

  it('never presents an un-enabled origin as the DEVICE_NOT_FOUND card', () => {
    // The concrete user-visible consequence of the defect, asserted directly.
    const err = new DOMException(GRANT_WALL_MESSAGE, 'NotFoundError');
    expect(coreCode(err)).not.toBe(DEVICE_NOT_FOUND);
    expect(presenterCode(err)).not.toBe(DEVICE_NOT_FOUND);
  });

  it('does NOT reuse USER_CANCELLED for the grant wall (the explicit 2026-08-12 decision)', () => {
    // Nothing was cancelled: reusing USER_CANCELLED would make the SDK silently
    // swallow a setup failure that the caller must surface.
    const err = new DOMException(GRANT_WALL_MESSAGE, 'NotFoundError');
    expect(coreCode(err)).not.toBe(USER_CANCELLED);
    expect(presenterCode(err)).not.toBe(USER_CANCELLED);
  });

  it('core carries a DISTINCT, non-retriable suggestion for the new code (errors.ts SUGGESTIONS + RETRIABLE_CODES)', () => {
    const err = BeacioError.from(new DOMException(GRANT_WALL_MESSAGE, 'NotFoundError'));
    expect(err.code).toBe(EXTENSION_NOT_ENABLED);
    // Non-retriable, like its EXTENSION_NOT_INSTALLED sibling: retrying without
    // finishing setup can only fail again.
    expect(err.isRetriable).toBe(false);
    expect(err.suggestion.length).toBeGreaterThan(0);
    expect(err.suggestion).not.toContain('undefined');
    // A real entry, not DEVICE_NOT_FOUND's copy borrowed by accident.
    expect(err.suggestion).not.toBe(new BeacioError('DEVICE_NOT_FOUND').suggestion);
  });

  const LOCALES: ReadonlyArray<{ label: string; lang: string }> = [
    { label: 'English', lang: 'en' },
    { label: 'German', lang: 'de' },
  ];

  it.each(LOCALES)('the $label card renders real copy for the new code — no retry, no "undefined" (i18n titles+messages)', ({ lang }) => {
    const err = new DOMException(GRANT_WALL_MESSAGE, 'NotFoundError');
    expect(presenterCodeIn(err, lang)).toBe(EXTENSION_NOT_ENABLED);
    const text = cardText().trim();
    // A code missing from the locale pack renders the literal string
    // "undefined" into the card (pack.titles[code] === undefined → esc()).
    expect(text).not.toContain('undefined');
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/Bluefy/i);
    // Not retriable ⇒ no retry affordance (pins the shared RETRIABLE_CODES).
    expect(hasRetryAffordance()).toBe(false);
    // Distinct copy, not DEVICE_NOT_FOUND's card text reused.
    clear();
    presentError(new DOMException('No Devices Found', 'NotFoundError'), { lang });
    expect(text).not.toBe(cardText().trim());
  });

  /**
   * Layer 3 — the SHIPPED page-realm emitter rows (the third copy of this knowledge).
   *
   * S5-D re-anchored: the page realm no longer carries emitter LITERALS — its one mint
   * (`mintConditionError`) constructs from the serialized PAGE_BOOTSTRAP_CONDITIONS rows,
   * so the rows ARE the shipped messages (page-bootstrap-uuid.test.ts pins the serialized
   * bytes; page-bootstrap.test.ts pins the rejection behaviorally). Selection stays
   * STRUCTURAL and never mentions message text or expected codes:
   *   - the WIRING is pinned in shipped source by enclosing-function shape
   *     (`scanUnavailableError` returning the 'grant-wall' mint; the listener ternary
   *     naming the two activation ids);
   *   - the MESSAGES come from the rows those ids select, classified through both layers.
   *
   * `src/extension/` is shipped, public, injected JS: this block only READS it.
   * Node builtins via require() (ts-jest emits CommonJS), typed by @types/node
   * through tests/tsconfig.json.
   */
  describe('the SHIPPED page-realm emitter rows', () => {
    const PAGE_BOOTSTRAP = 'src/extension/page-bootstrap.ts';
    const { readFileSync } = require('fs');
    const { resolve } = require('path');
    const REPO_ROOT: string = resolve(__dirname, '..', '..', '..', '..');
    // Same-package import via require so the block keeps its CommonJS idiom.
    const { PAGE_BOOTSTRAP_CONDITIONS } = require('../../src/error-conditions');

    function pageBootstrapSource(): string {
      return readFileSync(resolve(REPO_ROOT, PAGE_BOOTSTRAP), 'utf8');
    }

    it('the grant-wall row is coded EXTENSION_NOT_ENABLED by BOTH layers, and its mint wiring is intact', () => {
      const src = pageBootstrapSource();
      // Anti-vacuity: the enclosing-function pin — if the emitter is renamed or
      // rewired away from the grant-wall condition, fail LOUDLY.
      expect(
        src.match(/function\s+scanUnavailableError\s*\([^)]*\)\s*:\s*DOMException\s*\{\s*return\s+mintConditionError\('grant-wall'\)\s*;?\s*\}/g)
      ).toHaveLength(1);
      const message: string = PAGE_BOOTSTRAP_CONDITIONS['grant-wall'].message;
      expect(message.length).toBeGreaterThan(0);
      const err = new DOMException(message, 'NotFoundError');
      expect(coreCode(err)).toBe(EXTENSION_NOT_ENABLED);
      expect(presenterCodeIn(err, 'en')).toBe(EXTENSION_NOT_ENABLED);
    });

    it('the page-realm condition SENTENCES do NOT collapse onto one code', () => {
      // THE DEFECT, stated structurally: the page realm rejects NotFoundError for
      // categorically different situations. Every DISTINCT sentence its rows carry
      // must classify to its own non-DEVICE_NOT_FOUND code in both layers. After V7
      // no two rows share a sentence: activation-dismissed carries the frozen cancel
      // sentence (USER_CANCELLED), and activation-enable-timed-out carries its OWN
      // beacio-owned sentence (EXTENSION_NOT_ENABLED) — so the collapse guard is
      // stated over SENTENCES, exactly what a text classifier can see, and two
      // DISTINCT sentences may legitimately reach EXTENSION_NOT_ENABLED (grant-wall
      // AND enable-timed-out).
      const src = pageBootstrapSource();
      expect(src.match(/'enable-timed-out'\s*\?\s*'activation-enable-timed-out'\s*:\s*'activation-dismissed'/g)).toHaveLength(1);

      const rows = Object.values(PAGE_BOOTSTRAP_CONDITIONS) as ReadonlyArray<{ message: string }>;
      expect(rows.length).toBe(3);
      const distinctSentences = [...new Set(rows.map((row) => row.message))];
      expect(distinctSentences.length).toBe(3);

      const codes = distinctSentences.map((message) => {
        expect(message.length).toBeGreaterThan(0);
        const err = new DOMException(message, 'NotFoundError');
        const fromCore = coreCode(err);
        expect(presenterCodeIn(err, 'en')).toBe(fromCore);
        return fromCore;
      });

      expect(codes).not.toContain(DEVICE_NOT_FOUND);
      // Payload order: grant-wall (EXTENSION_NOT_ENABLED), then the shared cancel
      // sentence (dismissed → USER_CANCELLED), then the enable-timeout's own sentence
      // (EXTENSION_NOT_ENABLED). Two DISTINCT sentences now legitimately reach
      // EXTENSION_NOT_ENABLED, so there is NO uniqueness invariant over codes.
      expect(codes).toEqual([EXTENSION_NOT_ENABLED, USER_CANCELLED, EXTENSION_NOT_ENABLED]);
    });
  });
});

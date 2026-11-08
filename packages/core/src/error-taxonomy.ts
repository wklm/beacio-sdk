/**
 * The beacio error TAXONOMY — the ONE definition of what a native BLE failure
 * means, shared by every layer that has to decide.
 *
 * Until 2026-08-12 this knowledge existed twice — `../errors.ts` and
 * `./detect/error-presenter.ts` each re-declared the code union, the retriable
 * set, the NotFoundError fragment table and a message classifier — and the two
 * had silently diverged on eleven inputs. The duplication was justified by an
 * "@beacio/core is an OPTIONAL peer of @beacio/detect" rule that no longer
 * exists: there is no `packages/detect`, `./detect` is a SUBPATH EXPORT of core
 * itself, and the detect modules already import `../events` / `../urls`.
 *
 * WHY THIS FILE IS (STILL) A LEAF — S5 amendment: it imports ONLY
 * `./error-conditions`, itself a runtime-import-free leaf, so the transitive
 * runtime closure is these two files and nothing else.
 * `dist/browser-auto.global.js` — the zero-config drop-in — bundles the detect
 * presenter but deliberately NOT the full BLE wrapper graph, and
 * `tests/bundle-size-budget.test.ts` caps it at 19,456 B gzip. Reaching the
 * classifier through `../errors.ts` instead would drag in `BeacioError`, the
 * `SUGGESTIONS` copy table and `withRetry` (+1,385 B gzip measured at the
 * split; re-measured per release). Those three stay in `../errors.ts` and
 * remain unreachable from here.
 */
import {
  ACTIVATION_ENABLE_TIMED_OUT,
  CDN_DORMANT,
  CDN_RESTORE_PENDING,
  GRANT_WALL,
  UNSUPPORTED_PLATFORM_INSTALL,
  carriedConditionCode,
} from './error-conditions';

/**
 * Machine-readable error codes for all Beacio operations.
 * Use in catch blocks to handle specific failure modes.
 *
 * @example
 * ```typescript
 * try {
 *   await device.read('heart_rate', 'heart_rate_measurement')
 * } catch (e) {
 *   if (e instanceof BeacioError) {
 *     switch (e.code) {
 *       case 'DEVICE_DISCONNECTED': await device.connect(); break;
 *       case 'CHARACTERISTIC_NOT_READABLE': device.subscribe(...); break;
 *       default: console.error(e.suggestion);
 *     }
 *   }
 * }
 * ```
 */
export type BeacioErrorCode =
  /** Invalid argument passed to an SDK method (e.g. negative timeout, malformed UUID). Not retriable. */
  | 'INVALID_PARAMETER'
  /** Browser or platform does not support Web Bluetooth at all. Not retriable. */
  | 'BLUETOOTH_UNAVAILABLE'
  /** The Beacio Safari extension is not installed. Show an install banner via `@beacio/core/detect`. Not retriable. */
  | 'EXTENSION_NOT_INSTALLED'
  /**
   * The Beacio Safari extension is installed but has not been enabled for THIS
   * origin (Safari's per-site extension grant), so `navigator.bluetooth` is inert
   * here. Distinct from {@link EXTENSION_NOT_INSTALLED} (nothing installed at all)
   * and from `DEVICE_NOT_FOUND` (the radio ran and found nothing) — the recovery is
   * "aA → Manage Extensions → {@link IOS_GRANT_WORDING_CANONICAL}", not "move the device closer".
   * Not retriable.
   */
  | 'EXTENSION_NOT_ENABLED'
  /** User denied Bluetooth permission, or the call was not triggered by a user gesture. Not retriable. */
  | 'PERMISSION_DENIED'
  /** No BLE device matched the given scan filters, or the device picker returned empty. Not retriable. */
  | 'DEVICE_NOT_FOUND'
  /** GATT operation attempted on a disconnected device. Retriable -- call `connect()` first. */
  | 'DEVICE_DISCONNECTED'
  /** Device did not respond within the connection timeout window. Retriable -- check range and advertising state. */
  | 'CONNECTION_TIMEOUT'
  /** The requested GATT service UUID was not found on the connected device. Not retriable. */
  | 'SERVICE_NOT_FOUND'
  /** The requested characteristic UUID was not found in the specified service. Not retriable. */
  | 'CHARACTERISTIC_NOT_FOUND'
  /** The characteristic does not support the read property. Use `subscribe()` for notify-only characteristics. Not retriable. */
  | 'CHARACTERISTIC_NOT_READABLE'
  /** The characteristic does not support write or writeWithoutResponse. Not retriable. */
  | 'CHARACTERISTIC_NOT_WRITABLE'
  /** The characteristic does not support notify or indicate. Use `read()` for polling. Not retriable. */
  | 'CHARACTERISTIC_NOT_NOTIFIABLE'
  /** Generic GATT failure (device busy, stack error, disconnected mid-operation). Retriable. */
  | 'GATT_OPERATION_FAILED'
  /** A BLE scan is already running. Stop the current scan before starting a new one. Retriable. */
  | 'SCAN_ALREADY_IN_PROGRESS'
  /** `Beacio.maxConnections` limit reached. Disconnect another device before connecting. Not retriable. */
  | 'CONNECTION_LIMIT_REACHED'
  /** User dismissed the device picker without selecting a device. Not retriable. */
  | 'USER_CANCELLED'
  /** A read/write/connect operation did not complete within the specified timeout. Retriable. */
  | 'TIMEOUT'
  /** A chunked write was only partially completed. Retry with smaller chunks or reconnect. Retriable. */
  | 'WRITE_INCOMPLETE';

/**
 * The ONE canonical label of Safari's per-extension grant control — the
 * aA → Manage Extensions → beacio gesture target. Defined exactly once here,
 * in the shared leaf both the SDK entry and the detect subpath already bundle
 * (so composing it adds no bundle weight to either), and composed into every
 * user-facing surface: `errors.ts` SUGGESTIONS and `detect/i18n.ts`
 * EN_STRINGS. Truths it pins:
 *  - U9-DOCS-COHERENCE — this is the ~30-site canonical spelling;
 *  - R-43's GRANT_WORDING_CANONICAL anchor — canonical REQUIRED on live
 *    surfaces; the dropped-"on" legacy spelling is tolerated only on archived
 *    leaving artifacts;
 *  - the OUTCOME F-B device split (iOS 26.6) — the Settings-app row is a
 *    DIFFERENT control ("Other Websites") and must never be canonicalized
 *    into this label.
 */
export const IOS_GRANT_WORDING_CANONICAL = 'Allow on Every Website';

/**
 * Codes that are safe to retry. `BeacioError.isRetriable` is computed from this
 * set, `withRetry` obeys it, and the branded card shows a retry affordance for
 * exactly these — one set, so the SDK and the UI can never disagree.
 */
export const RETRIABLE_CODES: ReadonlySet<BeacioErrorCode> = new Set<BeacioErrorCode>([
  'DEVICE_DISCONNECTED',
  'CONNECTION_TIMEOUT',
  'GATT_OPERATION_FAILED',
  'TIMEOUT',
  'SCAN_ALREADY_IN_PROGRESS',
  'WRITE_INCOMPLETE',
]);

/**
 * Per-code backoff hint applied to a CLASSIFIED native failure
 * (`BeacioError.from`). Reproduces the `{ retryAfterMs: 1000 }` that used to be
 * repeated at each of the four disconnect/timeout classification sites. A code
 * absent here yields `undefined`, i.e. "no hint — use the caller's backoff".
 */
export const RETRY_AFTER_MS: Readonly<Partial<Record<BeacioErrorCode, number>>> = {
  DEVICE_DISCONNECTED: 1000,
  TIMEOUT: 1000,
};

/** Known competitor/product names that must never surface to a Beacio user. */
const COMPETITOR_TOKENS = /\b(bluefy|web ble browser|webble browser)\b/gi;

/**
 * What the NATIVE sentence is still worth once the code is known — the ONE
 * consumer-visible difference between two paths that reach the SAME code. The
 * branded card ignores this (it never renders native text); `BeacioError.from`
 * uses it to decide whether `.message` echoes the device or falls back to the
 * per-code SUGGESTION.
 */
export type NativeMessageValue =
  /** The sentence carries detail the SUGGESTION does not (a UUID, an operation, a cause) — carry it. */
  | 'adds-detail'
  /** The sentence only restates the code ("no devices found", a dismissed chooser) — drop it. */
  | 'restates-the-code';

/** A classification decision: the code, plus what the native sentence is worth. */
export interface Classification {
  readonly code: BeacioErrorCode;
  readonly nativeMessage: NativeMessageValue;
}

const detail = (code: BeacioErrorCode): Classification => ({ code, nativeMessage: 'adds-detail' });
const restatement = (code: BeacioErrorCode): Classification => ({ code, nativeMessage: 'restates-the-code' });

/**
 * S5-B (table-first, R3 EXTENDED): a first-party fragment is the SANITIZE
 * FIXED-POINT of the row's frozen sentence, lower-cased. Why not the raw
 * sentence: `BeacioError.message` stores the SANITIZED line (`errors.ts`), and
 * an unknown-code BeacioError re-entering the presenter's raw branch — the
 * version-skew scenario this table must survive — carries that form, with the
 * trailing period stripped AND any URL removed (the auto.ts sentence ends in
 * one; a minus-period-only fragment would still miss it). The fixed-point is
 * contained in both the raw and the sanitized form, and `sanitizeNativeMessage`
 * is idempotent on all three sentences (verified 2026-08-12). Each fragment
 * CONTAINS its old hand-narrowed fragment, so this only NARROWS matching —
 * the adjudicated §4 narrowing, pinned in tests/error-conditions.test.ts.
 */
const sentenceFragment = (message: string): string => sanitizeNativeMessage(message).toLowerCase();

/**
 * The message fragments that discriminate the overloaded NotFoundError, in
 * PRIORITY order — the first fragment contained in the (lower-cased) message
 * wins, so a message carrying two of them still classifies deterministically.
 *
 * WHY A MESSAGE TABLE AT ALL: Web Bluetooth OVERLOADS `NotFoundError`. Chromium
 * maps CHOOSER_CANCELLED (the user dismissing the chooser) AND
 * CHOOSER_NOT_SHOWN_API_LOCALLY_DISABLED (the API is switched off for this
 * origin) onto the SAME DOMException name as a pile of genuine failures
 * (NO_BLUETOOTH_ADAPTER, CHOSEN_DEVICE_VANISHED, WEB_BLUETOOTH_NOT_SUPPORTED,
 * NO_SERVICES_FOUND, …). See
 * `third_party/blink/renderer/modules/bluetooth/bluetooth_error.cc` lines
 * 148-178. The MESSAGE is therefore the only discriminator.
 *
 * Each row carries the FULL {@link Classification} it means — the code AND what
 * the native sentence is still worth — so the two can never be encoded apart. A
 * cancellation deliberately RESTATES: "no device selected" is not a failure
 * worth echoing Chromium's wording for.
 *
 * Two layers in one mechanism (S5-B): the FOREIGN rows stay hand-written
 * heuristics (Chromium's bytes are not ours to single-source), while the
 * first-party rows are the emitters' own frozen sentences referenced from
 * `./error-conditions` — table edits and emitter output can no longer drift.
 * Every fragment is deliberately NARROW, and each row records what a wider one
 * would have stolen. This table used to exist twice (core + presenter), pinned to
 * itself by a regex-scraping test; there is now one table, so that test is gone.
 */
const NOT_FOUND_FRAGMENTS: readonly { readonly fragment: string; readonly classification: Classification }[] = [
  // Chromium's CHOOSER_CANCELLED sentence, which the beacio polyfill emits
  // verbatim (`src/extension/page-bootstrap.ts`, `src/beacio/api/bluetooth.ts`).
  // No other NotFoundError message in Chromium's table contains it. Both
  // spellings are matched because both ship in the wild. FOREIGN rows — kept
  // FIRST and load-bearing forever (version skew: older emitters + Chromium
  // itself keep producing these bytes).
  { fragment: 'user cancelled', classification: restatement('USER_CANCELLED') },
  { fragment: 'user canceled', classification: restatement('USER_CANCELLED') },
  // Grant wall: "User has not enabled Web Bluetooth for this origin." beacio IS
  // installed but inert here, so the recovery is a beacio setup step and never
  // "go look for your device".
  // Full-sentence on purpose — NOT 'web bluetooth' (that steals Chromium's
  // WEB_BLUETOOTH_NOT_SUPPORTED and "Web Bluetooth API globally disabled.") and
  // NOT 'not enabled' (that steals adapter-state wording such as
  // "Bluetooth is not enabled."). Bytes single-sourced from the emitter's row.
  { fragment: sentenceFragment(GRANT_WALL.message), classification: detail('EXTENSION_NOT_ENABLED') },
  // CDN loader: "Beacio is installed but not active. Follow the Beacio setup
  // prompt, then retry." — the SAME condition as the grant wall, reached on a
  // different surface (src/cdn/beacio.ts replaces requestDevice while the
  // extension is dormant). NOT 'not active', which would reach adapter/scan
  // wording that has nothing to do with beacio.
  { fragment: sentenceFragment(CDN_DORMANT.message), classification: detail('EXTENSION_NOT_ENABLED') },
  // CDN loader inside Safari's post-restore window: "Beacio is still starting up
  // in this tab. Wait a moment, then retry." The extension IS installed and IS
  // enabled here — Safari has not loaded its contexts into this restored tab
  // yet — so it takes the same reason as its cdn-dormant sibling: "the API is
  // not usable on this surface right now", never DEVICE_NOT_FOUND, which would
  // send the user hunting for a device that is sitting right there. Full-sentence
  // on purpose: 'starting up' alone would steal adapter/power-state wording.
  { fragment: sentenceFragment(CDN_RESTORE_PENDING.message), classification: detail('EXTENSION_NOT_ENABLED') },
  // Enable-flow timeout (V7): "Beacio activation timed out" — beacio-owned; the
  // enable timed out at onboarding, NOT a cancellation and NEVER DEVICE_NOT_FOUND.
  // Its own sentence (no longer the frozen cancel bytes) needs its own
  // full-sentence row — otherwise the sanitize re-entry path (BeacioError stores
  // the sanitized line) silently re-classifies it to DEVICE_NOT_FOUND (the V7
  // regression this row prevents).
  { fragment: sentenceFragment(ACTIVATION_ENABLE_TIMED_OUT.message), classification: detail('EXTENSION_NOT_ENABLED') },
  // Unsupported-platform stub: "Web Bluetooth is not supported on this platform.
  // On iOS Safari, install the Beacio extension. See: https://beacio.com" —
  // @beacio/core's own stub (packages/core/src/auto.ts), which pops the install
  // banner on the very call that throws. NOT installed at all, so the recovery is
  // "install it": a different instruction, and a different card, from the rows above.
  // The full sentence CONTAINS Chromium's WEB_BLUETOOTH_NOT_SUPPORTED string as
  // its verbatim LEADING sentence — matching the whole (sanitized) sentence
  // keeps Chromium's own short sentence classifying DEVICE_NOT_FOUND, exactly
  // as the old beacio-specific-tail fragment did.
  { fragment: sentenceFragment(UNSUPPORTED_PLATFORM_INSTALL.message), classification: detail('EXTENSION_NOT_INSTALLED') },
];

/**
 * The single definition of "what this native NotFoundError message actually
 * means", used by every classification path so they can never disagree.
 *
 * Takes the RAW text and lower-cases INTERNALLY, so a stack-suffixed or
 * differently-cased native message still classifies and no caller can forget to
 * lower-case first. `null` means "no fragment matched" — deliberately NOT
 * DEVICE_NOT_FOUND, because the message rules below the DOM-name switch must
 * still get their turn; each caller decides what a non-match is worth.
 */
function notFoundReason(rawMessage: string): Classification | null {
  const lower = rawMessage.toLowerCase();
  for (const { fragment, classification } of NOT_FOUND_FRAGMENTS) {
    if (lower.includes(fragment)) return classification;
  }
  return null;
}

/**
 * THE classifier — the pure decision over an ALREADY-EXTRACTED carrier. Both the
 * SDK (`BeacioError.from`) and the branded card (`presentError`) route through
 * {@link classifyThrown}, which extracts and delegates here, so a DOMException
 * can never be coded one way for a caller's `switch` and another way for the
 * card the same user is looking at.
 *
 * All three arguments are REQUIRED (no optional arguments): `domName` is `''`
 * when the carrier had no DOM name (a plain Error re-thrown across a bridge) —
 * the message rules below still apply to it — and `fallback` is the caller's own
 * fallback code for the SDK, `'GATT_OPERATION_FAILED'` for the presenter. The
 * carried-code authority (GH #354) lives in {@link classifyThrown}: it needs the
 * THROWN value, not an extracted field, so this signature stays a flat,
 * unswappable (domName, rawMessage, fallback).
 *
 * Every rule below was ADJUDICATED on 2026-08-12, when the twins were collapsed:
 * ten of the eleven inputs on which they disagreed were resolved in core's
 * favour, one (`timeout`) in the presenter's. Each decision and its reasoning is
 * recorded EXECUTABLY, in the `ADJUDICATED` table of
 * tests/detect/error-presenter-core-parity.test.ts, which also pins what the
 * losing side used to answer — change a rule here and that table names it.
 */
export function classifyError(domName: string, rawMessage: string, fallback: BeacioErrorCode): Classification {
  const lower = rawMessage.toLowerCase();

  switch (domName) {
    // Convention 5: the polyfill rehydrates native validation failures as
    // REAL TypeErrors (invalid UUIDs, malformed filters — Web Bluetooth §7).
    case 'TypeError':
      return detail('INVALID_PARAMETER');
    // NotFoundError is overloaded (see NOT_FOUND_FRAGMENTS): a dismissed chooser, an
    // origin that never enabled the extension, and a genuine "nothing to connect
    // to" all arrive under the same DOM name. Disambiguate HERE, by message — if
    // this returned a flat DEVICE_NOT_FOUND, `USER_CANCELLED` /
    // `EXTENSION_NOT_ENABLED` would be unreachable and callers would be forced to
    // re-sniff the raw message (or, worse, suppress every NotFoundError and hide
    // real failures). Reporting an un-enabled origin as "device not found" is the
    // worst of those: it sends a user hunting for their device at the exact moment
    // they need to finish setup.
    case 'NotFoundError':
      return notFoundReason(rawMessage) ?? detail('DEVICE_NOT_FOUND');
    case 'NotAllowedError':
    case 'SecurityError':
      return detail('PERMISSION_DENIED');
    case 'NetworkError':
      return detail('DEVICE_DISCONNECTED');
    case 'TimeoutError':
      return detail('TIMEOUT');
    case 'InvalidStateError':
      if (lower.includes('disconnect')) return detail('DEVICE_DISCONNECTED');
      break;
    default:
      break;
  }

  // The NOT_FOUND_FRAGMENTS rows are MESSAGE-keyed, so they also apply to a carrier
  // that never had the DOM name. A `null` here means only "the message identifies
  // no special row" — it must NOT short-circuit into DEVICE_NOT_FOUND, or the rules
  // below never run.
  const special = notFoundReason(rawMessage);
  if (special !== null) return special;

  if (lower.includes('no devices found') || rawMessage.includes('No Devices')) return restatement('DEVICE_NOT_FOUND');
  if (rawMessage.includes('No Services matching') || lower.includes('service not found')) return detail('SERVICE_NOT_FOUND');
  if (rawMessage.includes('No Characteristics matching') || lower.includes('characteristic not found')) {
    return detail('CHARACTERISTIC_NOT_FOUND');
  }
  if (rawMessage.includes('GATT Server is disconnected') || lower.includes('disconnected')) return detail('DEVICE_DISCONNECTED');
  if (lower.includes('not supported') && lower.includes('read')) return detail('CHARACTERISTIC_NOT_READABLE');
  if (lower.includes('not supported') && lower.includes('write')) return detail('CHARACTERISTIC_NOT_WRITABLE');
  if (lower.includes('not supported') && lower.includes('notif')) return detail('CHARACTERISTIC_NOT_NOTIFIABLE');
  if (lower.includes('permission')) return detail('PERMISSION_DENIED');
  // D9: LAST, immediately before the fallback — see the adjudication note above.
  if (lower.includes('timeout')) return detail('TIMEOUT');

  return detail(fallback);
}

/**
 * THE thrown-value seam (R-14): classify whatever a catch block actually
 * received — a DOMException, an Error, a bare string, any unknown carrier. Both
 * production callers (`BeacioError.from`, `presentError`) route through this ONE
 * function, so the carrier destructuring (the DOM-name dance, the message
 * extraction, the carried-code read) exists exactly once, and the two adjacent
 * `BeacioErrorCode` positional parameters the old four-argument classifyError
 * exposed can no longer be swapped at a call site.
 *
 * `fallback` is REQUIRED (no optional arguments): the SDK passes the caller's
 * own fallback code, the presenter passes `'GATT_OPERATION_FAILED'`.
 *
 * GH #354: the validated out-of-band discriminator a minted DOMException carries
 * under `Symbol.for('beacio.conditionCode')` is authoritative OVER the
 * (byte-shared) message heuristics — chooser-cancelled and activation-dismissed
 * share one byte-frozen cancel sentence (both USER_CANCELLED), while
 * activation-enable-timed-out (V7) carries its own beacio-owned sentence. A
 * carried `USER_CANCELLED` restates the code (drop the native text); every other
 * carried code adds-detail — mirroring {@link NOT_FOUND_FRAGMENTS} — EXCEPT a
 * carried `EXTENSION_NOT_ENABLED` whose message text-classifies as the cancel
 * sentence: that is a VERSION-SKEW GUARD for pre-V7 emitters
 * (activation-enable-timed-out used to reuse the frozen cancel bytes), so R3
 * drops that native text too, MESSAGE-AWARE (cancel sentence → drop, NOT
 * code-keyed), and `.message` falls back to the EXTENSION_NOT_ENABLED SUGGESTION
 * instead of echoing a cancellation the user did not perform. The LIVE
 * enable-timed-out row carries its own sentence, which text-classifies
 * 'extension-not-enabled' (NOT_FOUND_FRAGMENTS), so it never reaches that branch
 * and is ECHOED — same as grant-wall / cdn-dormant / cdn-restore-pending.
 *
 * The name/message rules themselves stay in {@link classifyError}, the ONE
 * definition every classification path answers through.
 */
export function classifyThrown(error: unknown, fallback: BeacioErrorCode): Classification {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const carried = carriedConditionCode(error);
  if (carried) {
    if (carried === 'USER_CANCELLED') return restatement('USER_CANCELLED');
    if (carried === 'EXTENSION_NOT_ENABLED' && notFoundReason(rawMessage)?.code === 'USER_CANCELLED') {
      return restatement('EXTENSION_NOT_ENABLED');
    }
    return detail(carried);
  }
  // '' means "this carrier had no DOM name" (a plain Error re-thrown across a
  // bridge); classifyError's message-keyed rules still apply to it.
  const domName =
    typeof error === 'object' && error !== null && 'name' in error && typeof (error as { name: string }).name === 'string'
      ? (error as { name: string }).name
      : '';
  return classifyError(domName, rawMessage, fallback);
}

/**
 * Reduce a raw native error message to a single, complete-sentence
 * line that is safe to show via a bare `alert(error.toString())` — no stack frames,
 * no native `webkit://`/`http(s)://` URLs, and no competitor names. A clean,
 * single-line native message (e.g. "Invalid UUID: 'bogus'") is preserved verbatim
 * so the message-passthrough contracts in errors.test.ts do not regress; only the
 * unsafe trailing content is stripped. Returns '' when nothing meaningful remains,
 * so the caller can fall back to branded copy (the per-code SUGGESTION in the SDK,
 * the generic card body in the presenter).
 */
export function sanitizeNativeMessage(raw: string): string {
  // Keep only the first line — everything from the first newline (where V8/WebKit
  // append "    at …" stack frames) onward is dropped.
  let line = raw.split('\n', 1)[0] ?? '';
  // Strip native/internal URLs (webkit://…, http(s)://…) wherever they appear.
  line = line.replace(/\b(?:webkit|https?|chrome|moz-extension|safari-web-extension):\/\/\S+/gi, '');
  // Strip any residual single-line "at file.js:line:col" stack fragment.
  line = line.replace(/\bat\s+\S+:\d+:\d+\)?/gi, '');
  // Redact competitor names rather than leak them.
  line = line.replace(COMPETITOR_TOKENS, '');
  // Collapse whitespace left by the redactions and tidy dangling punctuation.
  line = line.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
  line = line.replace(/[\s.,;:]+$/g, '').trim();
  return line;
}

/**
 * @beacio/detect#presentError — SB-SDK-05
 *
 * A drop-in, framework-free branded ERROR presenter. The polished branded surface
 * already exists for the INSTALL prompt (banner.ts); this is its sibling for the
 * FAILURE path. S&B (and any vanilla-JS site) uses raw `navigator.bluetooth`
 * across hundreds of call sites and will not rewrite them — so the worst surface,
 * a blocking, stack-leaking `window.alert()`, is converted into a non-blocking,
 * dismissible, recovery-oriented card with a ~1-line edit:
 *
 *   catch (error) { beacioDetect.presentError(error); }
 *
 * Design constraints (mirroring banner.ts):
 *  - @beacio/core is an OPTIONAL peer (a standalone `npm i @beacio/detect` has no
 *    core), so this file MUST NOT import @beacio/core — not even the BeacioError
 *    class. Errors are consumed STRUCTURALLY: anything carrying a `.code` /
 *    `.message` / `.suggestion` / `.isRetriable` is understood, and the
 *    BeacioErrorCode → copy map + retriable set are kept LOCAL (pinned to core's
 *    public contract by the unit test, not by a runtime import).
 *  - The card NEVER leaks a stack trace, internal codes, WebKit jargon, or a
 *    competitor name. The friendly body comes from the per-code copy table, NOT
 *    the raw error string.
 *  - Identical errors fired in a short window are coalesced to ONE card (defends
 *    against the backgrounded alert-storm).
 *  - All user-visible strings are overridable via a copy/locale object
 *    (PresentErrorOptions.strings) — the i18n seam SB-SDK-07 converges on; the
 *    `lang` field selects a built-in pack (German shipped), and `strings`
 *    deep-merges over it. English defaults apply when neither is supplied (no
 *    regression). The per-code copy + dismiss/retry come from the SAME shared
 *    i18n module the install banner uses (./i18n), so a localized card and a
 *    localized banner never drift.
 */

// SB-SDK-07: the shared localized-string seam (same module the install banner
// consumes). i18n.ts imports NOTHING from @beacio/core — it re-declares the
// BeacioErrorCode union locally — so this stays within the optional-peer rule
// (no-toplevel-core-import.test.ts) just like this file's own local tables.
import { EN_STRINGS, type LocaleStrings, resolveStrings } from './i18n';

/**
 * The stable BeacioErrorCode contract (core/src/errors.ts). Kept local — not
 * imported — so detect has no runtime @beacio/core dependency. The presenter unit
 * test is the seam-crossing control that this list still matches core's source.
 */
export type BeacioErrorCode =
  | 'INVALID_PARAMETER'
  | 'BLUETOOTH_UNAVAILABLE'
  | 'EXTENSION_NOT_INSTALLED'
  | 'PERMISSION_DENIED'
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_DISCONNECTED'
  | 'CONNECTION_TIMEOUT'
  | 'SERVICE_NOT_FOUND'
  | 'CHARACTERISTIC_NOT_FOUND'
  | 'CHARACTERISTIC_NOT_READABLE'
  | 'CHARACTERISTIC_NOT_WRITABLE'
  | 'CHARACTERISTIC_NOT_NOTIFIABLE'
  | 'GATT_OPERATION_FAILED'
  | 'SCAN_ALREADY_IN_PROGRESS'
  | 'CONNECTION_LIMIT_REACHED'
  | 'USER_CANCELLED'
  | 'TIMEOUT'
  | 'WRITE_INCOMPLETE';

/**
 * Codes that are safe to retry — mirrors RETRIABLE_CODES in core/src/errors.ts.
 * A retriable card shows a retry affordance; a non-retriable one does not.
 */
const RETRIABLE_CODES: ReadonlySet<BeacioErrorCode> = new Set<BeacioErrorCode>([
  'DEVICE_DISCONNECTED',
  'CONNECTION_TIMEOUT',
  'GATT_OPERATION_FAILED',
  'TIMEOUT',
  'SCAN_ALREADY_IN_PROGRESS',
  'WRITE_INCOMPLETE',
]);

/**
 * Per-code friendly headline + body. Plain-English, recovery-oriented, no internal
 * codes, no jargon, no competitor names. This is the body shown to the user — the
 * raw error string (which may carry a stack or a competitor name) is NEVER shown.
 *
 * SB-SDK-07: this is now a VIEW over the English pack (EN_STRINGS.error) so the
 * presenter's English source-of-truth and the shared i18n pack are a SINGLE
 * table — they cannot drift. Localized rendering reads the resolved pack (which
 * may be German); COPY is retained as the membership anchor isCodedError() uses
 * (`code in COPY`) and the English-completeness table error-presenter-core-parity
 * pins to core's BeacioErrorCode set.
 */
const COPY: Record<BeacioErrorCode, { title: string; body: string }> = Object.fromEntries(
  (Object.keys(EN_STRINGS.error.titles) as BeacioErrorCode[]).map((code) => [
    code,
    { title: EN_STRINGS.error.titles[code], body: EN_STRINGS.error.messages[code] },
  ])
) as Record<BeacioErrorCode, { title: string; body: string }>;

/** Competitor/product names that must never surface (mirrors errors.ts COMPETITOR_TOKENS). */
const COMPETITOR_TOKENS = /\b(bluefy|web ble browser|webble browser)\b/gi;

/**
 * AC1/AC6: the bare-string path (the S&B generateErrorMsg(errMsg) chokepoint) is
 * the ONE input whose body comes from the caller rather than the branded copy
 * table — and S&B builds those strings from the native error (appending
 * `error.stack`, referencing the competitor). Reduce such a string to a single,
 * complete-sentence line that is safe to render: drop everything from the first
 * newline (where stack frames begin), strip native/internal URLs and any residual
 * "at file:line:col" fragment, and redact competitor names. Mirrors core's
 * sanitizeNativeMessage (kept local — detect must not import @beacio/core). Returns
 * '' when nothing meaningful remains so the caller falls back to branded copy.
 */
function sanitizeMessage(raw: string): string {
  let line = raw.split('\n', 1)[0] ?? '';
  line = line.replace(/\b(?:webkit|https?|chrome|moz-extension|safari-web-extension):\/\/\S+/gi, '');
  line = line.replace(/\bat\s+\S+:\d+:\d+\)?/gi, '');
  line = line.replace(COMPETITOR_TOKENS, '');
  line = line.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
  line = line.replace(/[\s.,;:]+$/g, '').trim();
  return line;
}

/**
 * Caller-supplied copy/locale overrides — the i18n seam (SB-SDK-07). Every field
 * is optional; an omitted field falls back to the English default, so an existing
 * caller that passes nothing is byte-identical to today.
 */
export interface PresentErrorStrings {
  /** Dismiss button label (English default: "Dismiss"). */
  dismiss?: string;
  /** Retry affordance label for retriable errors (English default: "Try again"). */
  retry?: string;
  /** Per-code body override. A code present here replaces the English body. */
  messages?: Partial<Record<BeacioErrorCode, string>>;
}

/**
 * Options for {@link presentError}. Parity with BannerOptions where it overlaps
 * (operatorName, style), plus the retry affordance + the copy/locale seam.
 */
export interface PresentErrorOptions {
  /** Operator/app name shown in the card (e.g. "STORZ & BICKEL"). */
  operatorName?: string;
  /**
   * SB-SDK-07: BCP-47 UI language (e.g. 'de'). Selects the built-in pack for the
   * per-code title/body + dismiss/retry labels; omitted ⇒ derived from
   * navigator.language, else English. A per-call `strings` (and the explicit
   * dismissText/retryText) still override the selected pack. Always wins over
   * navigator.language.
   */
  lang?: string;
  /** Retry button label override (takes precedence over strings.retry). */
  retryText?: string;
  /** Dismiss button label override (takes precedence over strings.dismiss). */
  dismissText?: string;
  /**
   * Invoked when the user taps the retry affordance (retriable errors only), so a
   * caller can re-run its connect()/operation. The card is dismissed first.
   */
  onRetry?: () => void;
  /** Extra inline styles merged onto the card container. */
  style?: Record<string, string>;
  /** Copy/locale overrides for every user-visible string (SB-SDK-07 seam). */
  strings?: PresentErrorStrings;
}

const CARD_ID = 'beacio-error';
/** Coalesce window for identical errors (ms) — defends the alert-storm. */
const DEDUPE_WINDOW_MS = 1500;

/** Last rendered signature + timestamp, for identical-error debounce. */
let lastSignature: string | null = null;
let lastShownAt = 0;

/** HTML-escape (same idiom as banner.ts esc()). */
function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/** Does an unknown value look like a BeacioError (structural, no class import)? */
function isCodedError(error: unknown): error is { code: BeacioErrorCode; message?: string; suggestion?: string; isRetriable?: boolean } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    (error as { code: string }).code in COPY
  );
}

/** Map a raw DOMException name (no BeacioError) to a BeacioErrorCode. */
function codeFromDomName(name: string, message: string): BeacioErrorCode {
  const lower = message.toLowerCase();
  switch (name) {
    case 'NotFoundError':
      return 'DEVICE_NOT_FOUND';
    case 'NotAllowedError':
    case 'SecurityError':
      return 'PERMISSION_DENIED';
    case 'NetworkError':
      return 'DEVICE_DISCONNECTED';
    case 'TimeoutError':
      return 'TIMEOUT';
    case 'InvalidStateError':
      return lower.includes('disconnect') ? 'DEVICE_DISCONNECTED' : 'GATT_OPERATION_FAILED';
    default:
      break;
  }
  if (lower.includes('user cancelled') || lower.includes('user canceled')) return 'USER_CANCELLED';
  if (lower.includes('disconnect')) return 'DEVICE_DISCONNECTED';
  if (lower.includes('timeout')) return 'TIMEOUT';
  return 'GATT_OPERATION_FAILED';
}

interface Resolved {
  /** Stable code when known (drives retriable + dedupe signature), else null. */
  code: BeacioErrorCode | null;
  title: string;
  body: string;
  isRetriable: boolean;
  /** Dedupe signature: identical inputs coalesce to one card. */
  signature: string;
}

/**
 * Normalise any input — a BeacioError-shaped object, a raw DOMException/Error, or
 * a bare string — into branded, stack-free, competitor-free card content. The raw
 * error string is shown ONLY for a bare-string input (the S&B generateErrorMsg
 * path, where the caller passes its own already-friendly message); structured
 * errors always use the per-code copy table so no native jargon/stack leaks.
 */
function resolve(
  input: unknown,
  pack: LocaleStrings['error'],
  strings: PresentErrorStrings | undefined
): Resolved {
  // SB-SDK-07: per-code title/body come from the RESOLVED language pack; a
  // per-call `strings.messages[code]` override still wins (byte-identical
  // back-compat for callers that pass their own copy). The local COPY table
  // stays as the English source (it IS EN_STRINGS.error), pinned to core's code
  // set by error-presenter-core-parity.test.ts.
  const titleFor = (code: BeacioErrorCode): string => pack.titles[code];
  const bodyFor = (code: BeacioErrorCode): string => strings?.messages?.[code] ?? pack.messages[code];

  // Bare string: the caller's own message IS the body (generateErrorMsg path) —
  // but sanitise it first (AC1/AC6) so a string carrying a stack, a native URL, or
  // a competitor name never renders verbatim. When nothing meaningful survives,
  // fall back to the branded generic body so the card is never blank.
  if (typeof input === 'string') {
    const clean = sanitizeMessage(input);
    const body = clean || pack.generic.body;
    return { code: null, title: pack.generic.title, body, isRetriable: false, signature: `str:${body}` };
  }

  // BeacioError-shaped (structural): trust .code for copy + retriable.
  if (isCodedError(input)) {
    const code = input.code;
    return {
      code,
      title: titleFor(code),
      body: bodyFor(code),
      isRetriable: typeof input.isRetriable === 'boolean' ? input.isRetriable : RETRIABLE_CODES.has(code),
      signature: `code:${code}`,
    };
  }

  // Raw DOMException / Error: classify by name+message, then use branded copy —
  // NEVER the raw .message (it may carry a stack or a competitor name).
  if (typeof input === 'object' && input !== null) {
    const name =
      'name' in input && typeof (input as { name: unknown }).name === 'string' ? (input as { name: string }).name : '';
    const message = input instanceof Error ? input.message : String((input as { message?: unknown }).message ?? '');
    const code = codeFromDomName(name, message);
    return { code, title: titleFor(code), body: bodyFor(code), isRetriable: RETRIABLE_CODES.has(code), signature: `dom:${code}` };
  }

  return { code: null, title: pack.generic.title, body: pack.generic.body, isRetriable: false, signature: 'generic' };
}

/**
 * Present a branded, non-blocking, dismissible error card. Replaces a blocking
 * `window.alert(error.toString() + error.stack)` with a recovery-oriented surface.
 *
 * @param errorOrMessage A BeacioError, a raw DOMException/Error, or a string.
 * @param options Operator name, copy/locale overrides, and an onRetry handler.
 * @returns The card element, or null when the error is coalesced (a card for an
 *          identical error is already on screen) so callers can no-op safely.
 */
export function presentError(errorOrMessage: unknown, options: PresentErrorOptions = {}): HTMLElement | null {
  // SSR / non-DOM guard (mirrors banner.ts dispatch guards).
  if (typeof document === 'undefined') return null;

  const { strings } = options;
  // SB-SDK-07: resolve the localized pack ONCE (explicit lang > navigator.language
  // > English); per-code copy + dismiss/retry derive from it, with `strings` and
  // the explicit dismissText/retryText overriding on top.
  const pack = resolveStrings({ lang: options.lang }).error;
  const resolved = resolve(errorOrMessage, pack, strings);

  // AC2: coalesce identical errors fired within a short window into ONE card —
  // suppress the duplicate (and never fall back to alert). An identical card still
  // on screen also suppresses, so a burst never stacks.
  const now = Date.now();
  const existing = document.getElementById(CARD_ID);
  if (existing && lastSignature === resolved.signature && now - lastShownAt < DEDUPE_WINDOW_MS) {
    return null;
  }
  // A new error replaces any prior card (single card surface at a time).
  if (existing) existing.remove();
  lastSignature = resolved.signature;
  lastShownAt = now;

  const operatorName = options.operatorName;
  // Precedence: explicit dismissText/retryText > per-call `strings` > the
  // resolved language pack (English when no lang/navigator.language match).
  const dismissLabel = options.dismissText ?? strings?.dismiss ?? pack.dismiss;
  const retryLabel = options.retryText ?? strings?.retry ?? pack.retry;
  const showRetry = resolved.isRetriable;

  const customStyle = Object.entries(options.style ?? {})
    .map(([k, v]) => `${k}:${v}`)
    .join(';');

  const card = document.createElement('div');
  card.id = CARD_ID;
  card.dataset.beacioErrorCode = resolved.code ?? 'unknown';
  // AC1: merge caller-supplied style overrides onto the card container (parity with
  // BannerOptions, whose bar banner applies options.style). Inline style wins over
  // the stylesheet default so an operator can theme the card without forking.
  if (customStyle) card.style.cssText = customStyle;

  // Title carries the operator name when supplied (parity with the banner), so the
  // card is branded to the host app rather than anonymous.
  const heading = operatorName ? `${operatorName} — ${resolved.title}` : resolved.title;

  card.innerHTML = `
<style>
#${CARD_ID}{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483646;
  max-width:420px;width:calc(100% - 32px);background:#fff;color:#1c1c1e;border-radius:14px;
  padding:16px 18px;display:flex;flex-direction:column;gap:10px;
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;
  box-shadow:0 6px 20px rgba(0,0,0,.2);animation:bce-u .3s ease-out}
@keyframes bce-u{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
#${CARD_ID} *{box-sizing:border-box;margin:0;padding:0}
.bce-row{display:flex;align-items:flex-start;gap:12px}
.bce-ic{width:28px;height:28px;border-radius:8px;background:#ff3b30;flex-shrink:0;display:flex;
  align-items:center;justify-content:center}
.bce-ic svg{width:18px;height:18px;fill:#fff}
.bce-tx{flex:1;min-width:0}
.bce-tt{font-size:15px;font-weight:600;line-height:1.3}
.bce-bd{font-size:14px;line-height:1.4;color:#3a3a3c;margin-top:3px}
.bce-x{background:none;border:none;color:#8e8e93;font-size:20px;cursor:pointer;line-height:1;
  padding:0 2px;align-self:flex-start}
/* SB-SDK-07: visually-hidden text label on the icon-only dismiss control. The
   glyph stays the only visible mark; the label surfaces in the accessibility
   tree + DOM text so the LOCALIZED dismiss copy is present (German when lang
   selects it), not just an aria-label attribute. */
.bce-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0,0,0,0);white-space:nowrap;border:0}
.bce-act{display:flex;gap:8px;justify-content:flex-end}
.bce-retry{padding:9px 16px;background:#007aff;color:#fff;border:none;border-radius:10px;
  font-size:15px;font-weight:600;cursor:pointer}
.bce-retry:active{opacity:.85}
@media(prefers-color-scheme:dark){
  #${CARD_ID}{background:#1c1c1e;color:#fff}
  .bce-bd{color:#aeaeb2}
}
</style>
<div class="bce-row">
  <div class="bce-ic"><svg viewBox="0 0 24 24"><path d="M12 2 1 21h22L12 2zm0 5 7.5 13h-15L12 7zm-1 4v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg></div>
  <div class="bce-tx">
    <p class="bce-tt">${esc(heading)}</p>
    <p class="bce-bd">${esc(resolved.body)}</p>
  </div>
  <button class="bce-x" aria-label="${esc(dismissLabel)}">&times;<span class="bce-sr">${esc(dismissLabel)}</span></button>
</div>
${showRetry ? `<div class="bce-act"><button class="bce-retry" type="button">${esc(retryLabel)}</button></div>` : ''}`;

  function dismiss(): void {
    card.remove();
    // Allow an immediate, DIFFERENT error to show; only identical ones within the
    // window are coalesced, and dismissing clears the on-screen-card suppression.
    lastShownAt = 0;
  }

  // Wire listeners synchronously (jsdom click in the test fires in the same tick).
  card.querySelector<HTMLElement>('.bce-x')?.addEventListener('click', dismiss);
  // The dismiss aria-label control doubles as the required dismissible button.
  if (showRetry) {
    card.querySelector<HTMLElement>('.bce-retry')?.addEventListener('click', () => {
      dismiss();
      options.onRetry?.();
    });
  }

  document.body.appendChild(card);
  return card;
}

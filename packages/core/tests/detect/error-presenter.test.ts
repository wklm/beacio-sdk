/**
 * SB-SDK-05: @beacio/detect#presentError — the drop-in, framework-free branded
 * error card S&B routes its generateErrorMsg() + connect-catch alerts through.
 *
 * The polished branded surface already exists (banner.ts) but is stranded behind
 * the @beacio/core API; S&B uses raw navigator.bluetooth across 202 call sites and
 * will not rewrite them. presentError converts the worst surface — a blocking,
 * stack-leaking window.alert() — into a non-blocking, dismissible, branded,
 * recovery-oriented card with ~1-line edits.
 *
 * This test pins the SB-SDK-05 acceptance criteria so the presenter cannot
 * silently regress: a card (NOT alert), per-code human copy, no stack/no
 * competitor names, retry affordance for retriable codes, raw DOMException/string
 * normalisation, identical-error debounce, and the i18n copy-override seam.
 *
 * jsdom; mirrors banner.test.ts / events.test.ts import style (`@jest/globals`).
 * Run via
 *   npx jest --config packages/detect/jest.config.js --rootDir packages/detect
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { presentError, type PresentErrorOptions } from '../../src/detect/error-presenter';

// SB-SDK-02 (Part B) optional-peer rule: @beacio/core must NOT be a hard
// dependency of @beacio/detect (a standalone `npm i @beacio/detect` has no core),
// so the presenter consumes errors STRUCTURALLY (anything with a `.code` /
// `.message` / `.suggestion` / `.isRetriable`), not via the BeacioError class.
// This test therefore builds BeacioError-SHAPED objects locally — matching core's
// errors.ts public surface — instead of importing the class, mirroring how
// banner.ts/index.ts avoid a runtime core import. The code list is the stable
// BeacioErrorCode contract (core/src/errors.ts:20-56).
type BeacioErrorCode =
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

const RETRIABLE_CODES = new Set<BeacioErrorCode>([
  'DEVICE_DISCONNECTED',
  'CONNECTION_TIMEOUT',
  'GATT_OPERATION_FAILED',
  'TIMEOUT',
  'SCAN_ALREADY_IN_PROGRESS',
  'WRITE_INCOMPLETE',
]);

/** A BeacioError-shaped object (errors.ts public surface) without importing core. */
class BeacioError extends Error {
  readonly code: BeacioErrorCode;
  readonly suggestion: string;
  readonly isRetriable: boolean;
  constructor(code: BeacioErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'BeacioError';
    this.code = code;
    this.suggestion = message ?? `suggestion:${code}`;
    this.isRetriable = RETRIABLE_CODES.has(code);
  }
}

const CARD_ID = 'beacio-error';

/** Every code presentError must map to non-empty, stack-free human copy. */
const ALL_CODES: BeacioErrorCode[] = [
  'INVALID_PARAMETER',
  'BLUETOOTH_UNAVAILABLE',
  'EXTENSION_NOT_INSTALLED',
  'PERMISSION_DENIED',
  'DEVICE_NOT_FOUND',
  'DEVICE_DISCONNECTED',
  'CONNECTION_TIMEOUT',
  'SERVICE_NOT_FOUND',
  'CHARACTERISTIC_NOT_FOUND',
  'CHARACTERISTIC_NOT_READABLE',
  'CHARACTERISTIC_NOT_WRITABLE',
  'CHARACTERISTIC_NOT_NOTIFIABLE',
  'GATT_OPERATION_FAILED',
  'SCAN_ALREADY_IN_PROGRESS',
  'CONNECTION_LIMIT_REACHED',
  'USER_CANCELLED',
  'TIMEOUT',
  'WRITE_INCOMPLETE',
];

const RETRIABLE: BeacioErrorCode[] = [
  'DEVICE_DISCONNECTED',
  'CONNECTION_TIMEOUT',
  'GATT_OPERATION_FAILED',
  'TIMEOUT',
  'SCAN_ALREADY_IN_PROGRESS',
  'WRITE_INCOMPLETE',
];

const NON_RETRIABLE: BeacioErrorCode[] = ALL_CODES.filter((c) => !RETRIABLE.includes(c));

/** Tokens that betray a leaked stack trace in the rendered card. */
const STACK_TOKENS = [
  '\n    at ',
  '.ts:',
  '.js:',
  'webkit',
  'WebKit',
  'http://',
  'https://localhost',
  'eval (',
];

function cardEl(): HTMLElement | null {
  return document.getElementById(CARD_ID);
}

function cardText(): string {
  const el = cardEl();
  return (el?.textContent || '').replace(/\s+/g, ' ');
}

function removeCard(): void {
  cardEl()?.remove();
}

describe('SB-SDK-05 presentError renders a branded, non-blocking error card', () => {
  let alertSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    // The whole point of the issue: NEVER window.alert. Spy so every test can
    // assert the blocking dialog is not used.
    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    removeCard();
    document.body.innerHTML = '';
    alertSpy.mockRestore();
    jest.useRealTimers();
  });

  // AC1: a non-blocking, dismissible, branded card — not window.alert — with an
  // id distinct from the install banner (#beacio-banner) so the two surfaces
  // never collide.
  it('AC1: renders a dismissible card into the DOM (not window.alert), id distinct from #beacio-banner', () => {
    const el = presentError(new BeacioError('DEVICE_DISCONNECTED'));

    expect(alertSpy).not.toHaveBeenCalled();
    expect(el).toBeTruthy();
    expect(cardEl()).not.toBeNull();
    expect(cardEl()!.id).toBe(CARD_ID);
    expect(cardEl()!.id).not.toBe('beacio-banner');

    // Dismissible: a control whose click removes the card.
    const dismiss = cardEl()!.querySelector<HTMLElement>(
      'button, [aria-label="Dismiss"], [aria-label="Close"]'
    );
    expect(dismiss).not.toBeNull();
    dismiss!.click();
    expect(cardEl()).toBeNull();
  });

  // AC6: each beacio error code maps to non-empty human copy, with NO stack text,
  // no literal 'undefined', and never the competitor name 'Bluefy'.
  it('AC6: every BeacioErrorCode maps to non-empty human copy with no stack/undefined/Bluefy', () => {
    for (const code of ALL_CODES) {
      removeCard();
      presentError(new BeacioError(code));
      const text = cardText();

      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain('undefined');
      expect(text).not.toMatch(/Bluefy/i);
      for (const tok of STACK_TOKENS) {
        expect(text).not.toContain(tok);
      }
    }
  });

  // AC6 (explicit headline codes): the four call-site codes named in the AC must
  // render a real card with no stack and no competitor name.
  it('AC6: EXTENSION_NOT_INSTALLED / PERMISSION_DENIED / DEVICE_DISCONNECTED / GATT_OPERATION_FAILED cards have no stack and no Bluefy', () => {
    for (const code of [
      'EXTENSION_NOT_INSTALLED',
      'PERMISSION_DENIED',
      'DEVICE_DISCONNECTED',
      'GATT_OPERATION_FAILED',
    ] as BeacioErrorCode[]) {
      removeCard();
      const err = new BeacioError(code);
      presentError(err);
      const text = cardText();
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/Bluefy/i);
      // The human body is the suggestion, not the raw .stack.
      expect(text).not.toContain('at Object.');
      expect(err.toString()).not.toMatch(/Bluefy/i);
    }
  });

  // AC1: retriable codes render a retry affordance; non-retriable codes do not.
  it('AC1: retriable codes render a retry affordance; non-retriable codes do not', () => {
    for (const code of RETRIABLE) {
      removeCard();
      presentError(new BeacioError(code));
      const el = cardEl()!;
      const controls = Array.from(el.querySelectorAll<HTMLElement>('button, a'));
      const retry = controls.find((c) => /retry|try again|reconnect/i.test(c.textContent || ''));
      expect(retry).toBeDefined();
    }
    for (const code of NON_RETRIABLE) {
      removeCard();
      presentError(new BeacioError(code));
      const el = cardEl()!;
      const controls = Array.from(el.querySelectorAll<HTMLElement>('button, a'));
      const retry = controls.find((c) => /retry|try again|reconnect/i.test(c.textContent || ''));
      expect(retry).toBeUndefined();
    }
  });

  // AC1: the retry affordance invokes a caller-supplied onRetry handler (so S&B
  // can re-run connect()), and dismisses the card.
  it('AC1: tapping retry invokes onRetry and dismisses the card', () => {
    const onRetry = jest.fn();
    presentError(new BeacioError('DEVICE_DISCONNECTED'), { onRetry });
    const el = cardEl()!;
    const retry = Array.from(el.querySelectorAll<HTMLElement>('button, a')).find((c) =>
      /retry|try again|reconnect/i.test(c.textContent || '')
    )!;
    expect(retry).toBeDefined();
    retry.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(cardEl()).toBeNull();
  });

  // AC1: a raw DOMException renders branded copy — NOT the raw .toString()
  // ("SecurityError: ...") and never a competitor name.
  it('AC1: a raw DOMException renders branded copy, not the raw .toString()', () => {
    const dom = new DOMException(
      'The Bluetooth operation could not be performed because Bluefy was required',
      'NetworkError'
    );
    presentError(dom);
    const text = cardText();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(text.length).toBeGreaterThan(0);
    // Branded body, not the verbatim DOMException string.
    expect(text).not.toMatch(/Bluefy/i);
    expect(text).not.toContain('NetworkError:');
  });

  // AC1: a bare string renders branded copy in a card (this is the S&B
  // generateErrorMsg(errMsg) path), not a window.alert of the raw string.
  it('AC1: a bare string message renders as a branded card, not window.alert', () => {
    presentError('Connection failed. Please move closer to the device.');
    expect(alertSpy).not.toHaveBeenCalled();
    const text = cardText();
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('Connection failed');
  });

  // AC1/AC6: the bare-string path is the S&B generateErrorMsg(errMsg) ->
  // presentError(errMsg) chokepoint. S&B's real strings are built from the native
  // error (main.js historically appends `error.stack` and references the
  // competitor name), so a string handed to presentError can ITSELF carry a stack
  // frame, a native webkit:// URL, or "Bluefy". AC1 requires presentError to
  // "strip/omit any stack trace ... and never emit competitor names" for ANY input
  // — and the file's own contract promises the card NEVER leaks those. The branded
  // copy table protects the structured/DOMException paths, but a bare string was
  // rendered verbatim; these pin the bare-string sanitisation so the leak cannot
  // return on the very path S&B integrates through.
  it('AC1/AC6: a bare string carrying a stack/native-URL is sanitised in the card (leading sentence kept)', () => {
    presentError(
      'GATT operation failed: the device disconnected.\n' +
        '    at BeacioDevice.read (webkit://internal/device.js:1018:23)\n' +
        '    at async onButtonClick (https://app.storz-bickel.com/js/main.js:736:9)'
    );
    expect(alertSpy).not.toHaveBeenCalled();
    const text = cardText();
    // The human-meaningful first sentence survives (trailing punctuation is
    // trimmed, mirroring core's sanitizeNativeMessage)…
    expect(text).toContain('GATT operation failed: the device disconnected');
    // …but every stack/native-URL token is gone.
    for (const tok of STACK_TOKENS) {
      expect(text).not.toContain(tok);
    }
    expect(text).not.toContain('at BeacioDevice.read');
    expect(text).not.toContain('at async onButtonClick');
  });

  it('AC1/AC6: a bare string mentioning the competitor name never emits it in the card', () => {
    presentError('Bluetooth unavailable. Please use Bluefy or the Web BLE browser instead.');
    expect(alertSpy).not.toHaveBeenCalled();
    const text = cardText();
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/Bluefy/i);
    expect(text).not.toMatch(/web ble browser/i);
    // The non-competitor remainder of the caller's message is still shown.
    expect(text).toMatch(/Bluetooth unavailable/i);
  });

  it('AC1/AC6: a bare string that is ONLY a stack/competitor falls back to branded copy (never blank, never the leak)', () => {
    presentError('Bluefy\n    at eval (webkit://x:1:1)');
    const text = cardText();
    // Nothing meaningful survived sanitisation → branded generic copy, not a blank
    // card and not the leaked tokens.
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/Bluefy/i);
    for (const tok of STACK_TOKENS) {
      expect(text).not.toContain(tok);
    }
  });

  // AC2: repeated identical errors within a short window are debounced/coalesced —
  // defends against the qvap 500ms backgrounding alert-storm.
  it('AC2: two identical errors fired within the debounce window produce a single card', () => {
    presentError(new BeacioError('DEVICE_DISCONNECTED'));
    presentError(new BeacioError('DEVICE_DISCONNECTED'));
    expect(document.querySelectorAll(`#${CARD_ID}`).length).toBe(1);
  });

  it('AC2: a burst of identical errors never stacks multiple cards (alert-storm suppression)', () => {
    for (let i = 0; i < 8; i += 1) {
      presentError(new BeacioError('GATT_OPERATION_FAILED'));
    }
    expect(document.querySelectorAll(`#${CARD_ID}`).length).toBeLessThanOrEqual(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  // AC1: caller-supplied operatorName + CTA/copy overrides (parity with
  // BannerOptions) appear in the card.
  it('AC1: honors operatorName and a CTA/copy override', () => {
    presentError(new BeacioError('DEVICE_DISCONNECTED'), {
      operatorName: 'STORZ & BICKEL',
      retryText: 'Reconnect now',
    });
    const text = cardText();
    expect(text).toContain('STORZ & BICKEL');
    expect(text).toContain('Reconnect now');
  });

  // AC1: caller-supplied `style` overrides (parity with BannerOptions, whose bar
  // banner applies options.style) must be merged onto the card container — not
  // accepted and silently dropped. Pins the style seam so an operator can theme
  // the card (e.g. brand background) without forking the package.
  it('AC1: a caller-supplied style override is applied to the card container', () => {
    presentError(new BeacioError('DEVICE_DISCONNECTED'), {
      style: { background: 'rgb(1, 2, 3)', 'border-radius': '4px' },
    });
    const el = cardEl()!;
    // The override lands on the card element's inline style (the visible surface),
    // taking precedence over the stylesheet default background.
    expect(el.style.background).toContain('rgb(1, 2, 3)');
    expect(el.style.borderRadius).toBe('4px');
  });

  // AC7/SB-SDK-07: the dismiss control label is a user-visible string the override
  // object explicitly enumerates ("dismiss label"). It must be localizable via both
  // the dedicated dismissText option and strings.dismiss — and surface on the
  // rendered control (accessible name), not just be computed and discarded.
  it('AC7: the dismiss control label honors dismissText / strings.dismiss (localizable accessible name)', () => {
    // dismissText takes precedence.
    presentError(new BeacioError('USER_CANCELLED'), { dismissText: 'Verwerfen' });
    const dismiss = cardEl()!.querySelector<HTMLElement>('.bce-x, [aria-label]');
    expect(dismiss).not.toBeNull();
    expect(dismiss!.getAttribute('aria-label')).toBe('Verwerfen');
    removeCard();

    // strings.dismiss is honored when no dismissText is supplied.
    presentError(new BeacioError('USER_CANCELLED'), { strings: { dismiss: 'Schließen' } });
    const dismiss2 = cardEl()!.querySelector<HTMLElement>('.bce-x, [aria-label]');
    expect(dismiss2!.getAttribute('aria-label')).toBe('Schließen');
    removeCard();

    // No override → English default accessible name (no regression).
    presentError(new BeacioError('USER_CANCELLED'));
    const dismiss3 = cardEl()!.querySelector<HTMLElement>('.bce-x, [aria-label]');
    expect(dismiss3!.getAttribute('aria-label')).toBe('Dismiss');
  });

  // AC7: presentError accepts a copy/locale override object covering all
  // user-visible strings; supplying it replaces the visible copy, and omitting it
  // yields the English defaults (no regression).
  it('AC7: a copy/locale override replaces user-visible strings; omitting it yields English defaults', () => {
    // English default (no override): the disconnect card reads in English.
    presentError(new BeacioError('DEVICE_DISCONNECTED'));
    const def = cardText();
    expect(def).toMatch(/connect|disconnect|reconnect/i);
    removeCard();

    const strings: PresentErrorOptions['strings'] = {
      dismiss: 'Schließen',
      retry: 'Erneut verbinden',
      messages: { DEVICE_DISCONNECTED: 'Das Gerät wurde getrennt. Bitte erneut verbinden.' },
    };
    presentError(new BeacioError('DEVICE_DISCONNECTED'), { strings });
    const text = cardText();
    expect(text).toContain('Das Gerät wurde getrennt');
    expect(text).toContain('Erneut verbinden');
    // The overridden card no longer shows the English default body.
    expect(text).not.toBe(def);
  });
});

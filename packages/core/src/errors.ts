import {
  type BeacioErrorCode,
  classifyThrown,
  IOS_GRANT_WORDING_CANONICAL,
  type NativeMessageValue,
  RETRIABLE_CODES,
  RETRY_AFTER_MS,
  sanitizeNativeMessage,
} from './error-taxonomy';

// The code union, the retriable set, the NotFoundError fragment table and the
// classifier all live in ./error-taxonomy — the leaf module the branded card
// (`./detect/error-presenter.ts`) classifies through too, so the SDK and the UI
// cannot disagree about the same DOMException. Re-exported here because
// `BeacioErrorCode` is part of this module's published surface (src/index.ts).
export type { BeacioErrorCode };

/**
 * Whether a classification's native sentence survives onto `BeacioError.message`.
 * A Record over the union rather than a ternary ON PURPOSE: a third
 * {@link NativeMessageValue} member fails to compile HERE instead of being
 * silently treated as "drop the native text", which would make a device's own
 * message vanish from `.message` with no test to catch it.
 */
const CARRY_NATIVE: Record<NativeMessageValue, boolean> = {
  'adds-detail': true,
  // A dismissed chooser and a bare "no devices found" say nothing the per-code
  // SUGGESTION does not already say — and echoing Chromium's cancellation
  // wording reads as a failure when none occurred.
  'restates-the-code': false,
};

/**
 * Configuration for {@link withRetry}.
 *
 * **Backoff formula:** `delay = delayMs * backoffMultiplier^(attempt - 1)`
 *
 * All fields are required with documented sentinel defaults (no optional arguments).
 * Pass {@link DEFAULT_RETRY_OPTIONS} (optionally spread with overrides) rather than a
 * partial object. A sentinel in any field resolves to that field's documented default.
 *
 * @see {@link withRetry}
 * @see {@link DEFAULT_RETRY_OPTIONS}
 */
export interface RetryOptions {
  /** Total attempts including the first call. Sentinel: `0` (use default 3). Otherwise must be a positive integer. */
  maxAttempts: number;
  /** Base delay between retries in milliseconds. Sentinel: any negative value (use default 250). Otherwise must be non-negative. */
  delayMs: number;
  /** Multiplier applied after each failed attempt. Sentinel: any value `< 1` (use default 1.5). Otherwise must be >= 1. */
  backoffMultiplier: number;
}

/**
 * Canonical sentinel {@link RetryOptions} bag. Pass this (optionally spread with
 * overrides) to {@link withRetry} / `device.connectWithRetry` instead of building a
 * partial object: `withRetry(fn, { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 5 })`. Each
 * field carries its documented default (3 attempts, 250 ms base delay, 1.5x backoff).
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 0,
  delayMs: -1,
  backoffMultiplier: 0,
};

const SUGGESTIONS: Record<BeacioErrorCode, string> = {
  INVALID_PARAMETER: 'One or more input parameters were invalid. Check UUIDs, payload sizes, and option values.',
  BLUETOOTH_UNAVAILABLE: 'Check that the browser supports Web Bluetooth and the device has Bluetooth enabled.',
  EXTENSION_NOT_INSTALLED: 'Install the Beacio iOS app and enable the Safari extension. Use @beacio/core/detect to show an install banner.',
  EXTENSION_NOT_ENABLED: `Beacio is installed but not enabled on this site. In Safari tap aA in the address bar, then Manage Extensions, then beacio, then ${IOS_GRANT_WORDING_CANONICAL}, and reload this page.`,
  PERMISSION_DENIED: 'The user denied Bluetooth permission or the request was not triggered by a user gesture. Call requestDevice() from a click/tap handler and try again.',
  DEVICE_NOT_FOUND: 'No matching device found. Check your scan filters or ensure the device is advertising.',
  DEVICE_DISCONNECTED: 'Call device.connect() before performing GATT operations.',
  CONNECTION_TIMEOUT: 'The device did not respond in time. Ensure it is in range and advertising.',
  SERVICE_NOT_FOUND: 'The requested service was not found on this device. Check the service UUID and ensure it is included in requestDevice filters.',
  CHARACTERISTIC_NOT_FOUND: 'The requested characteristic was not found in this service. Check the characteristic UUID.',
  CHARACTERISTIC_NOT_READABLE: 'This characteristic does not support read. Use device.subscribe() instead if it supports notify.',
  CHARACTERISTIC_NOT_WRITABLE: 'This characteristic does not support write. Check the characteristic properties.',
  CHARACTERISTIC_NOT_NOTIFIABLE: 'This characteristic does not support notifications. Use device.read() for polling instead.',
  GATT_OPERATION_FAILED: 'The GATT operation failed. The device may have disconnected or the characteristic may be busy.',
  SCAN_ALREADY_IN_PROGRESS: 'Stop the current scan before starting a new one.',
  CONNECTION_LIMIT_REACHED: 'Disconnect another device or raise maxConnections for this Beacio instance before connecting more devices.',
  USER_CANCELLED: 'The user cancelled the device picker. No action needed.',
  TIMEOUT: 'The operation timed out. Retry or check device connectivity.',
  WRITE_INCOMPLETE: 'Only part of the payload was written. Retry with smaller chunks or reconnect the device.',
};

/**
 * Error class for all Beacio operations. Contains a machine-readable `code`
 * and a human/agent-readable `suggestion` for how to fix the issue.
 */
export class BeacioError extends Error {
  /** Machine-readable error code for programmatic handling. */
  readonly code: BeacioErrorCode;
  /** Actionable fix instruction — useful for agents and error UIs. */
  readonly suggestion: string;
  /** Whether the operation is safe to retry automatically. */
  readonly isRetriable: boolean;
  /** Suggested backoff before retrying, when known. */
  readonly retryAfterMs?: number;

  constructor(code: BeacioErrorCode, message?: string, options?: { retryAfterMs?: number }) {
    const defaultMessage = SUGGESTIONS[code];
    super(message ?? defaultMessage);
    this.name = 'BeacioError';
    this.code = code;
    this.suggestion = SUGGESTIONS[code];
    this.isRetriable = RETRIABLE_CODES.has(code);
    this.retryAfterMs = options?.retryAfterMs;
  }

  /**
   * Convert a native error (DOMException, Error, string) to a BeacioError with
   * automatic code detection. The DECISION is delegated to the shared
   * ./error-taxonomy seam (`classifyThrown` takes the thrown value directly —
   * the same one the branded card classifies through) so this method holds only
   * what is genuinely SDK-side: which message survives onto `.message`, and the
   * per-code backoff hint.
   */
  static from<T>(error: T, code: BeacioErrorCode = 'GATT_OPERATION_FAILED'): BeacioError {
    if (error instanceof BeacioError) return error;
    // A native DOMException/Error message can carry a multi-line
    // stack, a native URL, and engine/competitor jargon. The CLASSIFIER still
    // inspects the full RAW text (so e.g. "GATT Server is disconnected" is detected
    // even when followed by a stack), but the message that survives onto the
    // BeacioError — and thus into error.toString() / a raw alert() — is the
    // sanitised, single-line form so no stack frame or competitor name ever leaks.
    const rawMsg = error instanceof Error ? error.message : String(error);
    // Empty sanitised result → undefined, so the BeacioError constructor falls back
    // to the per-code SUGGESTION default instead of carrying a blank message.
    const sanitised = sanitizeNativeMessage(rawMsg) || undefined;

    const classification = classifyThrown(error, code);
    const carried = CARRY_NATIVE[classification.nativeMessage] ? sanitised : undefined;
    return new BeacioError(classification.code, carried, { retryAfterMs: RETRY_AFTER_MS[classification.code] });
  }
}

/**
 * Retry an async operation with exponential backoff. Only retries errors
 * whose `isRetriable` flag is `true` (see {@link BeacioError}).
 *
 * **Retriable error codes:** `DEVICE_DISCONNECTED`, `CONNECTION_TIMEOUT`,
 * `GATT_OPERATION_FAILED`, `TIMEOUT`, `SCAN_ALREADY_IN_PROGRESS`, `WRITE_INCOMPLETE`.
 *
 * **Backoff formula:** `delay = delayMs * backoffMultiplier^(attempt - 1)`.
 * If the error includes `retryAfterMs`, that value overrides the calculated delay.
 *
 * @param fn - Async function to retry. Receives the current attempt number (1-based).
 * @param options - Retry configuration (defaults: 3 attempts, 250ms delay, 1.5x backoff).
 * @returns The result of the first successful call.
 *
 * @throws {BeacioError} The last error if all attempts fail or the error is not retriable.
 * @throws {BeacioError} `INVALID_PARAMETER` if options contain invalid values.
 *
 * @example
 * ```typescript
 * import { withRetry } from '@beacio/core'
 *
 * const value = await withRetry(async (attempt) => {
 *   console.log(`Attempt ${attempt}`)
 *   return await device.read('battery_service', 'battery_level')
 * }, { maxAttempts: 5, delayMs: 500, backoffMultiplier: 2 })
 * ```
 *
 * @see {@link RetryOptions}
 * @see {@link BeacioError.isRetriable}
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = DEFAULT_RETRY_OPTIONS): Promise<T> {
  // Sentinel resolution (see RetryOptions): a sentinel in any field falls back to
  // that field's documented default, preserving the historical `?? default` behavior
  // for callers who now pass DEFAULT_RETRY_OPTIONS instead of {}/undefined.
  const maxAttempts = options.maxAttempts > 0 ? options.maxAttempts : 3;
  const delayMs = options.delayMs >= 0 ? options.delayMs : 250;
  const backoffMultiplier = options.backoffMultiplier >= 1 ? options.backoffMultiplier : 1.5;

  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new BeacioError('INVALID_PARAMETER', `Invalid maxAttempts: ${maxAttempts}. Must be a positive integer.`);
  }
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new BeacioError('INVALID_PARAMETER', `Invalid delayMs: ${delayMs}. Must be a non-negative number.`);
  }
  if (!Number.isFinite(backoffMultiplier) || backoffMultiplier < 1) {
    throw new BeacioError('INVALID_PARAMETER', `Invalid backoffMultiplier: ${backoffMultiplier}. Must be a number >= 1.`);
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      const normalizedError = BeacioError.from(error);
      if (attempt >= maxAttempts || !normalizedError.isRetriable) {
        throw normalizedError;
      }

      const nextDelay = normalizedError.retryAfterMs
        ?? delayMs * Math.pow(backoffMultiplier, attempt - 1);
      if (nextDelay > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, nextDelay);
        });
      }
    }
  }

  throw new BeacioError('GATT_OPERATION_FAILED', 'Retry loop exited unexpectedly.');
}

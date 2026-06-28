import { describe, expect, it } from '@jest/globals';
import { BeacioError } from '../src/errors';

describe('BeacioError', () => {
  it('sets code, suggestion, and name', () => {
    const err = new BeacioError('BLUETOOTH_UNAVAILABLE');
    expect(err.code).toBe('BLUETOOTH_UNAVAILABLE');
    expect(err.suggestion).toBe('Check that the browser supports Web Bluetooth and the device has Bluetooth enabled.');
    expect(err.name).toBe('BeacioError');
    expect(err.message).toBe(err.suggestion);
    expect(err.isRetriable).toBe(false);
  });

  it('sets retriable metadata for transient codes', () => {
    expect(new BeacioError('TIMEOUT').isRetriable).toBe(true);
    expect(new BeacioError('WRITE_INCOMPLETE').isRetriable).toBe(true);
    expect(new BeacioError('PERMISSION_DENIED').isRetriable).toBe(false);
  });

  it('uses custom message instead of default suggestion for message', () => {
    const err = new BeacioError('GATT_OPERATION_FAILED', 'read failed');
    expect(err.message).toBe('read failed');
    expect(err.suggestion).toBe('The GATT operation failed. The device may have disconnected or the characteristic may be busy.');
  });

  it('is instanceof Error', () => {
    expect(new BeacioError('TIMEOUT')).toBeInstanceOf(Error);
  });
});

describe('BeacioError.from', () => {
  it('returns same instance for BeacioError input', () => {
    const original = new BeacioError('TIMEOUT');
    expect(BeacioError.from(original)).toBe(original);
  });

  it('maps "User cancelled" to USER_CANCELLED', () => {
    const err = BeacioError.from(new Error('User cancelled the request'));
    expect(err.code).toBe('USER_CANCELLED');
  });

  it('classifies real TypeErrors from the polyfill as INVALID_PARAMETER (convention 5)', () => {
    const err = BeacioError.from(new TypeError("Invalid UUID: 'bogus'"));
    expect(err.code).toBe('INVALID_PARAMETER');
    expect(err.message).toBe("Invalid UUID: 'bogus'");
  });

  it('maps "User canceled" (US spelling) to USER_CANCELLED', () => {
    const err = BeacioError.from(new Error('User canceled'));
    expect(err.code).toBe('USER_CANCELLED');
  });

  it('maps "no devices found" to DEVICE_NOT_FOUND', () => {
    const err = BeacioError.from(new Error('no devices found'));
    expect(err.code).toBe('DEVICE_NOT_FOUND');
  });

  it('maps "No Devices" to DEVICE_NOT_FOUND', () => {
    const err = BeacioError.from(new Error('No Devices'));
    expect(err.code).toBe('DEVICE_NOT_FOUND');
  });

  it('defaults to GATT_OPERATION_FAILED for unknown errors', () => {
    const err = BeacioError.from(new Error('something else'));
    expect(err.code).toBe('GATT_OPERATION_FAILED');
    expect(err.message).toContain('something else');
  });

  it('handles string input', () => {
    const err = BeacioError.from('raw string error');
    expect(err.code).toBe('GATT_OPERATION_FAILED');
    expect(err.message).toContain('raw string error');
  });

  it('uses provided fallback code', () => {
    const err = BeacioError.from(new Error('oops'), 'TIMEOUT');
    expect(err.code).toBe('TIMEOUT');
  });

  it('prefers DOMException name over message heuristics', () => {
    const domError = new DOMException('No Devices were found', 'SecurityError');
    const err = BeacioError.from(domError);

    expect(err.code).toBe('PERMISSION_DENIED');
  });

  it('preserves retryAfterMs metadata for disconnect-like errors', () => {
    const err = BeacioError.from(new DOMException('GATT Server is disconnected', 'NetworkError'));

    expect(err.code).toBe('DEVICE_DISCONNECTED');
    expect(err.retryAfterMs).toBe(1000);
  });
});

// SB-SDK-05 AC6: "even a raw alert(error.toString()) reads as guidance". A native
// DOMException/Error can carry a multi-line stack and engine/competitor jargon in
// its .message; today BeacioError.from passes that raw text straight through for
// pass-through codes (TIMEOUT, DEVICE_DISCONNECTED, GATT_OPERATION_FAILED, …), so a
// site doing alert(error.toString()) leaks a stack frame and/or a competitor name.
// This pins the hygiene: for each simulated failure, error.toString() must contain
// no 'Bluefy', no literal 'undefined', and no raw stack-frame token — while the
// meaningful FIRST line of a clean native message is still preserved (no regression
// to the message-passthrough tests above).
describe('SB-SDK-05 AC6: BeacioError.from sanitises .message so error.toString() leaks no stack/competitor', () => {
  // A realistic dirty native message: a human first line, then engine jargon, a
  // competitor name, a native URL, and stack frames — exactly what WebKit/a polyfill
  // bridge can surface on the navigator.bluetooth path.
  const DIRTY =
    "The connection was lost. via Bluefy https://webkit.example/bridge\n" +
    '    at Object.foo (webkit://internal/ble-bridge.js:42:7)\n' +
    '    at async crafty.js:518:13';

  // Each AC6-enumerated simulated failure, expressed as the native rejection the
  // bluetooth path would hand to BeacioError.from.
  const CASES: ReadonlyArray<{ label: string; native: unknown; code: string }> = [
    { label: 'timeout', native: new DOMException(DIRTY, 'TimeoutError'), code: 'TIMEOUT' },
    {
      label: 'disconnected',
      native: new DOMException(`GATT Server is disconnected. ${DIRTY}`, 'NetworkError'),
      code: 'DEVICE_DISCONNECTED',
    },
    {
      label: 'gatt-failure (default)',
      native: new DOMException(DIRTY, 'OperationError'),
      code: 'GATT_OPERATION_FAILED',
    },
    // user-cancel: the heuristic already drops the native message, but assert it too
    // so the full AC6 four-failure set is covered in one place.
    { label: 'user-cancel', native: new Error(`User cancelled. ${DIRTY}`), code: 'USER_CANCELLED' },
  ];

  for (const { label, native, code } of CASES) {
    it(`${label}: error.toString() carries no stack/Bluefy/undefined and keeps the right code`, () => {
      const err = BeacioError.from(native);
      const str = err.toString();

      expect(err.code).toBe(code);
      expect(str).not.toMatch(/Bluefy/i);
      expect(str).not.toContain('undefined');
      // Raw stack-frame + native-URL tokens must not survive.
      expect(str).not.toContain('\n    at ');
      expect(str).not.toMatch(/\bat\s+\S+\.js:\d+:\d+/);
      expect(str).not.toContain('webkit://');
      // A single, complete-sentence message — never a multi-line stack dump.
      expect(err.message.includes('\n')).toBe(false);
      expect(err.message.trim().length).toBeGreaterThan(0);
    });
  }

  it('preserves a clean single-line native message (no regression to passthrough)', () => {
    // The hygiene must be surgical: a clean message is kept verbatim so the existing
    // "message contains the native text" contracts above still hold.
    expect(BeacioError.from(new TypeError("Invalid UUID: 'bogus'")).message).toBe("Invalid UUID: 'bogus'");
    expect(BeacioError.from(new Error('something else')).message).toContain('something else');
    expect(BeacioError.from('raw string error').message).toContain('raw string error');
  });
});

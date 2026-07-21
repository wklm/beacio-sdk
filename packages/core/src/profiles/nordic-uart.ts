import { BaseProfile } from './base';

/** Nordic UART Service (NUS) UUID. */
const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
/** RX characteristic: host -> device. Write (without response). */
const NUS_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
/** TX characteristic: device -> host. Notify. */
const NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

/**
 * Service UUIDs a Nordic UART device may reach after connection (the single NUS
 * service). Use with `optionalServices` / `Beacio.registerServices`, or via
 * {@link deriveOptionalServices} given {@link NordicUARTProfile}.
 */
export const NUS_SERVICES: readonly string[] = [NUS_SERVICE];

/**
 * Nordic UART Service (NUS) profile — a bidirectional serial-over-BLE pipe.
 *
 * The de-facto standard "UART service" exposed by Espruino devices
 * (Bangle.js, Puck.js, Pixl.js, MDBT42Q), the BBC micro:bit, and Adafruit
 * Bluefruit modules. Data flows over two characteristics on the NUS service
 * `6e400001-b5a3-f393-e0a9-e50e24dcca9e`:
 *
 * - **TX** `6e400003-…` — device -> host, delivered via notifications.
 *   Enabled through {@link BaseProfile.subscribe} (the native layer owns the
 *   CCCD descriptor; `startNotifications()` covers notify *and* indicate).
 * - **RX** `6e400002-…` — host -> device, sent with write-without-response and
 *   chunked to the negotiated MTU.
 *
 * Strictly W3C `navigator.bluetooth` GATT: this profile never reads or writes
 * a CCCD/SCCD descriptor itself.
 *
 * @example
 * ```ts
 * import { NordicUARTProfile, deriveOptionalServices } from '@beacio/core/profiles';
 *
 * // Declare the service from the profile — no hand-copied UUID:
 * // requestDevice({ filters: [{ namePrefix: 'Puck.js' }],
 * //   optionalServices: deriveOptionalServices(NordicUARTProfile) })
 * const uart = new NordicUARTProfile(device);
 * await uart.connect();
 *
 * const decoder = new TextDecoder();
 * const unsubscribe = uart.onReceive((chunk) => {
 *   process.stdout.write(decoder.decode(chunk));
 * });
 *
 * await uart.send(new TextEncoder().encode('LED1.set()\n'));
 *
 * unsubscribe();
 * uart.stop();
 * ```
 */
export class NordicUARTProfile extends BaseProfile {
  /** Services this profile's device may reach after connection (the NUS service). Read by {@link deriveOptionalServices}. */
  static readonly services = NUS_SERVICES;

  protected readonly service = NUS_SERVICE;

  /**
   * Subscribe to inbound data from the device (TX characteristic, notify).
   * Each notification is delivered as a raw {@link DataView} chunk.
   *
   * @param callback - Invoked with every inbound chunk.
   * @returns Unsubscribe function. Also cleaned up by {@link BaseProfile.stop}.
   */
  onReceive(callback: (chunk: DataView) => void): () => void {
    return this.subscribe(NUS_TX, callback);
  }

  /**
   * Send data to the device (RX characteristic, write-without-response).
   * Payloads larger than the negotiated write-without-response limit are
   * split into MTU-sized chunks and written sequentially.
   *
   * @param data - Bytes to send. Accepts any {@link BufferSource}.
   */
  async send(data: BufferSource): Promise<void> {
    // Delegate fragmentation to the core write-chunker (via BaseProfile.sendChunked),
    // which derives a branded, always-positive ChunkSize from the negotiated
    // write-without-response limit / MTU. No hand-rolled offset loop here.
    await this.sendChunked(NUS_RX, data);
  }
}

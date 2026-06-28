import { BaseProfile } from './base';

/** HM-10 / CC2541 "transparent serial" service UUID. */
const FFE0_SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb';
/** Single bidirectional characteristic: write AND notify share this handle. */
const FFE1_CHAR = '0000ffe1-0000-1000-8000-00805f9b34fb';

/**
 * HM-10 (and compatible CC2540/CC2541 modules: HM-11, AT-09, JDY-08, …)
 * transparent-serial profile.
 *
 * Unlike Nordic UART's two-characteristic design, the HM-10 multiplexes both
 * directions onto a *single* characteristic `0000ffe1-…` on service
 * `0000ffe0-…`: the host writes to it (write-without-response) and the device
 * pushes inbound bytes back via notifications on the very same handle.
 *
 * Strictly W3C `navigator.bluetooth` GATT: notifications are enabled through
 * {@link BaseProfile.subscribe} (`startNotifications()`); this profile never
 * reads or writes a CCCD/SCCD descriptor itself.
 *
 * @example
 * ```ts
 * import { HM10SerialProfile } from '@beacio/profiles';
 *
 * // requestDevice({ filters: [{ services: ['0000ffe0-0000-1000-8000-00805f9b34fb'] }] })
 * const serial = new HM10SerialProfile(device);
 * await serial.connect();
 *
 * const decoder = new TextDecoder();
 * const unsubscribe = serial.onReceive((chunk) => {
 *   console.log(decoder.decode(chunk));
 * });
 *
 * await serial.send(new TextEncoder().encode('AT+NAME?\r\n'));
 *
 * unsubscribe();
 * serial.stop();
 * ```
 */
export class HM10SerialProfile extends BaseProfile {
  protected readonly service = FFE0_SERVICE;

  /**
   * Subscribe to inbound data from the module (FFE1 notify).
   * Each notification is delivered as a raw {@link DataView} chunk.
   *
   * @param callback - Invoked with every inbound chunk.
   * @returns Unsubscribe function. Also cleaned up by {@link BaseProfile.stop}.
   */
  onReceive(callback: (chunk: DataView) => void): () => void {
    return this.subscribe(FFE1_CHAR, callback);
  }

  /**
   * Send data to the module (FFE1 write-without-response — the same handle
   * used for inbound notifications). Payloads larger than the negotiated
   * write-without-response limit are split into MTU-sized chunks and written
   * sequentially.
   *
   * @param data - Bytes to send. Accepts any {@link BufferSource}.
   */
  async send(data: BufferSource): Promise<void> {
    // Delegate fragmentation to the core write-chunker (via BaseProfile.sendChunked),
    // which derives a branded, always-positive ChunkSize from the negotiated
    // write-without-response limit / MTU. No hand-rolled offset loop here.
    await this.sendChunked(FFE1_CHAR, data);
  }
}

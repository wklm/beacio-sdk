import { BeacioError } from './errors';
import type {
  DeviceErrorContext,
  WriteAutoOptions,
  WriteAutoResult,
  WriteFragmentedOptions,
  WriteFragmentedResult,
  WriteLargeOptions,
  WriteLargeResult,
  WriteLimits,
  WriteOptions,
} from './types';

// AIDEV-NOTE: Transport metadata is exposed by the Safari Beacio extension via
// the GATT server object; standard browsers leave these methods undefined.
type DeviceTransportInfo = {
  getMtu?: () => Promise<number | null>;
  getWriteLimits?: () => Promise<Partial<WriteLimits> | null | undefined>;
};

type Transport = (BluetoothRemoteGATTServer & DeviceTransportInfo) | null;

declare const chunkSizeBrand: unique symbol;

/**
 * A validated, strictly-positive integer chunk size in bytes.
 *
 * Nominal/branded: the brand can only be attached by {@link chunkSize} or
 * {@link clampChunkSize}, both of which guarantee `value >= 1`. Typing a chunk
 * loop's stride as `ChunkSize` makes a `0` (or negative) increment
 * unrepresentable at `offset += step`, eliminating the zero-stride infinite
 * loop at the type level — not just by runtime check.
 */
export type ChunkSize = number & { readonly [chunkSizeBrand]: true };

/** Conservative default chunk payload: the classic 23-byte ATT MTU minus the 3-byte ATT header. */
const DEFAULT_CHUNK_SIZE = 20;

/**
 * Strict smart-constructor for {@link ChunkSize}. Throws `INVALID_PARAMETER`
 * on a non-integer or non-positive value. Use when the caller supplied an
 * explicit size that must be rejected (not silently corrected) if invalid.
 */
export function chunkSize(n: number): ChunkSize {
  if (!Number.isInteger(n) || n <= 0) {
    throw new BeacioError('INVALID_PARAMETER', `Invalid chunkSize: ${n}. Must be a positive integer.`);
  }
  return n as ChunkSize;
}

/**
 * Lenient smart-constructor for {@link ChunkSize}. Coerces any
 * `null`/`undefined`/`0`/negative/`NaN`/non-integer input to a positive
 * `fallback` (default {@link DEFAULT_CHUNK_SIZE}). Never returns `<= 0`.
 *
 * This is the single clamp for platform-reported limits, where a literal `0`
 * (a valid `number | null` per {@link WriteLimits}) must be treated as "no
 * usable limit" rather than a zero-length stride.
 */
export function clampChunkSize(n: number | null | undefined, fallback: number = DEFAULT_CHUNK_SIZE): ChunkSize {
  return Number.isInteger(n) && (n as number) > 0 ? (n as ChunkSize) : chunkSize(fallback);
}

/**
 * Dependencies injected by {@link BeacioDevice} so the chunker stays free of any
 * direct BLE state. The device owns connection/characteristic resolution and the
 * timeout primitives; the chunker owns write fragmentation and in-flight tracking.
 */
export type WriteChunkerDeps = {
  getCharacteristic: (service: string, characteristic: string) => Promise<BluetoothRemoteGATTCharacteristic>;
  emitError: (error: Error, context: DeviceErrorContext) => void;
  validateTimeoutMs: (timeoutMs: number | undefined) => number | undefined;
  withOptionalTimeout: <T>(operation: Promise<T>, timeoutMs: number | undefined, message: string) => Promise<T>;
  isConnected: () => boolean;
  getTransport: () => Transport;
};

/**
 * Owns single-packet and fragmented writes, platform write-limit discovery, and
 * the in-flight write registry used to fail outstanding writes with
 * `WRITE_INCOMPLETE` when the device disconnects mid-transfer.
 *
 * AIDEV-NOTE: Extracted from device.ts (cleanup item 144). Behavior is
 * byte-identical to the former BeacioDevice methods; BeacioDevice delegates to
 * this class and wires {@link abortInFlightWrites} into its disconnect handler.
 */
export class WriteChunker {
  private inFlightWrites = new Map<symbol, { service: string; characteristic: string; aborted: boolean }>();

  constructor(private readonly deps: WriteChunkerDeps) {}

  async write(service: string, characteristic: string, value: BufferSource, options?: WriteOptions): Promise<void> {
    const timeoutMs = this.deps.validateTimeoutMs(options?.timeoutMs);
    const char = await this.deps.getCharacteristic(service, characteristic);
    const writeToken = Symbol(`write:${service}:${characteristic}`);
    this.inFlightWrites.set(writeToken, { service, characteristic, aborted: false });

    try {
      if (options?.mode === 'without-response') {
        await this.deps.withOptionalTimeout(
          char.writeValueWithoutResponse(value),
          timeoutMs,
          'Write without response timed out',
        );
        return;
      }

      await this.deps.withOptionalTimeout(
        char.writeValueWithResponse(value),
        timeoutMs,
        'Write with response timed out',
      );
    } catch (e) {
      const tracked = this.inFlightWrites.get(writeToken);
      if (tracked?.aborted) {
        throw new BeacioError(
          'WRITE_INCOMPLETE',
          `Write incomplete for ${service}/${characteristic}: disconnected before completion`,
          { retryAfterMs: 1000 },
        );
      }
      throw BeacioError.from(e);
    } finally {
      this.inFlightWrites.delete(writeToken);
    }
  }

  async writeFragmented(
    service: string,
    characteristic: string,
    value: BufferSource,
    options?: WriteFragmentedOptions,
  ): Promise<WriteFragmentedResult> {
    const bytes = this.toUint8Array(value);
    const totalBytes = bytes.byteLength;
    if (totalBytes === 0) {
      return { bytesWritten: 0, totalBytes: 0, chunkSize: 0, chunkCount: 0, retryCount: 0 };
    }

    const step: ChunkSize = options?.chunkSize !== undefined
      ? chunkSize(options.chunkSize)
      : this.deriveChunkSizeFromMtu(options?.mtu)
        ?? await this.deriveChunkSize(undefined, options?.mode);
    const maxRetries = options?.maxRetries ?? 0;
    const retryDelayMs = options?.retryDelayMs ?? 0;

    let bytesWritten = 0;
    let chunkCount = 0;
    let retryCount = 0;

    for (let offset = 0; offset < totalBytes; offset += step) {
      const nextOffset = Math.min(offset + step, totalBytes);
      const chunk = new Uint8Array(bytes.subarray(offset, nextOffset));
      let attempt = 0;

      while (true) {
        try {
          await this.write(service, characteristic, chunk, options);
          bytesWritten += chunk.byteLength;
          chunkCount += 1;
          break;
        } catch (error) {
          if (attempt >= maxRetries) {
            if (bytesWritten > 0 && bytesWritten < totalBytes) {
              throw new BeacioError(
                'WRITE_INCOMPLETE',
                `Write fragmented incomplete (${bytesWritten}/${totalBytes} bytes written): ${this.errorMessage(error)}`,
                { retryAfterMs: 1000 },
              );
            }
            throw BeacioError.from(error);
          }
          attempt += 1;
          retryCount += 1;
          if (retryDelayMs > 0) {
            await this.delay(retryDelayMs);
          }
        }
      }
    }

    return { bytesWritten, totalBytes, chunkSize: step, chunkCount, retryCount };
  }

  async writeLarge(
    service: string,
    characteristic: string,
    value: BufferSource,
    options?: WriteLargeOptions,
  ): Promise<WriteLargeResult> {
    const bytes = this.toUint8Array(value);
    const totalBytes = bytes.byteLength;

    if (totalBytes === 0) {
      return { bytesWritten: 0, totalBytes: 0, chunkSize: 0, chunkCount: 0 };
    }

    const derivedChunkSize = await this.deriveChunkSize(options?.chunkSize, options?.mode);
    let bytesWritten = 0;
    let chunkCount = 0;

    for (let offset = 0; offset < totalBytes; offset += derivedChunkSize) {
      const nextOffset = Math.min(offset + derivedChunkSize, totalBytes);
      const chunk = bytes.subarray(offset, nextOffset);
      const safeChunk = new Uint8Array(chunk);

      try {
        await this.write(service, characteristic, safeChunk, options);
        bytesWritten += chunk.byteLength;
        chunkCount += 1;
      } catch (error) {
        if (bytesWritten > 0 && bytesWritten < totalBytes) {
          throw new BeacioError(
            'WRITE_INCOMPLETE',
            `Write incomplete (${bytesWritten}/${totalBytes} bytes written): ${this.errorMessage(error)}`,
          );
        }
        throw BeacioError.from(error);
      }
    }

    if (bytesWritten !== totalBytes) {
      throw new BeacioError('WRITE_INCOMPLETE', `Write incomplete (${bytesWritten}/${totalBytes} bytes written)`);
    }

    return {
      bytesWritten,
      totalBytes,
      chunkSize: derivedChunkSize,
      chunkCount,
    };
  }

  async writeWithoutResponse(service: string, characteristic: string, value: BufferSource, options?: Omit<WriteOptions, 'mode'>): Promise<void> {
    return this.write(service, characteristic, value, { ...options, mode: 'without-response' });
  }

  async getWriteLimits(): Promise<WriteLimits> {
    if (!this.deps.isConnected()) throw new BeacioError('DEVICE_DISCONNECTED');

    const transportInfo = this.deps.getTransport();
    const limits = await transportInfo?.getWriteLimits?.();
    const mtu = limits?.mtu ?? await transportInfo?.getMtu?.() ?? null;

    return {
      withResponse: limits?.withResponse ?? null,
      withoutResponse: limits?.withoutResponse ?? null,
      mtu,
    };
  }

  async writeAuto(
    service: string,
    characteristic: string,
    value: BufferSource,
    options?: WriteAutoOptions,
  ): Promise<WriteAutoResult> {
    const bytes = this.toUint8Array(value);
    const totalBytes = bytes.byteLength;
    const payload = new Uint8Array(bytes);

    if (totalBytes === 0) {
      await this.write(service, characteristic, payload, options);
      return {
        bytesWritten: 0,
        totalBytes: 0,
        chunkSize: 0,
        chunkCount: 0,
        retryCount: 0,
        fragmented: false,
      };
    }

    const limit = await this.deriveChunkSize(options?.chunkSize, options?.mode);
    if (totalBytes <= limit) {
      await this.write(service, characteristic, payload, options);
      return {
        bytesWritten: totalBytes,
        totalBytes,
        chunkSize: totalBytes,
        chunkCount: 1,
        retryCount: 0,
        fragmented: false,
      };
    }

    const result = await this.writeFragmented(service, characteristic, payload, options);
    return {
      ...result,
      fragmented: true,
    };
  }

  // AIDEV-NOTE: Called from BeacioDevice.handleDisconnect()/disconnect() so any
  // outstanding write rejects with WRITE_INCOMPLETE instead of a raw GATT error.
  abortInFlightWrites(): void {
    for (const entry of this.inFlightWrites.values()) {
      entry.aborted = true;
    }
  }

  private async deriveChunkSize(explicitChunkSize: number | undefined, mode: WriteOptions['mode']): Promise<ChunkSize> {
    if (explicitChunkSize !== undefined) {
      return chunkSize(explicitChunkSize);
    }

    const limits = await this.getWriteLimits().catch(() => ({ withResponse: null, withoutResponse: null, mtu: null }));
    const preferred = mode === 'without-response' ? limits.withoutResponse : limits.withResponse;
    if (typeof preferred === 'number' && preferred > 0) return chunkSize(preferred);
    if (typeof limits.mtu === 'number' && limits.mtu > 3) return chunkSize(limits.mtu - 3);

    // Conservative fallback for platforms that do not expose limits.
    return chunkSize(DEFAULT_CHUNK_SIZE);
  }

  private deriveChunkSizeFromMtu(mtu: number | undefined): ChunkSize | null {
    if (mtu === undefined) return null;
    if (!Number.isInteger(mtu) || mtu <= 3) {
      throw new BeacioError('INVALID_PARAMETER', `Invalid mtu: ${mtu}. Must be an integer greater than 3.`);
    }
    return chunkSize(mtu - 3);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => { setTimeout(resolve, ms); });
  }

  private toUint8Array(value: BufferSource): Uint8Array {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}

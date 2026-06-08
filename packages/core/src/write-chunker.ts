import { WebBLEError } from './errors';
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

// AIDEV-NOTE: Transport metadata is exposed by the Safari WebBLE extension via
// the GATT server object; standard browsers leave these methods undefined.
type DeviceTransportInfo = {
  getMtu?: () => Promise<number | null>;
  getWriteLimits?: () => Promise<Partial<WriteLimits> | null | undefined>;
};

type Transport = (BluetoothRemoteGATTServer & DeviceTransportInfo) | null;

/**
 * Dependencies injected by {@link WebBLEDevice} so the chunker stays free of any
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
 * byte-identical to the former WebBLEDevice methods; WebBLEDevice delegates to
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
        throw new WebBLEError(
          'WRITE_INCOMPLETE',
          `Write incomplete for ${service}/${characteristic}: disconnected before completion`,
          { retryAfterMs: 1000 },
        );
      }
      throw WebBLEError.from(e);
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

    const chunkSize = options?.chunkSize
      ?? this.deriveChunkSizeFromMtu(options?.mtu)
      ?? await this.deriveChunkSize(undefined, options?.mode);
    const maxRetries = options?.maxRetries ?? 0;
    const retryDelayMs = options?.retryDelayMs ?? 0;

    let bytesWritten = 0;
    let chunkCount = 0;
    let retryCount = 0;

    for (let offset = 0; offset < totalBytes; offset += chunkSize) {
      const nextOffset = Math.min(offset + chunkSize, totalBytes);
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
              throw new WebBLEError(
                'WRITE_INCOMPLETE',
                `Write fragmented incomplete (${bytesWritten}/${totalBytes} bytes written): ${this.errorMessage(error)}`,
                { retryAfterMs: 1000 },
              );
            }
            throw WebBLEError.from(error);
          }
          attempt += 1;
          retryCount += 1;
          if (retryDelayMs > 0) {
            await this.delay(retryDelayMs);
          }
        }
      }
    }

    return { bytesWritten, totalBytes, chunkSize, chunkCount, retryCount };
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
          throw new WebBLEError(
            'WRITE_INCOMPLETE',
            `Write incomplete (${bytesWritten}/${totalBytes} bytes written): ${this.errorMessage(error)}`,
          );
        }
        throw WebBLEError.from(error);
      }
    }

    if (bytesWritten !== totalBytes) {
      throw new WebBLEError('WRITE_INCOMPLETE', `Write incomplete (${bytesWritten}/${totalBytes} bytes written)`);
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
    if (!this.deps.isConnected()) throw new WebBLEError('DEVICE_DISCONNECTED');

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

  // AIDEV-NOTE: Called from WebBLEDevice.handleDisconnect()/disconnect() so any
  // outstanding write rejects with WRITE_INCOMPLETE instead of a raw GATT error.
  abortInFlightWrites(): void {
    for (const entry of this.inFlightWrites.values()) {
      entry.aborted = true;
    }
  }

  private async deriveChunkSize(explicitChunkSize: number | undefined, mode: WriteOptions['mode']): Promise<number> {
    if (explicitChunkSize !== undefined) {
      if (!Number.isInteger(explicitChunkSize) || explicitChunkSize <= 0) {
        throw new WebBLEError('INVALID_PARAMETER', `Invalid chunkSize: ${explicitChunkSize}. Must be a positive integer.`);
      }
      return explicitChunkSize;
    }

    const limits = await this.getWriteLimits().catch(() => ({ withResponse: null, withoutResponse: null, mtu: null }));
    const preferred = mode === 'without-response' ? limits.withoutResponse : limits.withResponse;
    if (typeof preferred === 'number' && preferred > 0) return preferred;
    if (typeof limits.mtu === 'number' && limits.mtu > 3) return limits.mtu - 3;

    // Conservative fallback for platforms that do not expose limits.
    return 20;
  }

  private deriveChunkSizeFromMtu(mtu: number | undefined): number | null {
    if (mtu === undefined) return null;
    if (!Number.isInteger(mtu) || mtu <= 3) {
      throw new WebBLEError('INVALID_PARAMETER', `Invalid mtu: ${mtu}. Must be an integer greater than 3.`);
    }
    return mtu - 3;
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

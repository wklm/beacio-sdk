import type {
  NotificationCallback,
  NativeOverflowEvent,
  BeacioDevice,
  WriteFragmentedOptions,
  WriteFragmentedResult,
  WriteLimits,
  WriteOptions,
} from '../index';
import { resolveUUID } from '../uuid';

// Sound top type for "any characteristic definition": TRead is covariant
// (parse return → unknown), TWrite is contravariant (serialize param → never),
// so every CharacteristicDefinition<A, B> is assignable here without `any`.
type AnyCharacteristicDefinition = CharacteristicDefinition<unknown, never>;

export function parseRawBytes(value: BufferSource): DataView {
  if (value instanceof DataView) {
    return new DataView(value.buffer, value.byteOffset, value.byteLength);
  }

  if (value instanceof ArrayBuffer) {
    return new DataView(value);
  }

  return new DataView(value.buffer, value.byteOffset, value.byteLength);
}

type UUIDLike = string;
type Capability = 'read' | 'write' | 'writeWithoutResponse' | 'notify';
type CapabilitySet = readonly Capability[];

type CharacteristicReadConfig<T> = {
  capabilities: readonly ['read'] | readonly ['read', ...Capability[]];
  parse: (dv: DataView) => T;
};

type CharacteristicWriteConfig<W> = {
  capabilities: readonly ['write'] | readonly ['writeWithoutResponse'] | readonly ['write', ...Capability[]] | readonly ['writeWithoutResponse', ...Capability[]];
  serialize: (value: W) => BufferSource;
};

type CharacteristicReadWriteConfig<T, W> = {
  capabilities:
    | readonly ['read', 'write']
    | readonly ['read', 'writeWithoutResponse']
    | readonly ['write', 'read']
    | readonly ['writeWithoutResponse', 'read']
    | readonly ['read', 'write', ...Capability[]]
    | readonly ['read', 'writeWithoutResponse', ...Capability[]]
    | readonly ['write', 'read', ...Capability[]]
    | readonly ['writeWithoutResponse', 'read', ...Capability[]];
  parse: (dv: DataView) => T;
  serialize: (value: W) => BufferSource;
};

export type CharacteristicDefinition<TRead = never, TWrite = never> = {
  uuid: UUIDLike;
} & (
  | CharacteristicReadConfig<TRead>
  | CharacteristicWriteConfig<TWrite>
  | CharacteristicReadWriteConfig<TRead, TWrite>
);

export interface ProfileConfig<C extends Record<string, AnyCharacteristicDefinition>> {
  name: string;
  service: UUIDLike;
  characteristics: C;
}

type CapabilityOf<T extends AnyCharacteristicDefinition> = T['capabilities'][number];
type ReadableKeys<C extends Record<string, AnyCharacteristicDefinition>> = {
  [K in keyof C]: 'read' extends CapabilityOf<C[K]> ? K : never;
}[keyof C] & string;
type WritableKeys<C extends Record<string, AnyCharacteristicDefinition>> = {
  [K in keyof C]: 'write' extends CapabilityOf<C[K]>
    ? K
    : 'writeWithoutResponse' extends CapabilityOf<C[K]>
      ? K
      : never;
}[keyof C] & string;
type NotifiableKeys<C extends Record<string, AnyCharacteristicDefinition>> = {
  [K in keyof C]: 'notify' extends CapabilityOf<C[K]> ? K : never;
}[keyof C] & string;

type ReadValue<T> = T extends { parse: (dv: DataView) => infer TResult } ? TResult : never;
type WriteValue<T> = T extends { serialize: (value: infer TValue) => BufferSource } ? TValue : never;
type CanonicalCharacteristic<C extends AnyCharacteristicDefinition> = Omit<C, 'uuid'> & { uuid: string };
type ReadParser<T> = { parse: (dv: DataView) => T };
type WriteSerializer<T> = { serialize: (value: T) => BufferSource };

function hasCapability(capabilities: CapabilitySet, capability: Capability): boolean {
  return capabilities.includes(capability);
}

export abstract class BaseProfile {
  protected device: BeacioDevice;
  protected abstract readonly service: string;
  private cleanups: (() => void)[] = [];

  constructor(device: BeacioDevice) {
    this.device = device;
  }

  async connect(): Promise<void> {
    await this.device.connect();
  }

  stop(): void {
    for (const cleanup of this.cleanups.splice(0)) {
      cleanup();
    }
  }

  dispose(): void {
    this.stop();
  }

  protected async read(characteristic: string): Promise<DataView> {
    return this.device.read(this.service, characteristic);
  }

  protected async write(characteristic: string, value: BufferSource): Promise<void> {
    return this.device.write(this.service, characteristic, value);
  }

  protected async writeWithoutResponse(characteristic: string, value: BufferSource): Promise<void> {
    return this.device.writeWithoutResponse(this.service, characteristic, value);
  }

  /**
   * Send a payload of any size to `characteristic`, fragmenting it into
   * MTU-sized chunks. This is a thin passthrough to {@link BeacioDevice.writeFragmented},
   * which owns the (already-clamped) chunk-size derivation via the branded
   * `ChunkSize` smart-constructors in the core write-chunker — so the stride is
   * guaranteed `>= 1` and a zero-stride infinite loop is unrepresentable.
   *
   * Profiles MUST use this instead of hand-rolling a `for (offset += step)` /
   * `subarray()` / `writeWithoutResponse()` chunk loop (enforced by the
   * `no-restricted-syntax` guard scoped to `packages/profiles/src`). Defaults to
   * `mode: 'without-response'` — the serial-pipe convention (Nordic UART, HM-10).
   *
   * @param characteristic - Target characteristic UUID or alias on this profile's service.
   * @param value - Bytes to send. Accepts any {@link BufferSource}.
   * @param options - Fragmentation/retry overrides; `mode` defaults to `'without-response'`.
   * @returns The {@link WriteFragmentedResult} (bytes written, chunk size/count, retries).
   */
  protected async sendChunked(
    characteristic: string,
    value: BufferSource,
    options: WriteFragmentedOptions = {},
  ): Promise<WriteFragmentedResult> {
    return this.device.writeFragmented(this.service, characteristic, value, {
      mode: 'without-response',
      ...options,
    });
  }

  protected async writeValue(characteristic: string, value: BufferSource, options?: WriteOptions): Promise<void> {
    if (options?.mode === 'without-response') {
      return this.device.writeWithoutResponse(this.service, characteristic, value, options);
    }
    return this.device.write(this.service, characteristic, value, options);
  }

  protected async getWriteLimits(): Promise<WriteLimits> {
    return this.device.getWriteLimits();
  }

  protected async getMtu(): Promise<number | null> {
    return this.device.getMtu();
  }

  protected subscribe(characteristic: string, callback: NotificationCallback): () => void {
    const unsubscribe = this.device.subscribe(this.service, characteristic, callback);
    this.cleanups.push(unsubscribe);
    return () => {
      unsubscribe();
      this.cleanups = this.cleanups.filter((candidate) => candidate !== unsubscribe);
    };
  }

  /**
   * Observe NATIVE notification-queue overflows for `characteristic` on this
   * profile's service. The bounded Swift `EventQueue` evicts notifications under
   * sustained high-frequency load and the polyfill surfaces each eviction as a
   * `beacio:overflow` `CustomEvent` on the characteristic; this decodes that
   * event's `detail` into a typed {@link NativeOverflowEvent} and forwards it to
   * `callback`.
   *
   * Lifecycle parity with {@link subscribe}: the returned unsubscribe is also
   * registered into the profile's cleanup set, so {@link stop}/{@link dispose}
   * detach the listener too. A staleness `callback` should typically re-read the
   * affected characteristic to resynchronise any UI tracking the last notified
   * value rather than trusting that (now-stale) value.
   *
   * @param characteristic - Characteristic UUID or alias on this profile's service.
   * @param callback - Called with the decoded eviction metadata on each overflow.
   * @returns Unsubscribe function.
   */
  protected onOverflow(characteristic: string, callback: (event: NativeOverflowEvent) => void): () => void {
    const unsubscribe = this.device.onCharacteristicOverflow(this.service, characteristic, (event) => {
      callback(decodeNativeOverflow(event));
    });
    this.cleanups.push(unsubscribe);
    return () => {
      unsubscribe();
      this.cleanups = this.cleanups.filter((candidate) => candidate !== unsubscribe);
    };
  }
}

/**
 * Decode a `beacio:overflow` {@link Event} (a `CustomEvent` whose `detail` carries
 * the native bounded-queue eviction metadata) into a typed
 * {@link NativeOverflowEvent}. Each field is `undefined` when the native bridge
 * omitted it (forward-compat guard); a conforming bridge supplies all four. Total
 * and side-effect-free — never throws on a malformed or detail-less event.
 */
function decodeNativeOverflow(event: Event): NativeOverflowEvent {
  const detail = (event as CustomEvent).detail as unknown;
  const meta = (detail && typeof detail === 'object') ? (detail as Record<string, unknown>) : {};
  return {
    evictedCount: typeof meta.evictedCount === 'number' ? meta.evictedCount : undefined,
    queueCapacity: typeof meta.queueCapacity === 'number' ? meta.queueCapacity : undefined,
    seq: typeof meta.seq === 'number' ? meta.seq : undefined,
    timestamp: typeof meta.timestamp === 'number' ? meta.timestamp : undefined,
  };
}

type DefinedProfileInstance<C extends Record<string, AnyCharacteristicDefinition>> = BaseProfile & {
  readChar<K extends ReadableKeys<C>>(name: K): Promise<ReadValue<C[K]>>;
  subscribeChar<K extends Extract<ReadableKeys<C>, NotifiableKeys<C>>>(name: K, cb: (value: ReadValue<C[K]>) => void): () => void;
  writeChar<K extends WritableKeys<C>>(name: K, value: WriteValue<C[K]>, options?: WriteOptions): Promise<void>;
  getCharacteristicCapabilities<K extends keyof C & string>(name: K): ReadonlyArray<Capability>;
  getCharacteristicUUID<K extends keyof C & string>(name: K): string;
  getServiceUUID(): string;
  getWriteLimits(): Promise<WriteLimits>;
  getMtu(): Promise<number | null>;
};

export interface DefinedProfile<C extends Record<string, AnyCharacteristicDefinition>> {
  new (device: BeacioDevice): DefinedProfileInstance<C>;
  readonly profileName: string;
  readonly serviceUUID: string;
  readonly characteristics: {
    [K in keyof C]: Omit<C[K], 'uuid'> & { uuid: string };
  };
}

export function defineProfile<C extends Record<string, AnyCharacteristicDefinition>>(
  config: ProfileConfig<C>,
): DefinedProfile<C> {
  const serviceUUID = resolveUUID(config.service);
  const characteristics = Object.fromEntries(
    Object.entries(config.characteristics).map(([name, definition]) => {
      const canonical = {
        ...definition,
        uuid: resolveUUID(definition.uuid),
      };

      if (hasCapability(canonical.capabilities, 'read') && typeof (canonical as { parse?: unknown }).parse !== 'function') {
        throw new Error(`Characteristic ${name} declares read capability but is missing parse()`);
      }

      if (
        (hasCapability(canonical.capabilities, 'write') || hasCapability(canonical.capabilities, 'writeWithoutResponse'))
        && typeof (canonical as { serialize?: unknown }).serialize !== 'function'
      ) {
        throw new Error(`Characteristic ${name} declares write capability but is missing serialize()`);
      }

      return [name, canonical];
    }),
  ) as unknown as {
    [K in keyof C]: Omit<C[K], 'uuid'> & { uuid: string };
  };

  class GeneratedProfile extends BaseProfile {
    static readonly profileName = config.name;
    static readonly serviceUUID = serviceUUID;
    static readonly characteristics = characteristics;

    protected readonly service = serviceUUID;

    getCharacteristicCapabilities<K extends keyof C & string>(name: K): ReadonlyArray<Capability> {
      return characteristics[name].capabilities;
    }

    getCharacteristicUUID<K extends keyof C & string>(name: K): string {
      return characteristics[name].uuid;
    }

    getServiceUUID(): string {
      return serviceUUID;
    }

    async readChar<K extends ReadableKeys<C>>(name: K): Promise<ReadValue<C[K]>> {
      const characteristic = characteristics[name] as unknown as CanonicalCharacteristic<C[K]> & ReadParser<ReadValue<C[K]>>;
      const raw = await this.read(characteristic.uuid);
      return characteristic.parse(raw);
    }

    subscribeChar<K extends Extract<ReadableKeys<C>, NotifiableKeys<C>>>(name: K, cb: (value: ReadValue<C[K]>) => void): () => void {
      const characteristic = characteristics[name] as unknown as CanonicalCharacteristic<C[K]> & ReadParser<ReadValue<C[K]>>;
      return this.subscribe(characteristic.uuid, (value) => {
        cb(characteristic.parse(value));
      });
    }

    async writeChar<K extends WritableKeys<C>>(name: K, value: WriteValue<C[K]>, options?: WriteOptions): Promise<void> {
      const characteristic = characteristics[name] as unknown as CanonicalCharacteristic<C[K]> & WriteSerializer<WriteValue<C[K]>>;
      const serialized = characteristic.serialize(value);
      const mode = options?.mode ?? (hasCapability(characteristic.capabilities, 'write') ? 'with-response' : 'without-response');
      await this.writeValue(characteristic.uuid, serialized, { ...options, mode });
    }

    async getWriteLimits(): Promise<WriteLimits> {
      return super.getWriteLimits();
    }

    async getMtu(): Promise<number | null> {
      return super.getMtu();
  }
}

  return GeneratedProfile as unknown as DefinedProfile<C>;
}

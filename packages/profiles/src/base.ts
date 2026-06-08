import type {
  NotificationCallback,
  WebBLEDevice,
  WriteLimits,
  WriteOptions,
} from '@ios-web-bluetooth/core';

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

export interface ProfileConfig<C extends Record<string, CharacteristicDefinition<any, any>>> {
  name: string;
  service: UUIDLike;
  characteristics: C;
}

type CapabilityOf<T extends CharacteristicDefinition<any, any>> = T['capabilities'][number];
type ReadableKeys<C extends Record<string, CharacteristicDefinition<any, any>>> = {
  [K in keyof C]: 'read' extends CapabilityOf<C[K]> ? K : never;
}[keyof C] & string;
type WritableKeys<C extends Record<string, CharacteristicDefinition<any, any>>> = {
  [K in keyof C]: 'write' extends CapabilityOf<C[K]>
    ? K
    : 'writeWithoutResponse' extends CapabilityOf<C[K]>
      ? K
      : never;
}[keyof C] & string;
type NotifiableKeys<C extends Record<string, CharacteristicDefinition<any, any>>> = {
  [K in keyof C]: 'notify' extends CapabilityOf<C[K]> ? K : never;
}[keyof C] & string;

type ReadValue<T> = T extends { parse: (dv: DataView) => infer TResult } ? TResult : never;
type WriteValue<T> = T extends { serialize: (value: infer TValue) => BufferSource } ? TValue : never;
type CanonicalCharacteristic<C extends CharacteristicDefinition<any, any>> = Omit<C, 'uuid'> & { uuid: string };
type ReadParser<T> = { parse: (dv: DataView) => T };
type WriteSerializer<T> = { serialize: (value: T) => BufferSource };

function canonicalizeUUID(uuid: string): string {
  const normalized = uuid.trim().toLowerCase();
  if (/^[0-9a-f]{4}$/.test(normalized) || /^[0-9a-f]{8}$/.test(normalized)) {
    return normalized;
  }
  if (/^[0-9a-z_]+$/.test(normalized)) {
    return normalized;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    return normalized;
  }
  throw new Error(`Invalid Bluetooth UUID or alias: ${uuid}`);
}

function hasCapability(capabilities: CapabilitySet, capability: Capability): boolean {
  return capabilities.includes(capability);
}

export abstract class BaseProfile {
  protected device: WebBLEDevice;
  protected abstract readonly service: string;
  private cleanups: (() => void)[] = [];

  constructor(device: WebBLEDevice) {
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
}

type DefinedProfileInstance<C extends Record<string, CharacteristicDefinition<any, any>>> = BaseProfile & {
  readChar<K extends ReadableKeys<C>>(name: K): Promise<ReadValue<C[K]>>;
  subscribeChar<K extends Extract<ReadableKeys<C>, NotifiableKeys<C>>>(name: K, cb: (value: ReadValue<C[K]>) => void): () => void;
  writeChar<K extends WritableKeys<C>>(name: K, value: WriteValue<C[K]>, options?: WriteOptions): Promise<void>;
  getCharacteristicCapabilities<K extends keyof C & string>(name: K): ReadonlyArray<Capability>;
  getCharacteristicUUID<K extends keyof C & string>(name: K): string;
  getServiceUUID(): string;
  getWriteLimits(): Promise<WriteLimits>;
  getMtu(): Promise<number | null>;
};

export interface DefinedProfile<C extends Record<string, CharacteristicDefinition<any, any>>> {
  new (device: WebBLEDevice): DefinedProfileInstance<C>;
  readonly profileName: string;
  readonly serviceUUID: string;
  readonly characteristics: {
    [K in keyof C]: Omit<C[K], 'uuid'> & { uuid: string };
  };
}

export function defineProfile<C extends Record<string, CharacteristicDefinition<any, any>>>(
  config: ProfileConfig<C>,
): DefinedProfile<C> {
  const serviceUUID = canonicalizeUUID(config.service);
  const characteristics = Object.fromEntries(
    Object.entries(config.characteristics).map(([name, definition]) => {
      const canonical = {
        ...definition,
        uuid: canonicalizeUUID(definition.uuid),
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

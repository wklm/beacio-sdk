import { BaseProfile } from './base';

const decoder = new TextDecoder();

/**
 * Aggregated device information read from the Device Information Service.
 *
 * All fields are optional because a peripheral may not expose every
 * characteristic. Use {@link DeviceInfoProfile.readAll} to populate as
 * many fields as the device supports in a single call.
 */
export interface DeviceInfo {
  /** Model number string (characteristic 0x2A24). */
  modelNumber?: string;
  /** Serial number string (characteristic 0x2A25). */
  serialNumber?: string;
  /** Firmware revision string (characteristic 0x2A26). */
  firmwareRevision?: string;
  /** Hardware revision string (characteristic 0x2A27). */
  hardwareRevision?: string;
  /** Software revision string (characteristic 0x2A28). */
  softwareRevision?: string;
  /** Manufacturer name string (characteristic 0x2A29). */
  manufacturerName?: string;
  /** Raw System ID value (characteristic 0x2A23) as a {@link DataView}. */
  systemId?: DataView;
}

/**
 * BLE Device Information Service profile (UUID 0x180A).
 *
 * Reads standard device metadata characteristics such as model number,
 * manufacturer name, firmware revision, and more. String values are
 * decoded from raw bytes with {@link TextDecoder}.
 *
 * @example
 * ```ts
 * import { DeviceInfoProfile } from '@beacio/profiles';
 *
 * const info = new DeviceInfoProfile(device);
 * await info.connect();
 *
 * // Read individual fields
 * const manufacturer = await info.readManufacturerName();
 * const model = await info.readModelNumber();
 * console.log(`${manufacturer} ${model}`);
 *
 * // Or read all available fields at once
 * const all = await info.readAll();
 * console.log(all);
 * // { modelNumber: 'Sensor-v2', manufacturerName: 'Acme', ... }
 *
 * info.stop();
 * ```
 */
export class DeviceInfoProfile extends BaseProfile {
  protected readonly service = 'device_information';

  async readModelNumber(): Promise<string> {
    return this.readString('model_number_string');
  }

  async readSerialNumber(): Promise<string> {
    return this.readString('serial_number_string');
  }

  async readFirmwareRevision(): Promise<string> {
    return this.readString('firmware_revision_string');
  }

  async readHardwareRevision(): Promise<string> {
    return this.readString('hardware_revision_string');
  }

  async readSoftwareRevision(): Promise<string> {
    return this.readString('software_revision_string');
  }

  async readManufacturerName(): Promise<string> {
    return this.readString('manufacturer_name_string');
  }

  async readSystemId(): Promise<DataView> {
    return this.read('system_id');
  }

  /** Read all available device info fields. Missing fields return undefined. */
  async readAll(): Promise<DeviceInfo> {
    const info: DeviceInfo = {};
    const tryRead = async (fn: () => Promise<any>, key: keyof DeviceInfo) => {
      try { (info as any)[key] = await fn(); } catch {}
    };
    await Promise.all([
      tryRead(() => this.readModelNumber(), 'modelNumber'),
      tryRead(() => this.readSerialNumber(), 'serialNumber'),
      tryRead(() => this.readFirmwareRevision(), 'firmwareRevision'),
      tryRead(() => this.readHardwareRevision(), 'hardwareRevision'),
      tryRead(() => this.readSoftwareRevision(), 'softwareRevision'),
      tryRead(() => this.readManufacturerName(), 'manufacturerName'),
      tryRead(() => this.readSystemId(), 'systemId'),
    ]);
    return info;
  }

  private async readString(characteristic: string): Promise<string> {
    const dv = await this.read(characteristic);
    return decoder.decode(dv.buffer);
  }
}

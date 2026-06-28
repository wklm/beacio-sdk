import { DeviceInfoProfile } from '../src/device-info';
import type { DeviceInfo } from '../src/device-info';
import type { BeacioDevice } from '@beacio/core';

function stringToDataView(str: string): DataView {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function makeDataView(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

function createMockDevice(readMap: Record<string, DataView>): BeacioDevice {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockImplementation((_service: string, characteristic: string) => {
      if (readMap[characteristic]) {
        return Promise.resolve(readMap[characteristic]);
      }
      return Promise.reject(new Error(`Characteristic ${characteristic} not found`));
    }),
    write: jest.fn().mockResolvedValue(undefined),
    writeWithoutResponse: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(jest.fn()),
    getWriteLimits: jest.fn().mockResolvedValue({ withResponse: 512, withoutResponse: 512 }),
    getMtu: jest.fn().mockResolvedValue(23),
  } as unknown as BeacioDevice;
}

describe('DeviceInfoProfile', () => {
  describe('readModelNumber', () => {
    it('reads model number string', async () => {
      const device = createMockDevice({ model_number_string: stringToDataView('Sensor-v2') });
      const info = new DeviceInfoProfile(device);
      const model = await info.readModelNumber();
      expect(model).toBe('Sensor-v2');
    });

    it('reads empty model number', async () => {
      const device = createMockDevice({ model_number_string: stringToDataView('') });
      const info = new DeviceInfoProfile(device);
      const model = await info.readModelNumber();
      expect(model).toBe('');
    });
  });

  describe('readSerialNumber', () => {
    it('reads serial number string', async () => {
      const device = createMockDevice({ serial_number_string: stringToDataView('SN-12345') });
      const info = new DeviceInfoProfile(device);
      const serial = await info.readSerialNumber();
      expect(serial).toBe('SN-12345');
    });
  });

  describe('readFirmwareRevision', () => {
    it('reads firmware revision string', async () => {
      const device = createMockDevice({ firmware_revision_string: stringToDataView('1.2.3') });
      const info = new DeviceInfoProfile(device);
      const fw = await info.readFirmwareRevision();
      expect(fw).toBe('1.2.3');
    });
  });

  describe('readHardwareRevision', () => {
    it('reads hardware revision string', async () => {
      const device = createMockDevice({ hardware_revision_string: stringToDataView('Rev-B') });
      const info = new DeviceInfoProfile(device);
      const hw = await info.readHardwareRevision();
      expect(hw).toBe('Rev-B');
    });
  });

  describe('readSoftwareRevision', () => {
    it('reads software revision string', async () => {
      const device = createMockDevice({ software_revision_string: stringToDataView('2.0.0-beta') });
      const info = new DeviceInfoProfile(device);
      const sw = await info.readSoftwareRevision();
      expect(sw).toBe('2.0.0-beta');
    });
  });

  describe('readManufacturerName', () => {
    it('reads manufacturer name string', async () => {
      const device = createMockDevice({ manufacturer_name_string: stringToDataView('Acme Corp') });
      const info = new DeviceInfoProfile(device);
      const name = await info.readManufacturerName();
      expect(name).toBe('Acme Corp');
    });

    it('handles unicode manufacturer name', async () => {
      const device = createMockDevice({ manufacturer_name_string: stringToDataView('Firma GmbH') });
      const info = new DeviceInfoProfile(device);
      const name = await info.readManufacturerName();
      expect(name).toBe('Firma GmbH');
    });
  });

  describe('readSystemId', () => {
    it('reads raw system ID as DataView', async () => {
      const dv = makeDataView([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
      const device = createMockDevice({ system_id: dv });
      const info = new DeviceInfoProfile(device);
      const systemId = await info.readSystemId();
      expect(systemId).toBeInstanceOf(DataView);
      expect(systemId.byteLength).toBe(8);
      expect(systemId.getUint8(0)).toBe(0x01);
      expect(systemId.getUint8(7)).toBe(0x08);
    });
  });

  describe('readAll', () => {
    it('reads all available fields', async () => {
      const device = createMockDevice({
        model_number_string: stringToDataView('Model-X'),
        serial_number_string: stringToDataView('SN-001'),
        firmware_revision_string: stringToDataView('1.0.0'),
        hardware_revision_string: stringToDataView('Rev-A'),
        software_revision_string: stringToDataView('2.0.0'),
        manufacturer_name_string: stringToDataView('TestCo'),
        system_id: makeDataView([0xAA, 0xBB]),
      });
      const info = new DeviceInfoProfile(device);
      const all = await info.readAll();
      expect(all.modelNumber).toBe('Model-X');
      expect(all.serialNumber).toBe('SN-001');
      expect(all.firmwareRevision).toBe('1.0.0');
      expect(all.hardwareRevision).toBe('Rev-A');
      expect(all.softwareRevision).toBe('2.0.0');
      expect(all.manufacturerName).toBe('TestCo');
      expect(all.systemId).toBeInstanceOf(DataView);
    });

    it('returns undefined for missing characteristics', async () => {
      const device = createMockDevice({
        model_number_string: stringToDataView('Model-Y'),
      });
      const info = new DeviceInfoProfile(device);
      const all = await info.readAll();
      expect(all.modelNumber).toBe('Model-Y');
      expect(all.serialNumber).toBeUndefined();
      expect(all.firmwareRevision).toBeUndefined();
      expect(all.manufacturerName).toBeUndefined();
      expect(all.systemId).toBeUndefined();
    });

    it('returns empty object when no characteristics are available', async () => {
      const device = createMockDevice({});
      const info = new DeviceInfoProfile(device);
      const all = await info.readAll();
      expect(all.modelNumber).toBeUndefined();
      expect(all.serialNumber).toBeUndefined();
      expect(all.firmwareRevision).toBeUndefined();
      expect(all.hardwareRevision).toBeUndefined();
      expect(all.softwareRevision).toBeUndefined();
      expect(all.manufacturerName).toBeUndefined();
      expect(all.systemId).toBeUndefined();
    });
  });
});

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import {
  createMockBluetooth,
  MockBluetooth,
  BLE_UUIDS,
  devices,
} from '../../src/testing';

describe('E2E: Notification Stress Tests', () => {
  let mock: MockBluetooth;

  beforeEach(() => {
    mock = createMockBluetooth();
  });

  afterEach(() => {
    mock.reset();
  });

  test('rapid 100-notification pump — all received', async () => {
    const device = mock.addDevice(devices.heartRate());
    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();

    const service = await btDevice.gatt!.getPrimaryService(BLE_UUIDS.services.HEART_RATE);
    const char = await service.getCharacteristic(
      BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT
    );
    await char.startNotifications();

    const received: number[] = [];
    char.addEventListener('characteristicvaluechanged', ((e: Event) => {
      received.push(((e as Event & { target: { value: DataView } }).target.value).getUint8(1));
    }) as EventListener);

    const mockChar = device.gatt
      .getService(BLE_UUIDS.services.HEART_RATE)!
      .getChar(BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT)!;

    // Pump 100 notifications
    for (let i = 0; i < 100; i++) {
      mockChar.emitNotification(new Uint8Array([0x00, 60 + (i % 40)]));
    }

    expect(received).toHaveLength(100);
    // Verify first and last values
    expect(received[0]).toBe(60);
    expect(received[99]).toBe(60 + (99 % 40));
  });

  test('notifications stop after stopNotifications()', async () => {
    const device = mock.addDevice(devices.heartRate());
    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();

    const service = await btDevice.gatt!.getPrimaryService(BLE_UUIDS.services.HEART_RATE);
    const char = await service.getCharacteristic(
      BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT
    );
    await char.startNotifications();

    const received: number[] = [];
    const listener = ((e: Event) => {
      received.push(((e as Event & { target: { value: DataView } }).target.value).getUint8(1));
    }) as EventListener;
    char.addEventListener('characteristicvaluechanged', listener);

    const mockChar = device.gatt
      .getService(BLE_UUIDS.services.HEART_RATE)!
      .getChar(BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT)!;

    // Send some notifications
    mockChar.emitNotification(new Uint8Array([0x00, 70]));
    mockChar.emitNotification(new Uint8Array([0x00, 75]));
    expect(received).toHaveLength(2);

    // Stop notifications and remove listener
    await char.stopNotifications();
    char.removeEventListener('characteristicvaluechanged', listener);

    // These should not be received
    mockChar.emitNotification(new Uint8Array([0x00, 80]));
    mockChar.emitNotification(new Uint8Array([0x00, 85]));

    expect(received).toHaveLength(2);
    expect(received).toEqual([70, 75]);
  });

  test('notifications from multiple characteristics simultaneously', async () => {
    const device = mock.addDevice(devices.full());
    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();

    // Get HR and battery characteristics
    const hrService = await btDevice.gatt!.getPrimaryService(BLE_UUIDS.services.HEART_RATE);
    const hrChar = await hrService.getCharacteristic(
      BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT
    );
    const battService = await btDevice.gatt!.getPrimaryService(BLE_UUIDS.services.BATTERY);
    const battChar = await battService.getCharacteristic(
      BLE_UUIDS.characteristics.BATTERY_LEVEL
    );

    await hrChar.startNotifications();
    await battChar.startNotifications();

    const hrReadings: number[] = [];
    const battReadings: number[] = [];

    hrChar.addEventListener('characteristicvaluechanged', ((e: Event) => {
      hrReadings.push(((e as Event & { target: { value: DataView } }).target.value).getUint8(1));
    }) as EventListener);
    battChar.addEventListener('characteristicvaluechanged', ((e: Event) => {
      battReadings.push(((e as Event & { target: { value: DataView } }).target.value).getUint8(0));
    }) as EventListener);

    const mockHrChar = device.gatt
      .getService(BLE_UUIDS.services.HEART_RATE)!
      .getChar(BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT)!;
    const mockBattChar = device.gatt
      .getService(BLE_UUIDS.services.BATTERY)!
      .getChar(BLE_UUIDS.characteristics.BATTERY_LEVEL)!;

    // Interleave notifications
    for (let i = 0; i < 20; i++) {
      mockHrChar.emitNotification(new Uint8Array([0x00, 60 + i]));
      mockBattChar.emitNotification(new Uint8Array([100 - i]));
    }

    expect(hrReadings).toHaveLength(20);
    expect(battReadings).toHaveLength(20);
    expect(hrReadings[0]).toBe(60);
    expect(hrReadings[19]).toBe(79);
    expect(battReadings[0]).toBe(100);
    expect(battReadings[19]).toBe(81);
  });

  test('disconnect stops all notifications', async () => {
    const device = mock.addDevice(devices.heartRate());
    const btDevice = device.asBluetoothDevice();
    await btDevice.gatt!.connect();

    const service = await btDevice.gatt!.getPrimaryService(BLE_UUIDS.services.HEART_RATE);
    const char = await service.getCharacteristic(
      BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT
    );
    await char.startNotifications();

    const mockChar = device.gatt
      .getService(BLE_UUIDS.services.HEART_RATE)!
      .getChar(BLE_UUIDS.characteristics.HEART_RATE_MEASUREMENT)!;

    expect(mockChar.isNotifying).toBe(true);

    device.simulateDisconnect();

    expect(mockChar.isNotifying).toBe(false);
  });
});

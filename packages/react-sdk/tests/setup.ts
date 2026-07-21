import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Add TextEncoder/TextDecoder to global
(global as { TextEncoder: typeof TextEncoder; TextDecoder: typeof TextDecoder }).TextEncoder = TextEncoder;
(global as { TextEncoder: typeof TextEncoder; TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder;

// Mock Web Bluetooth API
const mockBluetooth = {
  __beacio: true, // Marker for ExtensionDetector.isInstalled()
  getAvailability: jest.fn().mockResolvedValue(true),
  requestDevice: jest.fn(),
  getDevices: jest.fn().mockResolvedValue([]),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  requestLEScan: jest.fn()
};

// Mock BluetoothDevice
class MockBluetoothDevice {
  id = 'mock-device-id';
  name = 'Mock Device';
  gatt?: MockBluetoothRemoteGATTServer;
  watchAdvertisements = jest.fn();
  unwatchAdvertisements = jest.fn();
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
  forget = jest.fn();
}

// Mock BluetoothRemoteGATTServer
class MockBluetoothRemoteGATTServer {
  connected = false;
  device: MockBluetoothDevice;
  
  constructor(device: MockBluetoothDevice) {
    this.device = device;
  }
  
  connect = jest.fn().mockResolvedValue(this);
  disconnect = jest.fn();
  getPrimaryService = jest.fn();
  getPrimaryServices = jest.fn();
}

// Mock BluetoothRemoteGATTService
class MockBluetoothRemoteGATTService {
  uuid = 'mock-service-uuid';
  device: MockBluetoothDevice;
  isPrimary = true;
  
  constructor(device: MockBluetoothDevice) {
    this.device = device;
  }
  
  getCharacteristic = jest.fn();
  getCharacteristics = jest.fn();
  getIncludedService = jest.fn();
  getIncludedServices = jest.fn();
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
}

// Mock BluetoothRemoteGATTCharacteristic
class MockBluetoothRemoteGATTCharacteristic {
  uuid = 'mock-characteristic-uuid';
  service: MockBluetoothRemoteGATTService;
  properties = {
    broadcast: false,
    read: true,
    writeWithoutResponse: false,
    write: true,
    notify: true,
    indicate: false,
    authenticatedSignedWrites: false,
    reliableWrite: false,
    writableAuxiliaries: false
  };
  value?: DataView;
  
  constructor(service: MockBluetoothRemoteGATTService) {
    this.service = service;
  }
  
  readValue = jest.fn();
  writeValue = jest.fn();
  writeValueWithResponse = jest.fn();
  writeValueWithoutResponse = jest.fn();
  startNotifications = jest.fn().mockResolvedValue(this);
  stopNotifications = jest.fn().mockResolvedValue(this);
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
  getDescriptor = jest.fn();
  getDescriptors = jest.fn();
}

// Expose mocks globally
Object.defineProperty(global.navigator, 'bluetooth', {
  value: mockBluetooth,
  writable: true,
  configurable: true
});

(global as { BluetoothDevice: typeof MockBluetoothDevice; BluetoothRemoteGATTServer: typeof MockBluetoothRemoteGATTServer; BluetoothRemoteGATTService: typeof MockBluetoothRemoteGATTService; BluetoothRemoteGATTCharacteristic: typeof MockBluetoothRemoteGATTCharacteristic }).BluetoothDevice = MockBluetoothDevice;
(global as { BluetoothDevice: typeof MockBluetoothDevice; BluetoothRemoteGATTServer: typeof MockBluetoothRemoteGATTServer; BluetoothRemoteGATTService: typeof MockBluetoothRemoteGATTService; BluetoothRemoteGATTCharacteristic: typeof MockBluetoothRemoteGATTCharacteristic }).BluetoothRemoteGATTServer = MockBluetoothRemoteGATTServer;
(global as { BluetoothDevice: typeof MockBluetoothDevice; BluetoothRemoteGATTServer: typeof MockBluetoothRemoteGATTServer; BluetoothRemoteGATTService: typeof MockBluetoothRemoteGATTService; BluetoothRemoteGATTCharacteristic: typeof MockBluetoothRemoteGATTCharacteristic }).BluetoothRemoteGATTService = MockBluetoothRemoteGATTService;
(global as { BluetoothDevice: typeof MockBluetoothDevice; BluetoothRemoteGATTServer: typeof MockBluetoothRemoteGATTServer; BluetoothRemoteGATTService: typeof MockBluetoothRemoteGATTService; BluetoothRemoteGATTCharacteristic: typeof MockBluetoothRemoteGATTCharacteristic }).BluetoothRemoteGATTCharacteristic = MockBluetoothRemoteGATTCharacteristic;

// Keep console.log for debugging during development
// Comment out when tests are passing
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  // log: jest.fn(),  // Keep console.log active for debugging
  debug: jest.fn()
};

// Mark as secure context for Web Bluetooth
Object.defineProperty(window, 'isSecureContext', {
  value: true,
  writable: true,
  configurable: true
});

// Reset mocks before each test
beforeEach(() => {
  // Reset Bluetooth API mocks to defaults
  mockBluetooth.getAvailability.mockResolvedValue(true);
  mockBluetooth.requestDevice.mockReset();
  mockBluetooth.getDevices.mockResolvedValue([]);
  mockBluetooth.addEventListener.mockReset();
  mockBluetooth.removeEventListener.mockReset();
  mockBluetooth.requestLEScan.mockReset();
});

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});

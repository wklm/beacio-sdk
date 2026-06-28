import { createContext } from 'react';
import type { RequestDeviceOptions, Beacio, BeacioDevice, BeacioError } from '@beacio/core';
import type { ExtensionInstallState } from './ExtensionDetector';

export interface BeacioContextValue {
  isAvailable: boolean;
  isExtensionInstalled: boolean;
  extensionInstallState: ExtensionInstallState;
  isLoading: boolean;
  isScanning: boolean;
  devices: BeacioDevice[];
  error: BeacioError | null;
  core: Beacio;
  requestDevice: (options?: RequestDeviceOptions) => Promise<BeacioDevice | null>;
  getDevices: () => Promise<BeacioDevice[]>;
  requestLEScan: (options?: BluetoothLEScanOptions) => Promise<BluetoothLEScan | null>;
  stopScan: () => void;
}

export const BeacioContext = createContext<BeacioContextValue | null>(null);

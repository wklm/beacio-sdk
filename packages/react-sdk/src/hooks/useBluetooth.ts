import { useCallback, useMemo } from 'react';
import { useBeacio } from '../core/BeacioProvider';
import { BeacioError } from '@beacio/core';
import type { BeacioDevice } from '@beacio/core';
import type { UseBluetoothReturn, RequestDeviceOptions } from '../types';

/**
 * Primary hook for Web Bluetooth operations.
 *
 * Provides simplified access to Bluetooth device requesting, availability
 * checking, and extension detection. Wraps the {@link BeacioProvider}
 * context with convenience methods and automatic error handling.
 *
 * Must be used inside a {@link BeacioProvider}.
 *
 * @returns An object with availability flags, device request methods, and error state.
 *
 * @example
 * ```tsx
 * import { useBluetooth } from '@beacio/react';
 *
 * function HeartRateButton() {
 *   const { isAvailable, isSupported, requestDevice, error } = useBluetooth();
 *
 *   const handleConnect = async () => {
 *     const device = await requestDevice({
 *       filters: [{ services: ['heart_rate'] }],
 *     });
 *     if (device) {
 *       console.log('Connected to', device.name);
 *     }
 *   };
 *
 *   if (!isSupported) return <p>Bluetooth not supported</p>;
 *   if (!isAvailable) return <p>Bluetooth not available</p>;
 *
 *   return (
 *     <div>
 *       <button onClick={handleConnect}>Connect HR Monitor</button>
 *       {error && <p>Error: {error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useBluetooth(): UseBluetoothReturn {
  const context = useBeacio();
  const ble = context.core as UseBluetoothReturn['ble'];

  const isSupported = useMemo(() => ble.isSupported, [ble]);
  const backgroundSync = useMemo(() => ble.backgroundSync, [ble]);
  const peripheral = useMemo(() => ble.peripheral, [ble]);

  // Wrapper for requestDevice with simplified error handling
  const requestDevice = useCallback(async (options: RequestDeviceOptions = { acceptAllDevices: true }): Promise<BeacioDevice | null> => {
    try {
      return await context.requestDevice(options);
    } catch (error) {
      const candidate = BeacioError.from(error);
      if (candidate.code === 'USER_CANCELLED') {
        return null;
      }
      throw error;
    }
  }, [context]);

  // Wrapper for getDevices
  const getDevices = useCallback(async () => context.getDevices(), [context]);

  return {
    isAvailable: context.isAvailable,
    isExtensionInstalled: context.isExtensionInstalled,
    extensionInstallState: context.extensionInstallState,
    isSupported,
    ble,
    backgroundSync,
    peripheral,
    requestDevice,
    getDevices,
    error: context.error
  };
}

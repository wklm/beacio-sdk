import { useState, useCallback, useEffect, useRef } from 'react';
import { BeacioDevice, BeacioError, getBluetoothAPI } from '@beacio/core';
import { useBeacio } from '../core/BeacioProvider';
import type { UseScanReturn, ScanState, ScanOptions } from '../types';

/**
 * Hook for scanning for nearby Bluetooth Low Energy devices.
 *
 * Wraps the Web Bluetooth `requestLEScan` API with React-friendly state
 * management. Discovered devices are deduplicated by ID and accumulated
 * in the `devices` array as `BeacioDevice` instances. The scan is
 * automatically stopped on unmount.
 *
 * Must be used inside a {@link BeacioProvider}.
 *
 * @returns Scan state, discovered devices (as BeacioDevice[]), and control methods.
 */
export function useScan(): UseScanReturn {
  const { requestLEScan, stopScan: contextStopScan } = useBeacio();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [devices, setDevices] = useState<BeacioDevice[]>([]);
  const [error, setError] = useState<BeacioError | null>(null);
  const scanRef = useRef<BluetoothLEScan | null>(null);
  const deviceMapRef = useRef<Map<string, BeacioDevice>>(new Map());

  const handleAdvertisement = useCallback((event: Event) => {
    const adEvent = event as BluetoothAdvertisingEvent;
    const rawDevice = adEvent.device;
    if (!rawDevice) return;

    let wrappedDevice = deviceMapRef.current.get(rawDevice.id);
    if (!wrappedDevice) {
      wrappedDevice = new BeacioDevice(rawDevice);
      deviceMapRef.current.set(rawDevice.id, wrappedDevice);
      setDevices(Array.from(deviceMapRef.current.values()));
    }
  }, []);

  const start = useCallback(async (options?: ScanOptions): Promise<void> => {
    // Don't start if already scanning
    if (scanState === 'scanning') {
      return;
    }

    try {
      setError(null);
      setScanState('scanning');

      deviceMapRef.current.clear();
      setDevices([]);

      const scan = await requestLEScan(options || {});
      if (scan) {
        scanRef.current = scan;

        const bluetooth = getBluetoothAPI();
        bluetooth?.addEventListener?.('advertisementreceived', handleAdvertisement);
      } else {
        setScanState('idle');
      }
    } catch (err) {
      setError(BeacioError.from(err));
      setScanState('idle');
    }
  }, [scanState, requestLEScan, handleAdvertisement]);

  const stop = useCallback((): void => {
    if (scanRef.current?.active) {
      scanRef.current.stop();
    }

    const bluetooth = getBluetoothAPI();
    bluetooth?.removeEventListener?.('advertisementreceived', handleAdvertisement);

    contextStopScan();
    setScanState('stopped');
    scanRef.current = null;
  }, [contextStopScan, handleAdvertisement]);

  const clear = useCallback((): void => {
    setDevices([]);
    deviceMapRef.current.clear();
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scanRef.current?.active) {
        scanRef.current.stop();
      }
      const bluetooth = getBluetoothAPI();
      bluetooth?.removeEventListener?.('advertisementreceived', handleAdvertisement);
    };
  }, [handleAdvertisement]);

  return {
    scanState,
    devices,
    start,
    stop,
    clear,
    error
  };
}

import React, { useContext, useEffect, useState, useCallback, useMemo, ReactNode, useRef } from 'react';
import { Beacio, BeacioDevice, BeacioError, BEACIO_EVENTS } from '@beacio/core';
import type { RequestDeviceOptions } from '@beacio/core';
import { ExtensionDetector } from './ExtensionDetector';
import type { BeacioConfig } from '../types';
import { BeacioContext, type BeacioContextValue } from './BeacioContext';

function reportBLEEvent(apiKey: string | undefined, event: string) {
  if (!apiKey) return;
  import('@beacio/core/detect').then(m => m.reportEvent(apiKey, event)).catch(() => {});
}

interface BeacioProviderProps {
  children: ReactNode;
  config?: BeacioConfig;
  ble?: Beacio;
}

/**
 * Context provider that initialises the Beacio client and makes Bluetooth
 * state and methods available to all descendant components via
 * {@link useBeacio} and the convenience hooks (`useBluetooth`, `useDevice`,
 * `useScan`, `useProfile`).
 *
 * Place this near the root of your application. It handles:
 * - Bluetooth availability detection
 * - Safari Web Extension detection (via `beacio:extension:ready` event)
 * - Optional iOS install prompt (when `apiKey` is provided and `@beacio/core/detect` is installed)
 * - Core Beacio instance creation and delegation
 *
 * @param props.children - React children to render inside the provider.
 * @param props.config - Optional configuration (auto-connect, retry, API key, etc.).
 *
 * @example
 * ```tsx
 * import { BeacioProvider } from '@beacio/react';
 *
 * function App() {
 *   return (
 *     <BeacioProvider config={{ retryAttempts: 3 }}>
 *       <MyBluetoothApp />
 *     </BeacioProvider>
 *   );
 * }
 * ```
 */
export function BeacioProvider({ children, config, ble }: BeacioProviderProps) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isExtensionInstalled, setIsExtensionInstalled] = useState(false);
  const [extensionInstallState, setExtensionInstallState] = useState<'not-installed' | 'installed-inactive' | 'active'>('not-installed');
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<BeacioDevice[]>([]);
  const [error, setError] = useState<BeacioError | null>(null);
  const [currentScan, setCurrentScan] = useState<BluetoothLEScan | null>(null);
  const deviceMapRef = useRef<Map<string, BeacioDevice>>(new Map());

  const coreInstance = useMemo(() => ble ?? new Beacio(), [ble]);
  const detector = useMemo(() => new ExtensionDetector(), []);

  const cacheDevice = useCallback((device: BeacioDevice): BeacioDevice => {
    const existing = deviceMapRef.current.get(device.id);
    if (existing) {
      return existing;
    }

    deviceMapRef.current.set(device.id, device);
    return device;
  }, []);

  const syncDevices = useCallback((nextDevices: BeacioDevice[]) => {
    const cachedDevices = nextDevices.map(cacheDevice);
    setDevices(cachedDevices);
    return cachedDevices;
  }, [cacheDevice]);

  useEffect(() => {
    const checkAvailability = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const available = await coreInstance.getAvailability();
        setIsAvailable(available);
      } catch (err) {
        setError(BeacioError.from(err));
        setIsAvailable(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAvailability();
  }, [coreInstance]);

  useEffect(() => {
    const handleExtensionReady = () => {
      setExtensionInstallState('active');
      setIsExtensionInstalled(true);
    };

    // Check if extension is already installed
    const currentInstallState = detector.getInstallState();
    setExtensionInstallState(currentInstallState);
    setIsExtensionInstalled(currentInstallState !== 'not-installed');

    // Listen for extension ready event
    window.addEventListener(BEACIO_EVENTS.EXTENSION_READY, handleExtensionReady);

    return () => {
      window.removeEventListener(BEACIO_EVENTS.EXTENSION_READY, handleExtensionReady);
    };
  }, [detector]);

  useEffect(() => {
    if (!config?.apiKey) return;
    if (isExtensionInstalled) return;

    let cancelled = false;
    (async () => {
      try {
        const detect = await import('@beacio/core/detect');
        if (cancelled) return;
        await detect.initBeacio({
          key: config?.apiKey ?? '',
          operatorName: config.operatorName,
          banner: config.startOnboardingUrl || config.appStoreUrl
            ? { startOnboardingUrl: config.startOnboardingUrl, appStoreUrl: config.appStoreUrl }
            : undefined,
          onReady: () => {
            setExtensionInstallState('active');
            setIsExtensionInstalled(true);
          },
          onInstalledInactive: () => {
            setExtensionInstallState('installed-inactive');
            setIsExtensionInstalled(true);
          },
          onNotInstalled: () => {
            setExtensionInstallState('not-installed');
            setIsExtensionInstalled(false);
          },
        });
      } catch {
        // @beacio/core/detect not installed -- silent fallback
      }
    })();

    return () => { cancelled = true; };
  }, [config?.apiKey, config?.operatorName, config?.startOnboardingUrl, config?.appStoreUrl]);

  const requestDevice = useCallback(async (options: RequestDeviceOptions = { acceptAllDevices: true }) => {
    try {
      setError(null);
      reportBLEEvent(config?.apiKey, 'ble_request');
      const device = cacheDevice(await coreInstance.requestDevice(options));
      setDevices((prev) => prev.some((current) => current.id === device.id) ? prev : [...prev, device]);
      return device;
    } catch (err) {
      const beacioError = BeacioError.from(err);
      const isUserCancellation = beacioError.code === 'USER_CANCELLED'
        || (err instanceof Error && err.name === 'NotFoundError');
      if (!isUserCancellation) {
        setError(beacioError);
      }
      return null;
    }
  }, [cacheDevice, config?.apiKey, coreInstance]);

  const getDevices = useCallback(async () => {
    try {
      setError(null);
      return syncDevices(await coreInstance.getDevices());
    } catch (err) {
      setError(BeacioError.from(err));
      return devices;
    }
  }, [cacheDevice, devices, syncDevices]);

  const requestLEScan = useCallback(async (options: BluetoothLEScanOptions = { acceptAllAdvertisements: true }) => {
    try {
      setError(null);

      if (currentScan?.active) {
        currentScan.stop();
      }

      const scan = await (coreInstance as Beacio & {
        requestLEScan?: (options?: BluetoothLEScanOptions) => Promise<BluetoothLEScan | null>;
      }).requestLEScan?.(options) ?? null;
      if (scan) {
        setCurrentScan(scan);
        setIsScanning(true);
      }
      return scan;
    } catch (err) {
      setError(BeacioError.from(err));
      return null;
    }
  }, [coreInstance, currentScan]);

  const stopScan = useCallback(() => {
    if (currentScan?.active) {
      currentScan.stop();
    }
    setCurrentScan(null);
    setIsScanning(false);
  }, [currentScan]);

  const contextValue = useMemo<BeacioContextValue>(() => ({
    isAvailable,
    isExtensionInstalled,
    extensionInstallState,
    isLoading,
    isScanning,
    devices,
    error,
    core: coreInstance,
    requestDevice,
    getDevices,
    requestLEScan,
    stopScan,
  }), [
    isAvailable,
    isExtensionInstalled,
    extensionInstallState,
    isLoading,
    isScanning,
    devices,
    error,
    coreInstance,
    requestDevice,
    getDevices,
    requestLEScan,
    stopScan,
  ]);

  return (
    <BeacioContext.Provider value={contextValue}>
      {children}
    </BeacioContext.Provider>
  );
}

/**
 * Hook to access the {@link BeacioProvider} context directly.
 *
 * Returns the full context value including availability state, device list,
 * scanning state, and all Bluetooth methods. Throws if used outside a
 * {@link BeacioProvider}.
 *
 * @returns The full Beacio context value.
 * @throws Error if called outside a {@link BeacioProvider}.
 */
export function useBeacio() {
  const context = useContext(BeacioContext);

  if (!context) {
    throw new Error('useBeacio must be used within a BeacioProvider');
  }

  return context;
}

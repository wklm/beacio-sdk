import { useState, useCallback, useEffect, useRef } from 'react';
import { BeacioError } from '@beacio/core';
import type {
  BackgroundConnectionOptions,
  BackgroundRegistration,
  BeaconScanningOptions,
  CharacteristicNotificationOptions,
  NotificationPermissionState,
  NotificationTemplate,
  BeacioBackgroundSync,
} from '@beacio/core';
import { useBeacio } from '../core/BeacioProvider';
import type { UseBackgroundSyncOptions, UseBackgroundSyncReturn } from '../types';

const UNSUPPORTED_ERROR = new BeacioError(
  'GATT_OPERATION_FAILED',
  'Background sync is not supported on this platform.',
);

export function useBackgroundSync(
  options: UseBackgroundSyncOptions = {},
): UseBackgroundSyncReturn {
  const context = useBeacio();
  const sync = context.core.backgroundSync;
  const autoFetch = options.autoFetch ?? false;

  const [permissionState, setPermissionState] = useState<NotificationPermissionState | null>(null);
  const [registrations, setRegistrations] = useState<BackgroundRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<BeacioError | null>(null);

  const mountedRef = useRef(true);
  const syncRef = useRef<BeacioBackgroundSync>(sync);

  const isSupported = context.core.isSupported && context.core.platform === 'safari-extension';

  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // autoFetch: fetch registrations on mount
  useEffect(() => {
    if (!autoFetch || !isSupported) return;

    let cancelled = false;

    const fetchRegistrations = async () => {
      try {
        const result = await syncRef.current.getRegistrations();
        if (!cancelled && mountedRef.current) {
          setRegistrations(result);
        }
      } catch {
        // Silently ignore fetch errors on mount
      }
    };

    void fetchRegistrations();

    return () => {
      cancelled = true;
    };
  }, [autoFetch, isSupported]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPermissionState | null> => {
    if (!isSupported) {
      if (mountedRef.current) setError(UNSUPPORTED_ERROR);
      return null;
    }

    if (mountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const state = await syncRef.current.requestPermission();
      if (mountedRef.current) {
        setPermissionState(state);
        setIsLoading(false);
      }
      return state;
    } catch (err) {
      if (mountedRef.current) {
        setError(BeacioError.from(err));
        setIsLoading(false);
      }
      return null;
    }
  }, [isSupported]);

  const requestBackgroundConnection = useCallback(async (
    connectionOptions: BackgroundConnectionOptions,
  ): Promise<BackgroundRegistration | null> => {
    if (!isSupported) {
      if (mountedRef.current) setError(UNSUPPORTED_ERROR);
      return null;
    }

    if (mountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const registration = await syncRef.current.requestBackgroundConnection(connectionOptions);
      if (mountedRef.current) {
        setRegistrations(prev => [...prev, registration]);
        setIsLoading(false);
      }
      return registration;
    } catch (err) {
      if (mountedRef.current) {
        setError(BeacioError.from(err));
        setIsLoading(false);
      }
      return null;
    }
  }, [isSupported]);

  const registerCharacteristicNotifications = useCallback(async (
    notificationOptions: CharacteristicNotificationOptions,
  ): Promise<BackgroundRegistration | null> => {
    if (!isSupported) {
      if (mountedRef.current) setError(UNSUPPORTED_ERROR);
      return null;
    }

    if (mountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const registration = await syncRef.current.registerCharacteristicNotifications(notificationOptions);
      if (mountedRef.current) {
        setRegistrations(prev => [...prev, registration]);
        setIsLoading(false);
      }
      return registration;
    } catch (err) {
      if (mountedRef.current) {
        setError(BeacioError.from(err));
        setIsLoading(false);
      }
      return null;
    }
  }, [isSupported]);

  const registerBeaconScanning = useCallback(async (
    scanOptions: BeaconScanningOptions,
  ): Promise<BackgroundRegistration | null> => {
    if (!isSupported) {
      if (mountedRef.current) setError(UNSUPPORTED_ERROR);
      return null;
    }

    if (mountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const registration = await syncRef.current.registerBeaconScanning(scanOptions);
      if (mountedRef.current) {
        setRegistrations(prev => [...prev, registration]);
        setIsLoading(false);
      }
      return registration;
    } catch (err) {
      if (mountedRef.current) {
        setError(BeacioError.from(err));
        setIsLoading(false);
      }
      return null;
    }
  }, [isSupported]);

  const list = useCallback(async (): Promise<BackgroundRegistration[]> => {
    if (!isSupported) {
      if (mountedRef.current) setError(UNSUPPORTED_ERROR);
      return [];
    }

    if (mountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const result = await syncRef.current.getRegistrations();
      if (mountedRef.current) {
        setRegistrations(result);
        setIsLoading(false);
      }
      return result;
    } catch (err) {
      if (mountedRef.current) {
        setError(BeacioError.from(err));
        setIsLoading(false);
      }
      return [];
    }
  }, [isSupported]);

  const unregister = useCallback(async (registrationId: string): Promise<void> => {
    if (!isSupported) {
      if (mountedRef.current) setError(UNSUPPORTED_ERROR);
      return;
    }

    if (mountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      await syncRef.current.unregister(registrationId);
      if (mountedRef.current) {
        setRegistrations(prev => prev.filter(r => r.id !== registrationId));
        setIsLoading(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(BeacioError.from(err));
        setIsLoading(false);
      }
    }
  }, [isSupported]);

  const update = useCallback(async (
    registrationId: string,
    template: Partial<NotificationTemplate>,
  ): Promise<void> => {
    if (!isSupported) {
      if (mountedRef.current) setError(UNSUPPORTED_ERROR);
      return;
    }

    if (mountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      await syncRef.current.update(registrationId, template);
      if (mountedRef.current) {
        setIsLoading(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(BeacioError.from(err));
        setIsLoading(false);
      }
    }
  }, [isSupported]);

  return {
    permissionState,
    registrations,
    isLoading,
    error,
    isSupported,
    requestPermission,
    requestBackgroundConnection,
    registerCharacteristicNotifications,
    registerBeaconScanning,
    list,
    unregister,
    update,
    clearError,
  };
}

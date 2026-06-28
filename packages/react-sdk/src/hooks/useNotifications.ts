import { useState, useCallback, useEffect, useRef } from 'react';
import { BeacioError } from '@beacio/core';
import type { BeacioDevice } from '@beacio/core';
import type { UseNotificationsReturn, NotificationEntry } from '../types';

export interface NotificationOptions {
  autoSubscribe?: boolean;
  maxHistory?: number;
}

/**
 * Hook for subscribing to GATT characteristic notifications.
 *
 * Delegates to {@link BeacioDevice.subscribeAsync} for notification lifecycle
 * management. Maintains a rolling history of received values.
 *
 * @param device - The connected {@link BeacioDevice}, or `null`.
 * @param service - Human-readable service name or UUID (e.g. `'heart_rate'`).
 * @param characteristic - Human-readable characteristic name or UUID.
 * @param options - Optional configuration.
 *
 * @example
 * ```tsx
 * const { value, history, subscribe, unsubscribe } = useNotifications(
 *   device,
 *   'heart_rate',
 *   'heart_rate_measurement',
 *   { autoSubscribe: true },
 * );
 * ```
 */
export function useNotifications(
  device: BeacioDevice | null,
  service: string,
  characteristic: string,
  options?: NotificationOptions
): UseNotificationsReturn {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [value, setValue] = useState<DataView | null>(null);
  const [history, setHistory] = useState<NotificationEntry[]>([]);
  const [error, setError] = useState<BeacioError | null>(null);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isSubscribedRef = useRef(false);
  const maxHistory = options?.maxHistory ?? 100;
  const autoSubscribe = options?.autoSubscribe ?? false;

  const callback = useCallback((newValue: DataView) => {
    setValue(newValue);
    setHistory(prev => {
      const entry: NotificationEntry = { timestamp: new Date(), value: newValue };
      const updated = [...prev, entry];
      return updated.length > maxHistory ? updated.slice(-maxHistory) : updated;
    });
  }, [maxHistory]);

  const subscribe = useCallback(async (): Promise<void> => {
    if (isSubscribedRef.current) return;

    if (!device || !device.connected) {
      setError(new BeacioError('INVALID_PARAMETER', 'Device not available or not connected'));
      return;
    }

    try {
      setError(null);
      unsubscribeRef.current?.();
      const unsub = await device.subscribeAsync(service, characteristic, callback);
      unsubscribeRef.current = unsub;
      isSubscribedRef.current = true;
      setIsSubscribed(true);
    } catch (err) {
      setError(BeacioError.from(err));
      isSubscribedRef.current = false;
      setIsSubscribed(false);
    }
  }, [device, service, characteristic, callback]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!isSubscribedRef.current) return;

    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    isSubscribedRef.current = false;
    setIsSubscribed(false);
  }, []);

  const clear = useCallback((): void => {
    setHistory([]);
    setValue(null);
  }, []);

  // Reset on target change
  useEffect(() => {
    isSubscribedRef.current = false;
    setIsSubscribed(false);
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;

    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      isSubscribedRef.current = false;
    };
  }, [device, service, characteristic]);

  // Auto-subscribe when device is connected and option is set
  useEffect(() => {
    if (autoSubscribe && device?.connected && !isSubscribedRef.current) {
      void subscribe();
    }
  }, [autoSubscribe, device, subscribe]);

  return {
    isSubscribed,
    value,
    history,
    subscribe,
    unsubscribe,
    clear,
    error
  };
}

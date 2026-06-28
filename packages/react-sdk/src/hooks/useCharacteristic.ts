import { useState, useCallback, useEffect, useRef } from 'react';
import { BeacioError } from '@beacio/core';
import type { BeacioDevice } from '@beacio/core';
import type { UseCharacteristicReturn, NotificationHandler } from '../types';

/**
 * Hook for reading, writing, and subscribing to a BLE characteristic.
 *
 * Delegates all BLE operations to the core SDK's `device.read()`,
 * `device.write()`, and `device.subscribeAsync()`. Does not resolve
 * raw GATT objects — use `device.raw.gatt` for escape-hatch access.
 *
 * @param device - The connected {@link BeacioDevice}, or `null`.
 * @param serviceUUID - Service UUID (name or full UUID).
 * @param characteristicUUID - Characteristic UUID (name or full UUID).
 */
export function useCharacteristic(
  device?: BeacioDevice | null,
  serviceUUID?: string | null,
  characteristicUUID?: string | null,
): UseCharacteristicReturn {
  const [value, setValue] = useState<DataView | null>(null);
  const [error, setError] = useState<BeacioError | null>(null);
  const [isNotifying, setIsNotifying] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const notificationHandlerRef = useRef<NotificationHandler | null>(null);

  const hasTarget = Boolean(device && serviceUUID && characteristicUUID && device.connected);

  // Clean up subscription when target changes or unmounts
  useEffect(() => {
    if (!hasTarget) {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      notificationHandlerRef.current = null;
      setIsNotifying(false);
    }
  }, [hasTarget]);

  useEffect(() => () => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  const requireTarget = useCallback(() => {
    if (!device || !serviceUUID || !characteristicUUID) {
      throw new BeacioError('INVALID_PARAMETER', 'No characteristic target available');
    }
    return { device, serviceUUID, characteristicUUID };
  }, [device, serviceUUID, characteristicUUID]);

  const read = useCallback(async (): Promise<DataView | null> => {
    try {
      setError(null);
      const { device: d, serviceUUID: s, characteristicUUID: c } = requireTarget();
      const nextValue = await d.read(s, c);
      setValue(nextValue);
      return nextValue;
    } catch (err) {
      setError(BeacioError.from(err));
      return null;
    }
  }, [requireTarget]);

  const write = useCallback(async (nextValue: BufferSource): Promise<void> => {
    try {
      setError(null);
      const { device: d, serviceUUID: s, characteristicUUID: c } = requireTarget();
      await d.write(s, c, nextValue);
    } catch (err) {
      setError(BeacioError.from(err));
    }
  }, [requireTarget]);

  const writeWithoutResponse = useCallback(async (nextValue: BufferSource): Promise<void> => {
    try {
      setError(null);
      const { device: d, serviceUUID: s, characteristicUUID: c } = requireTarget();
      await d.writeWithoutResponse(s, c, nextValue);
    } catch (err) {
      setError(BeacioError.from(err));
    }
  }, [requireTarget]);

  const subscribe = useCallback(async (handler: NotificationHandler): Promise<void> => {
    try {
      setError(null);
      const { device: d, serviceUUID: s, characteristicUUID: c } = requireTarget();

      unsubscribeRef.current?.();
      notificationHandlerRef.current = handler;

      const unsub = await d.subscribeAsync(s, c, (nextValue: DataView) => {
        setValue(nextValue);
        notificationHandlerRef.current?.(nextValue);
      });

      unsubscribeRef.current = unsub;
      setIsNotifying(true);
    } catch (err) {
      setError(BeacioError.from(err));
      setIsNotifying(false);
    }
  }, [requireTarget]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    notificationHandlerRef.current = null;
    setIsNotifying(false);
  }, []);

  return {
    device: device ?? null,
    serviceUUID: serviceUUID ?? null,
    characteristicUUID: characteristicUUID ?? null,
    value,
    read,
    write,
    writeWithoutResponse,
    subscribe,
    unsubscribe,
    isNotifying,
    error,
  };
}

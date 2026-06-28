import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { BeacioError } from '@beacio/core';
import type { BeacioDevice } from '@beacio/core';
import { useBluetooth } from './useBluetooth';
import { useDevice } from './useDevice';
import type {
  UseConnectionOptions,
  UseConnectionReturn,
  ConnectionStatus,
  ConnectionOptions,
  BluetoothAdvertisingEvent,
} from '../types';

/**
 * All-in-one hook for single-device Bluetooth connections.
 *
 * Composes {@link useBluetooth} (device requesting) and {@link useDevice}
 * (connection lifecycle) into one call. Covers the full flow from device
 * picker to connected GATT session with a single `connect()` trigger.
 *
 * For multi-device scenarios use `useBluetooth()` + `useDevice()` directly.
 *
 * @param options - Scan filters, optional services, and reconnect configuration.
 *
 * @example
 * ```tsx
 * import { useConnection } from '@beacio/react';
 *
 * function HeartRatePanel() {
 *   const { device, status, isConnected, connect, disconnect, error } =
 *     useConnection({
 *       filters: [{ services: ['heart_rate'] }],
 *       autoReconnect: true,
 *     });
 *
 *   return (
 *     <div>
 *       <button onClick={connect} disabled={status === 'requesting' || status === 'connecting'}>
 *         {status === 'idle' ? 'Connect' : status}
 *       </button>
 *       {isConnected && <p>Connected to {device?.name}</p>}
 *       {error && <p>Error: {error.message}</p>}
 *       {isConnected && <button onClick={disconnect}>Disconnect</button>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useConnection(options: UseConnectionOptions = {}): UseConnectionReturn {
  const { requestDevice } = useBluetooth();
  const [selectedDevice, setSelectedDevice] = useState<BeacioDevice | null>(null);
  // AIDEV-NOTE: 'requesting' is a local-only status covering the browser device picker
  // dialog period. It is not part of useDevice's ConnectionState.
  const [isRequesting, setIsRequesting] = useState(false);

  // Derive ConnectionOptions from UseConnectionOptions for useDevice
  const connectionOptions = useMemo((): ConnectionOptions | undefined => {
    if (options.autoReconnect === undefined) return undefined;

    if (typeof options.autoReconnect === 'boolean') {
      return { autoReconnect: options.autoReconnect };
    }

    // AutoReconnectOptions object — map fields to ConnectionOptions
    const reconnect = options.autoReconnect;
    return {
      autoReconnect: true,
      reconnectAttempts: reconnect.maxAttempts,
      reconnectDelay: reconnect.initialDelay,
      reconnectBackoffMultiplier: reconnect.backoffMultiplier,
    };
  }, [options.autoReconnect]);

  const {
    connectionState,
    isConnected,
    services,
    error: deviceError,
    connect: deviceConnect,
    disconnect: deviceDisconnect,
  } = useDevice(selectedDevice, connectionOptions);
  const pendingConnectResolveRef = useRef<(() => void) | null>(null);
  const pendingConnectAfterSelectionRef = useRef(false);

  // Composite status: local requesting state takes priority, then useDevice state
  const status: ConnectionStatus = useMemo(() => {
    if (isRequesting) return 'requesting';
    if (!selectedDevice) return 'idle';
    switch (connectionState) {
      case 'connecting': return 'connecting';
      case 'connected': return 'connected';
      case 'disconnected': return 'disconnected';
      case 'disconnecting': return 'disconnected';
      default: return 'idle';
    }
  }, [isRequesting, selectedDevice, connectionState]);

  const [error, setError] = useState<BeacioError | null>(null);

  // Expose the most recent error from either the request phase or useDevice
  const activeError = error ?? deviceError;

  // --- Live RSSI monitoring (opt-in) ----------------------------------------
  // Reuses the device's watchAdvertisements() + the `advertisementreceived`
  // event (which carries rssi), mirroring useScan's listener pattern. The
  // monitored device + handler are tracked in a ref so teardown always targets
  // the right device even after `selectedDevice` is cleared on disconnect.
  const [rssi, setRssi] = useState<number | null>(null);
  const rssiMonitorRef = useRef<{ device: BeacioDevice; handler: EventListener } | null>(null);
  // Cancellation token for an in-flight startRssiMonitoring(). Armed BEFORE the
  // watchAdvertisements() await so stopRssiMonitoring() can cancel a pending
  // start WITHOUT calling unwatchAdvertisements() against a watch whose
  // [[watchAdvertisementsState]] is still 'pending-watch' (spec-undefined
  // ordering; see Web Bluetooth §5.2 BluetoothDevice.watchAdvertisements()).
  const rssiStartTokenRef = useRef<{ cancelled: boolean } | null>(null);

  const stopRssiMonitoring = useCallback((): void => {
    // Cancel any in-flight start so its post-await path skips listener attach
    // and (if the watch already resolved) unwatches the scan it just started.
    const token = rssiStartTokenRef.current;
    if (token) {
      token.cancelled = true;
      rssiStartTokenRef.current = null;
    }
    const active = rssiMonitorRef.current;
    if (active) {
      (active.device.raw as unknown as EventTarget).removeEventListener('advertisementreceived', active.handler);
      void active.device.unwatchAdvertisements();
      rssiMonitorRef.current = null;
    }
    setRssi(null);
  }, []);

  const startRssiMonitoring = useCallback(async (): Promise<void> => {
    const device = selectedDevice;
    if (!device || rssiMonitorRef.current || rssiStartTokenRef.current) {
      return;
    }
    // Per Web Bluetooth §5.2 BluetoothDevice.watchAdvertisements(), the UA sets
    // [[watchAdvertisementsState]] to 'pending-watch' before the scan actually
    // starts, and may reject (NotSupportedError when "the UA doesn't support
    // scanning for advertisements", UnknownError, AbortError via signal, …).
    // We therefore:
    //   1. arm a cancellation token BEFORE the await so teardown can abort a
    //      pending start without calling unwatchAdvertisements() against an
    //      in-flight watch (spec-undefined ordering while state is 'pending-watch');
    //   2. attach the listener + record the ref ONLY after the await resolves
    //      and we are still active, so a rejection never wedges the ref or
    //      leaves a dangling listener;
    //   3. on rejection, surface the error via the hook's error state and clear
    //      the token so a retry is not a no-op.
    const token = { cancelled: false };
    rssiStartTokenRef.current = token;
    try {
      await device.watchAdvertisements();
    } catch (err) {
      if (rssiStartTokenRef.current === token) {
        rssiStartTokenRef.current = null;
      }
      if (token.cancelled) {
        // Teardown already ran while the watch was in-flight; the rejection is
        // expected — do not surface it or overwrite a cleared state.
        return;
      }
      setError(BeacioError.from(err));
      return;
    }
    if (token.cancelled) {
      // Teardown raced ahead of the await: the scan just started, but the hook
      // is no longer interested. Stop the scan we just armed so it doesn't leak.
      if (rssiStartTokenRef.current === token) {
        rssiStartTokenRef.current = null;
      }
      void device.unwatchAdvertisements();
      return;
    }
    if (rssiStartTokenRef.current === token) {
      rssiStartTokenRef.current = null;
    }
    const handler: EventListener = (event) => {
      setRssi((event as unknown as BluetoothAdvertisingEvent).rssi);
    };
    rssiMonitorRef.current = { device, handler };
    (device.raw as unknown as EventTarget).addEventListener('advertisementreceived', handler);
  }, [selectedDevice]);

  // Auto start/stop while connected when monitorRssi is enabled.
  useEffect(() => {
    if (!options.monitorRssi) {
      return undefined;
    }
    if (isConnected && selectedDevice) {
      void startRssiMonitoring();
    }
    return () => {
      stopRssiMonitoring();
    };
  }, [options.monitorRssi, isConnected, selectedDevice, startRssiMonitoring, stopRssiMonitoring]);

  // Stop any still-running monitoring on unmount (covers the manual-start path
  // when monitorRssi is not set).
  useEffect(() => () => { stopRssiMonitoring(); }, [stopRssiMonitoring]);

  useEffect(() => {
    if (!selectedDevice || !pendingConnectAfterSelectionRef.current) {
      return;
    }

    pendingConnectAfterSelectionRef.current = false;
    let isCancelled = false;

    const finishPendingConnect = () => {
      if (isCancelled) {
        return;
      }

      pendingConnectResolveRef.current?.();
      pendingConnectResolveRef.current = null;
    };

    void (async () => {
      try {
        await deviceConnect();
      } finally {
        finishPendingConnect();
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [deviceConnect, selectedDevice]);

  useEffect(() => () => {
    pendingConnectAfterSelectionRef.current = false;
    pendingConnectResolveRef.current?.();
    pendingConnectResolveRef.current = null;
  }, []);

  const connect = useCallback(async () => {
    if (isRequesting) {
      return;
    }

    if (selectedDevice) {
      setError(null);
      await deviceConnect();
      return;
    }

    try {
      setError(null);
      setIsRequesting(true);

      const device = await requestDevice({
        filters: options.filters,
        optionalServices: options.optionalServices,
        acceptAllDevices: options.acceptAllDevices ?? (!options.filters?.length),
      });

      if (!device) {
        return;
      }

      await new Promise<void>((resolve) => {
        pendingConnectResolveRef.current = resolve;
        pendingConnectAfterSelectionRef.current = true;
        setSelectedDevice(device);
      });
    } catch (err) {
      const candidate = BeacioError.from(err);
      if (candidate.code !== 'USER_CANCELLED') {
        setError(candidate);
      }
    } finally {
      setIsRequesting(false);
    }
  }, [
    deviceConnect,
    isRequesting,
    options.acceptAllDevices,
    options.filters,
    options.optionalServices,
    requestDevice,
    selectedDevice,
  ]);

  const disconnect = useCallback(() => {
    stopRssiMonitoring();
    deviceDisconnect();
    setSelectedDevice(null);
    setError(null);
  }, [deviceDisconnect, stopRssiMonitoring]);

  return {
    device: selectedDevice,
    status,
    isConnected,
    connect,
    disconnect,
    services,
    error: activeError,
    rssi,
    startRssiMonitoring,
    stopRssiMonitoring,
  };
}

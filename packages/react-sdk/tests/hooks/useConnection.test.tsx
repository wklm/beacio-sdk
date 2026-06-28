import { renderHook, act, waitFor } from '@testing-library/react';
import { BeacioError } from '@beacio/core';
import { useConnection } from '../../src/hooks/useConnection';
import { useBluetooth } from '../../src/hooks/useBluetooth';
import { useDevice } from '../../src/hooks/useDevice';

jest.mock('../../src/hooks/useBluetooth');
jest.mock('../../src/hooks/useDevice');

const mockUseBluetooth = useBluetooth as jest.MockedFunction<typeof useBluetooth>;
const mockUseDevice = useDevice as jest.MockedFunction<typeof useDevice>;

function createDevice(id = 'device-1') {
  return {
    id,
    name: `Device ${id}`,
  } as any;
}

// RSSI-02: shared connection-state backing the deferred useDevice mock. In real
// `useDevice`, `isConnected` flips to true only AFTER `await device.connect()`
// resolves (setConnectionState('connected') post-await, §6 GATT Interaction).
// The previous mock returned `isConnected: Boolean(device)` — true synchronously
// on `setSelectedDevice(device)`, BEFORE `deviceConnect()` resolved — which armed
// the RSSI auto-start effect at the wrong phase and masked race regressions
// (false-green). Reset in beforeEach; flipped by mockDeviceConnect / -Disconnect.
let mockConnected = false;

describe('useConnection', () => {
  const mockRequestDevice = jest.fn();
  const mockDeviceConnect = jest.fn();
  const mockDeviceDisconnect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnected = false;

    mockUseBluetooth.mockReturnValue({
      isAvailable: true,
      isExtensionInstalled: false,
      extensionInstallState: 'not-installed',
      isSupported: true,
      ble: {} as any,
      backgroundSync: {} as any,
      peripheral: {} as any,
      requestDevice: mockRequestDevice,
      getDevices: jest.fn(),
      error: null,
    });

    // Deferred isConnected: false until mockDeviceConnect() resolves, then true.
    // Mirrors production useDevice timing so the auto-start RSSI effect arms at
    // the same phase (post-GATT-connect) as it would in real code.
    mockUseDevice.mockImplementation((device) => ({
      device,
      connectionState: (mockConnected ? 'connected' : 'disconnected') as any,
      isConnected: mockConnected && device != null,
      isConnecting: false,
      services: [],
      error: null,
      connect: mockDeviceConnect,
      disconnect: mockDeviceDisconnect,
      autoReconnect: false,
      setAutoReconnect: jest.fn(),
      reconnectAttempt: 0,
    }));
    mockDeviceConnect.mockImplementation(async () => { mockConnected = true; });
    mockDeviceDisconnect.mockImplementation(() => { mockConnected = false; });
  });

  it('requests a device and then connects through useDevice', async () => {
    const selectedDevice = createDevice();
    mockRequestDevice.mockResolvedValue(selectedDevice);

    const { result } = renderHook(() => useConnection({ filters: [{ services: ['heart_rate'] }] }));

    let connectPromise: Promise<void>;
    act(() => {
      connectPromise = result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.device).toBe(selectedDevice);
    });

    await act(async () => {
      await connectPromise!;
    });

    expect(mockRequestDevice).toHaveBeenCalledWith({
      filters: [{ services: ['heart_rate'] }],
      optionalServices: undefined,
      acceptAllDevices: false,
    });
    expect(mockDeviceConnect).toHaveBeenCalledTimes(1);
  });

  it('reuses useDevice.connect for an already selected device', async () => {
    const selectedDevice = createDevice();
    mockRequestDevice.mockResolvedValue(selectedDevice);

    const { result } = renderHook(() => useConnection());

    let initialConnectPromise: Promise<void>;
    act(() => {
      initialConnectPromise = result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.device).toBe(selectedDevice);
    });

    await act(async () => {
      await initialConnectPromise!;
    });

    expect(mockRequestDevice).toHaveBeenCalledTimes(1);
    expect(mockDeviceConnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.connect();
    });

    expect(mockRequestDevice).toHaveBeenCalledTimes(1);
    expect(mockDeviceConnect).toHaveBeenCalledTimes(2);
  });

  it('maps useDevice state into connected status and services', async () => {
    const selectedDevice = createDevice();
    mockRequestDevice.mockResolvedValue(selectedDevice);
    // RSSI-02: deferred timing (reads mockConnected) + services override. The
    // default mock returns services: [], so this test overrides services while
    // keeping the production-faithful isConnected phase.
    mockUseDevice.mockImplementation((device) => ({
      device,
      connectionState: (mockConnected ? 'connected' : 'disconnected') as any,
      isConnected: mockConnected && !!device,
      isConnecting: false,
      services: mockConnected ? [{ uuid: '180d' }] as any : [],
      error: null,
      connect: mockDeviceConnect,
      disconnect: mockDeviceDisconnect,
      autoReconnect: false,
      setAutoReconnect: jest.fn(),
      reconnectAttempt: 0,
    }));

    const { result } = renderHook(() => useConnection());

    let connectPromise: Promise<void>;
    act(() => {
      connectPromise = result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.device).toBe(selectedDevice);
    });

    await act(async () => {
      await connectPromise!;
    });

    expect(result.current.status).toBe('connected');
    expect(result.current.isConnected).toBe(true);
    expect(result.current.services).toEqual([{ uuid: '180d' }]);
  });

  it('does not surface an error for user-cancelled picker flows', async () => {
    mockRequestDevice.mockResolvedValue(null);
    const { result } = renderHook(() => useConnection());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('disconnects through useDevice and clears the selected device', async () => {
    const selectedDevice = createDevice();
    mockRequestDevice.mockResolvedValue(selectedDevice);
    const { result } = renderHook(() => useConnection());

    let connectPromise: Promise<void>;
    act(() => {
      connectPromise = result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.device).toBe(selectedDevice);
    });

    await act(async () => {
      await connectPromise!;
    });

    act(() => {
      result.current.disconnect();
    });

    expect(mockDeviceDisconnect).toHaveBeenCalledTimes(1);
    expect(result.current.device).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('surfaces live RSSI of a connected device when monitorRssi is enabled, and clears it on disconnect', async () => {
    const listeners: Record<string, (e: any) => void> = {};
    const watchAdvertisements = jest.fn().mockResolvedValue(undefined);
    const unwatchAdvertisements = jest.fn().mockResolvedValue(undefined);
    const device = {
      id: 'rssi-device',
      name: 'RSSI Device',
      watchAdvertisements,
      unwatchAdvertisements,
      raw: {
        addEventListener: jest.fn((type: string, cb: any) => { listeners[type] = cb; }),
        removeEventListener: jest.fn((type: string) => { delete listeners[type]; }),
      },
    } as any;
    mockRequestDevice.mockResolvedValue(device);
    // Uses the default deferred mock (RSSI-02): isConnected flips to true only
    // after mockDeviceConnect() resolves, so the monitor effect arms at the
    // production phase (post-GATT-connect), not on device selection.

    const { result } = renderHook(() => useConnection({ monitorRssi: true }));

    let connectPromise: Promise<void>;
    act(() => { connectPromise = result.current.connect(); });
    await waitFor(() => expect(result.current.device).toBe(device));
    await act(async () => { await connectPromise!; });

    // Connected + monitorRssi → the hook watches advertisements and listens for them.
    await waitFor(() => expect(watchAdvertisements).toHaveBeenCalled());
    // Listener attaches AFTER watchAdvertisements() resolves (spec §5.2
    // watchAdvertisements() pending-watch → watching transition), so wait for it.
    await waitFor(() =>
      expect(device.raw.addEventListener).toHaveBeenCalledWith('advertisementreceived', expect.any(Function)),
    );
    expect(result.current.rssi).toBeNull();

    // A received advertisement carries the live signal strength.
    act(() => { listeners['advertisementreceived']?.({ rssi: -57 }); });
    expect(result.current.rssi).toBe(-57);
    act(() => { listeners['advertisementreceived']?.({ rssi: -42 }); });
    expect(result.current.rssi).toBe(-42);

    // Disconnecting stops monitoring (unwatch + listener removed) and clears the value.
    act(() => { result.current.disconnect(); });
    expect(unwatchAdvertisements).toHaveBeenCalled();
    expect(device.raw.removeEventListener).toHaveBeenCalledWith('advertisementreceived', expect.any(Function));
    expect(result.current.rssi).toBeNull();
  });

  it('does not watch advertisements when monitorRssi is not set (opt-in)', async () => {
    const watchAdvertisements = jest.fn().mockResolvedValue(undefined);
    const device = { id: 'no-rssi', name: 'No RSSI', watchAdvertisements, raw: { addEventListener: jest.fn(), removeEventListener: jest.fn() } } as any;
    mockRequestDevice.mockResolvedValue(device);
    // Uses the default deferred mock (RSSI-02). monitorRssi is unset → the
    // auto-start effect never arms, regardless of isConnected timing.

    const { result } = renderHook(() => useConnection());
    let p: Promise<void>;
    act(() => { p = result.current.connect(); });
    await waitFor(() => expect(result.current.device).toBe(device));
    await act(async () => { await p!; });

    expect(result.current.rssi).toBeNull();
    expect(watchAdvertisements).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // RSSI-01 / spec §5.2 BluetoothDevice.watchAdvertisements(): when the UA
  // rejects the watch (NotSupportedError — "the UA doesn't support scanning
  // for advertisements", UnknownError, …) the hook MUST clear its ref + listener,
  // surface the error, and leave itself usable for a retry. Pre-fix the auto-
  // start effect did `void startRssiMonitoring()` with no catch; the ref was
  // set and the listener attached SYNCHRONOUSLY BEFORE the await, so a rejection
  // wedged the ref (subsequent retries no-op'd via the `if (rssiMonitorRef.current)`
  // guard) and propagated as an unhandled promise rejection.
  // ---------------------------------------------------------------------------
  it('RSSI-01 / spec §5.2 watchAdvertisements() rejection: clears ref + listener, sets error, hook stays usable (no unhandled rejection)', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      const watchAdvertisements = jest.fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('UA does not support scanning for advertisements'), { name: 'NotSupportedError' }),
        )
        .mockResolvedValue(undefined);
      const unwatchAdvertisements = jest.fn().mockResolvedValue(undefined);
      const device = {
        id: 'rssi-reject',
        name: 'RSSI Reject',
        watchAdvertisements,
        unwatchAdvertisements,
        raw: {
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
      } as any;
      mockRequestDevice.mockResolvedValue(device);

      const { result } = renderHook(() => useConnection({ monitorRssi: true }));

      let connectPromise: Promise<void>;
      act(() => { connectPromise = result.current.connect(); });
      await waitFor(() => expect(result.current.device).toBe(device));
      await act(async () => { await connectPromise!; });

      // Auto-start effect fired → watchAdvertisements rejected once.
      await waitFor(() => expect(watchAdvertisements).toHaveBeenCalled());
      // Flush the rejection + any downstream microtasks.
      await act(async () => { await Promise.resolve(); });

      // (a) no unhandled promise rejection escaped the effect.
      expect(unhandled).toEqual([]);

      // (b) teardown matched registration: with the fix the listener is never
      //     attached on rejection, so add === remove === 0 (balanced). Pre-fix
      //     the listener was attached before the await and never removed → 1/0.
      const addCalls = (device.raw.addEventListener as jest.Mock).mock.calls.filter((c) => c[0] === 'advertisementreceived').length;
      const removeCalls = (device.raw.removeEventListener as jest.Mock).mock.calls.filter((c) => c[0] === 'advertisementreceived').length;
      expect(addCalls).toBe(removeCalls);

      // (c) rssi is null (no advertisement ever received).
      expect(result.current.rssi).toBeNull();

      // (e) an error state is set (useConnection exposes `error`).
      expect(result.current.error).toBeInstanceOf(BeacioError);

      // (d) a retry call to startRssiMonitoring() is NOT a no-op: the ref was
      //     cleared on rejection, so the retry re-enters and calls
      //     watchAdvertisements() again (second mock → resolves).
      await act(async () => { await result.current.startRssiMonitoring(); });
      expect(watchAdvertisements).toHaveBeenCalledTimes(2);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  // ---------------------------------------------------------------------------
  // RSSI-02: the useDevice mock's isConnected timing must mirror production.
  // In real useDevice, isConnected flips to true only AFTER `await
  // device.connect()` resolves. Pre-fix the mock returned isConnected:
  // Boolean(device) — true synchronously on setSelectedDevice, BEFORE
  // deviceConnect() resolved — which armed the auto-start RSSI effect at the
  // wrong phase and masked race regressions (false-green).
  // ---------------------------------------------------------------------------
  it('RSSI-02: useDevice mock isConnected timing mirrors production (false until deviceConnect resolves)', async () => {
    const device = {
      id: 'timing-1',
      name: 'Timing',
      watchAdvertisements: jest.fn().mockResolvedValue(undefined),
      unwatchAdvertisements: jest.fn().mockResolvedValue(undefined),
      raw: { addEventListener: jest.fn(), removeEventListener: jest.fn() },
    } as any;
    mockRequestDevice.mockResolvedValue(device);

    // Deferred deviceConnect: mirrors production where isConnected only flips
    // after GATT connect completes. The default mock impl sets mockConnected
    // once the impl returns; here we gate that on a deferred we control.
    let resolveConnect!: () => void;
    mockDeviceConnect.mockImplementationOnce(async () => {
      await new Promise<void>((r) => { resolveConnect = r; });
      mockConnected = true;
    });

    const { result } = renderHook(() => useConnection({ monitorRssi: true }));

    let p: Promise<void>;
    act(() => { p = result.current.connect(); });
    await waitFor(() => expect(result.current.device).toBe(device));

    // Device selected, deviceConnect still pending → isConnected MUST be false
    // (production phase: GATT connect not yet complete; auto-start effect must
    // NOT have armed). Pre-fix the mock returned true here.
    expect(result.current.isConnected).toBe(false);

    // Resolve deviceConnect → isConnected flips to true on the next render.
    await act(async () => { resolveConnect(); await p!; });
    await waitFor(() => expect(result.current.isConnected).toBe(true));
  });

  // ---------------------------------------------------------------------------
  // RSSI-03 / spec §5.2 watchAdvertisements() pending-watch state: if cleanup
  // (disconnect / unmount) fires BEFORE the watch await settles, the hook MUST
  // NOT call unwatchAdvertisements() against an in-flight watch (spec-undefined
  // ordering — [[watchAdvertisementsState]] is still 'pending-watch'). Pre-fix
  // the ref + listener were set synchronously BEFORE the await, so stop()
  // tore them down (unwatch called) while the watch was still pending.
  // ---------------------------------------------------------------------------
  it('RSSI-03 / spec §5.2 pending-watch race: rapid disconnect before watch resolves → unwatch not called against in-flight watch', async () => {
    const watchAdvertisements = jest.fn();
    const unwatchAdvertisements = jest.fn().mockResolvedValue(undefined);
    let resolveWatch!: () => void;
    watchAdvertisements.mockReturnValue(new Promise<void>((r) => { resolveWatch = r; }));
    const device = {
      id: 'rssi-race',
      name: 'RSSI Race',
      watchAdvertisements,
      unwatchAdvertisements,
      raw: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    } as any;
    mockRequestDevice.mockResolvedValue(device);

    const { result, unmount } = renderHook(() => useConnection({ monitorRssi: true }));

    let p: Promise<void>;
    act(() => { p = result.current.connect(); });
    await waitFor(() => expect(result.current.device).toBe(device));
    await act(async () => { await p!; });

    // Auto-start effect fired → watchAdvertisements called and pending.
    await waitFor(() => expect(watchAdvertisements).toHaveBeenCalled());
    expect(watchAdvertisements).toHaveBeenCalledTimes(1);

    // Listener NOT attached yet (watch hasn't resolved; spec §5.2 pending-watch).
    expect(device.raw.addEventListener).not.toHaveBeenCalledWith('advertisementreceived', expect.any(Function));

    // Rapid unmount while watch is still in-flight.
    act(() => { unmount(); });

    // unwatchAdvertisements NOT called against the in-flight watch (spec-undefined
    // ordering avoided). Pre-fix the ref was set before the await, so stop()
    // called unwatch here → RED.
    expect(unwatchAdvertisements).not.toHaveBeenCalled();
    // Listener still not attached.
    expect(device.raw.addEventListener).not.toHaveBeenCalledWith('advertisementreceived', expect.any(Function));

    // Now resolve the deferred watch — the cancelled start routine cleans up
    // the scan it just armed (unwatch once), but the listener was never attached.
    await act(async () => { resolveWatch(); await Promise.resolve(); });

    expect(unwatchAdvertisements).toHaveBeenCalledTimes(1);
    expect(device.raw.addEventListener).not.toHaveBeenCalledWith('advertisementreceived', expect.any(Function));
  });

  // ---------------------------------------------------------------------------
  // Adversarial-3 / ref-tracked teardown: stopRssiMonitoring() must target the
  // device captured in rssiMonitorRef (active.device), not the possibly-null
  // `selectedDevice`. Disconnect calls stop BEFORE setSelectedDevice(null), and
  // the unmount-cleanup must NOT double-tear-down (the ref was already cleared).
  // ---------------------------------------------------------------------------
  it('ref-tracked teardown: disconnect removes the listener from the captured device, then unmount does not double-tear-down', async () => {
    const watchAdvertisements = jest.fn().mockResolvedValue(undefined);
    const unwatchAdvertisements = jest.fn().mockResolvedValue(undefined);
    const device = {
      id: 'teardown-1',
      name: 'Teardown',
      watchAdvertisements,
      unwatchAdvertisements,
      raw: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    } as any;
    mockRequestDevice.mockResolvedValue(device);

    const { result, unmount } = renderHook(() => useConnection({ monitorRssi: true }));

    let connectPromise: Promise<void>;
    act(() => { connectPromise = result.current.connect(); });
    await waitFor(() => expect(result.current.device).toBe(device));
    await act(async () => { await connectPromise!; });

    // Monitor armed: listener attached to device.raw (the captured target).
    await waitFor(() => expect(watchAdvertisements).toHaveBeenCalled());
    await waitFor(() =>
      expect(device.raw.addEventListener).toHaveBeenCalledWith('advertisementreceived', expect.any(Function)),
    );
    const addCountBefore = (device.raw.addEventListener as jest.Mock).mock.calls.filter((c) => c[0] === 'advertisementreceived').length;
    expect(addCountBefore).toBe(1);

    // Disconnect: stopRssiMonitoring() runs synchronously BEFORE
    // setSelectedDevice(null), so the ref still holds `device` → removeEventListener
    // + unwatch target the captured device.raw (not a null selectedDevice).
    act(() => { result.current.disconnect(); });
    expect(device.raw.removeEventListener).toHaveBeenCalledWith('advertisementreceived', expect.any(Function));
    expect(unwatchAdvertisements).toHaveBeenCalledTimes(1);
    const removeCountAfterDisconnect = (device.raw.removeEventListener as jest.Mock).mock.calls.filter((c) => c[0] === 'advertisementreceived').length;
    const unwatchCountAfterDisconnect = unwatchAdvertisements.mock.calls.length;
    expect(removeCountAfterDisconnect).toBe(1);

    // Unmount after disconnect: the ref was cleared by disconnect's stop, so the
    // unmount-cleanup's stopRssiMonitoring is a no-op — no double teardown.
    act(() => { unmount(); });
    expect((device.raw.removeEventListener as jest.Mock).mock.calls.filter((c) => c[0] === 'advertisementreceived').length).toBe(removeCountAfterDisconnect);
    expect(unwatchAdvertisements.mock.calls.length).toBe(unwatchCountAfterDisconnect);
  });
});

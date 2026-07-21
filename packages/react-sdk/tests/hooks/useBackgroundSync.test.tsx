import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { BeacioProvider } from '../../src/core/BeacioProvider';
import { useBackgroundSync } from '../../src/hooks/useBackgroundSync';
import { BeacioError } from '@beacio/core';
import type { BackgroundRegistration, NotificationPermissionState } from '@beacio/core';

function makeRegistration(overrides: Partial<BackgroundRegistration> = {}): BackgroundRegistration {
  return {
    id: 'reg-1',
    type: 'connection',
    createdAt: Date.now(),
    unregister: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeMockBackgroundSync() {
  return {
    requestPermission: jest.fn<Promise<NotificationPermissionState>, []>().mockResolvedValue('granted'),
    requestBackgroundConnection: jest.fn<Promise<BackgroundRegistration>, [object]>().mockResolvedValue(makeRegistration()),
    registerCharacteristicNotifications: jest.fn<Promise<BackgroundRegistration>, [object]>().mockResolvedValue(
      makeRegistration({ id: 'reg-notif', type: 'characteristic-notification' }),
    ),
    registerBeaconScanning: jest.fn<Promise<BackgroundRegistration>, [object]>().mockResolvedValue(
      makeRegistration({ id: 'reg-beacon', type: 'beacon-scan' }),
    ),
    getRegistrations: jest.fn<Promise<BackgroundRegistration[]>, []>().mockResolvedValue([]),
    unregister: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
    update: jest.fn<Promise<void>, [string, object]>().mockResolvedValue(undefined),
    destroy: jest.fn(),
    connect: jest.fn<Promise<BackgroundRegistration>, [object]>().mockResolvedValue(makeRegistration()),
    subscribe: jest.fn<Promise<BackgroundRegistration>, [object]>().mockResolvedValue(makeRegistration()),
    scan: jest.fn<Promise<BackgroundRegistration>, [object]>().mockResolvedValue(makeRegistration()),
    list: jest.fn<Promise<BackgroundRegistration[]>, []>().mockResolvedValue([]),
  };
}

function installSafariExtensionRuntime(backgroundSync: ReturnType<typeof makeMockBackgroundSync>) {
  Object.defineProperty(navigator, 'beacio', {
    value: {
      ...((navigator as { bluetooth?: Record<string, object> }).bluetooth ?? {}),
      __beacio: true,
      backgroundSync,
    },
    writable: true,
    configurable: true,
  });
}

describe('useBackgroundSync Hook', () => {
  let originalBeacio: unknown;
  let mockBackgroundSync: ReturnType<typeof makeMockBackgroundSync>;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BeacioProvider>{children}</BeacioProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    originalBeacio = (navigator as { beacio?: object }).beacio;
    mockBackgroundSync = makeMockBackgroundSync();
    installSafariExtensionRuntime(mockBackgroundSync);
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'beacio', {
      value: originalBeacio,
      writable: true,
      configurable: true,
    });
  });

  it('returns the expected default state', () => {
    const { result } = renderHook(() => useBackgroundSync(), { wrapper });

    expect(result.current.permissionState).toBeNull();
    expect(result.current.registrations).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isSupported).toBe(true);
  });

  it('requests permission through the safari-extension runtime', async () => {
    const { result } = renderHook(() => useBackgroundSync(), { wrapper });

    let permissionState: NotificationPermissionState | null = null;
    await act(async () => {
      permissionState = await result.current.requestPermission();
    });

    expect(permissionState).toBe('granted');
    expect(mockBackgroundSync.requestPermission).toHaveBeenCalledTimes(1);
    expect(result.current.permissionState).toBe('granted');
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('surfaces permission errors', async () => {
    mockBackgroundSync.requestPermission.mockRejectedValue(new Error('Permission failed'));
    const { result } = renderHook(() => useBackgroundSync(), { wrapper });

    let permissionState: NotificationPermissionState | null = null;
    await act(async () => {
      permissionState = await result.current.requestPermission();
    });

    expect(permissionState).toBeNull();
    expect(result.current.error).toBeInstanceOf(BeacioError);
    expect(result.current.error?.message).toBe('Permission failed');
    expect(result.current.isLoading).toBe(false);
  });

  it('registers background connections and stores the returned registration', async () => {
    const { result } = renderHook(() => useBackgroundSync(), { wrapper });

    let registration: BackgroundRegistration | null = null;
    await act(async () => {
      registration = await result.current.requestBackgroundConnection({ deviceId: 'dev-1' });
    });

    expect(mockBackgroundSync.requestBackgroundConnection).toHaveBeenCalledWith({ deviceId: 'dev-1' });
    expect(registration).toEqual(expect.objectContaining({ id: 'reg-1' }));
    expect(result.current.registrations).toHaveLength(1);
    expect(result.current.registrations[0]?.id).toBe('reg-1');
  });

  it('registers characteristic notifications', async () => {
    const { result } = renderHook(() => useBackgroundSync(), { wrapper });
    const notificationOptions = {
      deviceId: 'dev-1',
      serviceUUID: '180d',
      characteristicUUID: '2a37',
      template: { title: 'HR Alert', body: 'Heart rate: {{value.utf8}}' },
      condition: { decode: 'uint8' as const, operator: 'gt' as const, threshold: 100 },
    };

    await act(async () => {
      await result.current.registerCharacteristicNotifications(notificationOptions);
    });

    expect(mockBackgroundSync.registerCharacteristicNotifications).toHaveBeenCalledWith(notificationOptions);
    expect(result.current.registrations[0]?.id).toBe('reg-notif');
  });

  it('registers beacon scanning', async () => {
    const { result } = renderHook(() => useBackgroundSync(), { wrapper });
    const scanOptions = {
      filters: [{ services: ['180d'] }],
      template: { title: 'Beacon Found', body: 'Device nearby' },
    };

    await act(async () => {
      await result.current.registerBeaconScanning(scanOptions);
    });

    expect(mockBackgroundSync.registerBeaconScanning).toHaveBeenCalledWith(scanOptions);
    expect(result.current.registrations[0]?.id).toBe('reg-beacon');
  });

  it('lists existing registrations and updates local state', async () => {
    const registrations = [makeRegistration({ id: 'a' }), makeRegistration({ id: 'b' })];
    mockBackgroundSync.getRegistrations.mockResolvedValue(registrations);
    const { result } = renderHook(() => useBackgroundSync(), { wrapper });

    let listed: BackgroundRegistration[] = [];
    await act(async () => {
      listed = await result.current.list();
    });

    expect(listed.map((registration) => registration.id)).toEqual(['a', 'b']);
    expect(result.current.registrations.map((registration) => registration.id)).toEqual(['a', 'b']);
  });

  it('removes registrations from local state only after unregister succeeds', async () => {
    const { result } = renderHook(() => useBackgroundSync(), { wrapper });

    await act(async () => {
      await result.current.requestBackgroundConnection({ deviceId: 'dev-1' });
    });
    expect(result.current.registrations).toHaveLength(1);

    await act(async () => {
      await result.current.unregister('reg-1');
    });

    expect(mockBackgroundSync.unregister).toHaveBeenCalledWith('reg-1');
    expect(result.current.registrations).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
  });

  it('preserves local registrations when unregister fails', async () => {
    mockBackgroundSync.unregister.mockRejectedValue(new Error('Unregister failed'));
    const { result } = renderHook(() => useBackgroundSync(), { wrapper });

    await act(async () => {
      await result.current.requestBackgroundConnection({ deviceId: 'dev-1' });
    });

    await act(async () => {
      await result.current.unregister('reg-1');
    });

    expect(result.current.registrations).toHaveLength(1);
    expect(result.current.registrations[0]?.id).toBe('reg-1');
    expect(result.current.error).toBeInstanceOf(BeacioError);
    expect(result.current.error?.message).toBe('Unregister failed');
  });

  it('updates registrations through the core runtime', async () => {
    const { result } = renderHook(() => useBackgroundSync(), { wrapper });
    const newTemplate = { title: 'Updated Title' };

    await act(async () => {
      await result.current.update('reg-1', newTemplate);
    });

    expect(mockBackgroundSync.update).toHaveBeenCalledWith('reg-1', newTemplate);
    expect(result.current.error).toBeNull();
  });

  it('marks the hook unsupported outside safari-extension mode', async () => {
    Object.defineProperty(navigator, 'beacio', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useBackgroundSync(), { wrapper });

    expect(result.current.isSupported).toBe(false);

    let permissionState: NotificationPermissionState | null = null;
    await act(async () => {
      permissionState = await result.current.requestPermission();
    });

    expect(permissionState).toBeNull();
    expect(result.current.error).toBeInstanceOf(BeacioError);
  });

  it('auto-fetches registrations on mount when requested', async () => {
    mockBackgroundSync.getRegistrations.mockResolvedValue([makeRegistration({ id: 'auto-1' })]);

    const { result } = renderHook(() => useBackgroundSync({ autoFetch: true }), { wrapper });

    await waitFor(() => {
      expect(result.current.registrations).toHaveLength(1);
    });

    expect(result.current.registrations[0]?.id).toBe('auto-1');
    expect(mockBackgroundSync.getRegistrations).toHaveBeenCalledTimes(1);
  });

  it('does not auto-fetch registrations by default', async () => {
    renderHook(() => useBackgroundSync({}), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockBackgroundSync.getRegistrations).not.toHaveBeenCalled();
  });

  it('clears errors explicitly', async () => {
    mockBackgroundSync.requestPermission.mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useBackgroundSync(), { wrapper });

    await act(async () => {
      await result.current.requestPermission();
    });
    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('does not unregister OS-level registrations on unmount', async () => {
    const { result, unmount } = renderHook(() => useBackgroundSync(), { wrapper });

    await act(async () => {
      await result.current.requestBackgroundConnection({ deviceId: 'dev-1' });
    });

    unmount();

    expect(mockBackgroundSync.unregister).not.toHaveBeenCalled();
    expect(mockBackgroundSync.destroy).not.toHaveBeenCalled();
  });

  it('guards setState calls after unmount', async () => {
    let resolvePermission!: (value: NotificationPermissionState) => void;
    mockBackgroundSync.requestPermission.mockImplementation(
      () => new Promise<NotificationPermissionState>((resolve) => {
        resolvePermission = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useBackgroundSync(), { wrapper });
    let permissionPromise: Promise<NotificationPermissionState | null>;

    act(() => {
      permissionPromise = result.current.requestPermission();
    });

    unmount();

    await act(async () => {
      resolvePermission('granted');
      await permissionPromise!;
    });
  });

  it('tracks isLoading during async operations', async () => {
    let resolveConnection!: (value: BackgroundRegistration) => void;
    mockBackgroundSync.requestBackgroundConnection.mockImplementation(
      () => new Promise<BackgroundRegistration>((resolve) => {
        resolveConnection = resolve;
      }),
    );

    const { result } = renderHook(() => useBackgroundSync(), { wrapper });
    let connectionPromise: Promise<BackgroundRegistration | null>;

    act(() => {
      connectionPromise = result.current.requestBackgroundConnection({ deviceId: 'dev-1' });
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveConnection(makeRegistration());
      await connectionPromise!;
    });

    expect(result.current.isLoading).toBe(false);
  });
});

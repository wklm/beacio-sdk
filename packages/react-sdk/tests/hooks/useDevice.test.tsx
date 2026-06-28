import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { BeacioProvider } from '../../src/core/BeacioProvider';
import { useDevice } from '../../src/hooks/useDevice';

/**
 * Factory for creating mock BeacioDevice objects that match the interface
 * expected by useDevice: connect(), disconnect(), getPrimaryServices(),
 * watchAdvertisements(), forget(), on(), off(), subscribe(), raw, id, name, connected.
 */
function createMockDevice(overrides: Record<string, any> = {}) {
  const device: Record<string, any> = {
    id: 'test-device-id',
    name: 'Test Device',
    raw: {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      watchingAdvertisements: false,
      watchAdvertisements: jest.fn().mockResolvedValue(undefined),
      unwatchAdvertisements: jest.fn().mockResolvedValue(undefined),
      forget: jest.fn().mockResolvedValue(undefined),
      gatt: {
        connected: false,
        requestConnectionPriority: jest.fn().mockResolvedValue(undefined),
      },
    },
    connected: false,
    connect: jest.fn().mockImplementation(async () => {
      device.connected = true;
    }),
    disconnect: jest.fn().mockImplementation(() => {
      device.connected = false;
    }),
    getPrimaryServices: jest.fn().mockResolvedValue([]),
    watchAdvertisements: jest.fn().mockImplementation(async () => {
      device.raw.watchingAdvertisements = true;
    }),
    unwatchAdvertisements: jest.fn().mockImplementation(async () => {
      device.raw.watchingAdvertisements = false;
    }),
    forget: jest.fn().mockResolvedValue(undefined),
    on: jest.fn().mockReturnValue(jest.fn()),
    off: jest.fn(),
    ...overrides,
  };
  return device;
}

describe('useDevice Hook', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BeacioProvider>{children}</BeacioProvider>
  );

  let mockDevice: ReturnType<typeof createMockDevice>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDevice = createMockDevice();
  });

  describe('Device connection', () => {
    it('should connect to a device', async () => {
      const { result } = renderHook(() => useDevice(mockDevice as any), { wrapper });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.isConnecting).toBe(false);

      await act(async () => {
        await result.current.connect();
      });

      expect(mockDevice.connect).toHaveBeenCalled();
      expect(result.current.isConnected).toBe(true);
      expect(result.current.isConnecting).toBe(false);
    });

    it('should disconnect from a device', async () => {
      const { result } = renderHook(() => useDevice(mockDevice as any), { wrapper });

      // First connect
      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.isConnected).toBe(true);

      // Then disconnect
      act(() => {
        result.current.disconnect();
      });

      expect(mockDevice.disconnect).toHaveBeenCalled();
      expect(result.current.isConnected).toBe(false);
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockDevice.connect.mockRejectedValue(error);

      const { result } = renderHook(() => useDevice(mockDevice as any), { wrapper });

      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe(error.message);
      expect(result.current.isConnected).toBe(false);
    });

  });

  describe('Service discovery', () => {
    it('should get primary services', async () => {
      const mockServices = [
        { uuid: 'service-1', isPrimary: true },
        { uuid: 'service-2', isPrimary: true }
      ];
      mockDevice.getPrimaryServices.mockResolvedValue(mockServices);

      const { result } = renderHook(() => useDevice(mockDevice as any), { wrapper });

      // Connect first
      await act(async () => {
        await result.current.connect();
      });

      // Services should be fetched automatically after connection
      await waitFor(() => {
        expect(result.current.services).toEqual(mockServices);
      });
    });

    it('should handle service discovery errors', async () => {
      const error = new Error('Service discovery failed');
      mockDevice.getPrimaryServices.mockRejectedValue(error);

      const { result } = renderHook(() => useDevice(mockDevice as any), { wrapper });

      await act(async () => {
        await result.current.connect();
      });

      await waitFor(() => {
        expect(result.current.error).toBeInstanceOf(Error);
        expect(result.current.error?.message).toBe(error.message);
        expect(result.current.services).toEqual([]);
      });
    });
  });

  describe('Event handling', () => {
    it('should handle disconnect events', async () => {
      // Capture the disconnect callback passed to device.on('disconnected', fn)
      let disconnectCallback: (() => void) | null = null;
      mockDevice.on.mockImplementation((event: string, fn: () => void) => {
        if (event === 'disconnected') disconnectCallback = fn;
        return jest.fn(); // unsub fn
      });

      const { result } = renderHook(() => useDevice(mockDevice as any), { wrapper });

      // Connect first
      await act(async () => {
        await result.current.connect();
      });

      expect(result.current.isConnected).toBe(true);

      // Simulate disconnect event
      if (disconnectCallback) {
        act(() => {
          disconnectCallback!();
        });
      }

      expect(result.current.isConnected).toBe(false);
    });

    it('should clean up event listeners on unmount', () => {
      const unsubFn = jest.fn();
      mockDevice.on.mockReturnValue(unsubFn);

      const { unmount } = renderHook(() => useDevice(mockDevice as any), { wrapper });

      unmount();

      // The useEffect cleanup calls the unsub function returned by device.on()
      expect(unsubFn).toHaveBeenCalled();
    });
  });

  describe('Hook return values', () => {
    it('should return all expected properties', () => {
      const { result } = renderHook(() => useDevice(mockDevice as any), { wrapper });

      expect(result.current).toHaveProperty('device');
      expect(result.current).toHaveProperty('isConnected');
      expect(result.current).toHaveProperty('isConnecting');
      expect(result.current).toHaveProperty('services');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('connect');
      expect(result.current).toHaveProperty('disconnect');
      expect(result.current).toHaveProperty('watchAdvertisements');
      expect(result.current).toHaveProperty('unwatchAdvertisements');
      expect(result.current).toHaveProperty('isWatchingAdvertisements');
      expect(result.current).toHaveProperty('forget');
      expect(result.current).toHaveProperty('connectionPriority');
      expect(result.current).toHaveProperty('setConnectionPriority');
      expect(result.current).toHaveProperty('connectionState');
      expect(result.current).toHaveProperty('autoReconnect');
      expect(result.current).toHaveProperty('setAutoReconnect');
      expect(result.current).toHaveProperty('reconnectAttempt');
    });

    it('should delegate advertisement watching to the device', async () => {
      const { result } = renderHook(() => useDevice(mockDevice as any), { wrapper });

      await act(async () => {
        await result.current.watchAdvertisements();
      });

      expect(mockDevice.watchAdvertisements).toHaveBeenCalled();
      expect(result.current.isWatchingAdvertisements).toBe(true);

      await act(async () => {
        await result.current.unwatchAdvertisements();
      });

      expect(mockDevice.unwatchAdvertisements).toHaveBeenCalled();
      expect(result.current.isWatchingAdvertisements).toBe(false);
    });

    it('should initialize advertisement watching state from the raw device', () => {
      mockDevice.raw.watchingAdvertisements = true;

      const { result } = renderHook(() => useDevice(mockDevice as any), { wrapper });

      expect(result.current.isWatchingAdvertisements).toBe(true);
    });

    it('should delegate forget to the device', async () => {
      const { result } = renderHook(() => useDevice(mockDevice as any), { wrapper });

      await act(async () => {
        await result.current.forget();
      });

      expect(mockDevice.forget).toHaveBeenCalled();
      expect(result.current.isWatchingAdvertisements).toBe(false);
      expect(result.current.connectionPriority).toBeNull();
    });

    it('should report GATT_OPERATION_FAILED when watchAdvertisements is not supported', async () => {
      mockDevice.raw.watchAdvertisements = undefined;

      const { result } = renderHook(() => useDevice(mockDevice as any), { wrapper });

      await act(async () => {
        try {
          await result.current.watchAdvertisements();
        } catch (_) {}
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.code).toBe('GATT_OPERATION_FAILED');
    });

    it('should report GATT_OPERATION_FAILED when unwatchAdvertisements is not supported', async () => {
      mockDevice.raw.unwatchAdvertisements = undefined;

      const { result } = renderHook(() => useDevice(mockDevice as any), { wrapper });

      await act(async () => {
        try {
          await result.current.unwatchAdvertisements();
        } catch (_) {}
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.code).toBe('GATT_OPERATION_FAILED');
    });

    it('should report GATT_OPERATION_FAILED when forget is not supported', async () => {
      mockDevice.raw.forget = undefined;

      const { result } = renderHook(() => useDevice(mockDevice as any), { wrapper });

      await act(async () => {
        try {
          await result.current.forget();
        } catch (_) {}
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.code).toBe('GATT_OPERATION_FAILED');
    });

    it('should delegate connection priority requests to raw GATT', async () => {
      const { result } = renderHook(() => useDevice(mockDevice as any), { wrapper });

      await act(async () => {
        await result.current.setConnectionPriority('high');
      });

      expect(mockDevice.raw.gatt.requestConnectionPriority).toHaveBeenCalledWith('high');
      expect(result.current.connectionPriority).toBe('high');
    });

    it('should handle null device gracefully', () => {
      const { result } = renderHook(() => useDevice(null), { wrapper });

      expect(result.current.device).toBeNull();
      expect(result.current.isConnected).toBe(false);
      expect(result.current.isWatchingAdvertisements).toBe(false);
      expect(result.current.connectionPriority).toBeNull();
      expect(result.current.services).toEqual([]);
    });
  });
});

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { BeacioProvider } from '../../src/core/BeacioProvider';
import { useNotifications } from '../../src/hooks/useNotifications';
import type { BeacioDevice } from '@beacio/core';

/**
 * Factory for creating mock BeacioDevice objects.
 * The new useNotifications API: useNotifications(device, service, characteristic, options?)
 * uses device.subscribe(service, characteristic, callback) which returns an unsub fn.
 */
function createMockDevice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-device-id',
    name: 'Test Device',
    raw: { gatt: { connected: true } },
    connected: true,
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    getPrimaryServices: jest.fn().mockResolvedValue([]),
    watchAdvertisements: jest.fn().mockResolvedValue(undefined),
    forget: jest.fn().mockResolvedValue(undefined),
    on: jest.fn().mockReturnValue(jest.fn()),
    off: jest.fn(),
    subscribeAsync: jest.fn().mockResolvedValue(jest.fn()),
    ...overrides,
  };
}

describe('useNotifications Hook', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BeacioProvider>{children}</BeacioProvider>
  );

  const SERVICE = 'heart_rate';
  const CHARACTERISTIC = 'heart_rate_measurement';

  let mockDevice: ReturnType<typeof createMockDevice>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDevice = createMockDevice();
  });

  describe('Initialization', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(
        () => useNotifications(null, SERVICE, CHARACTERISTIC),
        { wrapper }
      );

      expect(result.current.isSubscribed).toBe(false);
      expect(result.current.value).toBeNull();
      expect(result.current.history).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('should accept a device', () => {
      const { result } = renderHook(
        () => useNotifications(mockDevice as unknown as BeacioDevice, SERVICE, CHARACTERISTIC),
        { wrapper }
      );

      expect(result.current.error).toBeNull();
    });
  });

  describe('Subscription management', () => {
    it('should subscribe to notifications', async () => {
      const unsubFn = jest.fn();
      mockDevice.subscribeAsync.mockReturnValue(unsubFn);

      const { result } = renderHook(
        () => useNotifications(mockDevice as unknown as BeacioDevice, SERVICE, CHARACTERISTIC),
        { wrapper }
      );

      await act(async () => {
        await result.current.subscribe();
      });

      expect(mockDevice.subscribeAsync).toHaveBeenCalledWith(
        SERVICE,
        CHARACTERISTIC,
        expect.any(Function)
      );
      expect(result.current.isSubscribed).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('should unsubscribe from notifications', async () => {
      const unsubFn = jest.fn();
      mockDevice.subscribeAsync.mockReturnValue(unsubFn);

      const { result } = renderHook(
        () => useNotifications(mockDevice as unknown as BeacioDevice, SERVICE, CHARACTERISTIC),
        { wrapper }
      );

      // Subscribe first
      await act(async () => {
        await result.current.subscribe();
      });

      expect(result.current.isSubscribed).toBe(true);

      // Then unsubscribe
      await act(async () => {
        await result.current.unsubscribe();
      });

      expect(unsubFn).toHaveBeenCalled();
      expect(result.current.isSubscribed).toBe(false);
    });

    it('should handle subscription errors', async () => {
      const error = new Error('Failed to start notifications');
      mockDevice.subscribeAsync.mockImplementation(() => { throw error; });

      const { result } = renderHook(
        () => useNotifications(mockDevice as unknown as BeacioDevice, SERVICE, CHARACTERISTIC),
        { wrapper }
      );

      await act(async () => {
        await result.current.subscribe();
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toContain('Failed to start notifications');
      expect(result.current.isSubscribed).toBe(false);
    });

    it('should handle missing device', async () => {
      const { result } = renderHook(
        () => useNotifications(null, SERVICE, CHARACTERISTIC),
        { wrapper }
      );

      await act(async () => {
        await result.current.subscribe();
      });

      expect(result.current.error?.message).toBe('Device not available or not connected');
      expect(result.current.isSubscribed).toBe(false);
    });

    it('should handle disconnected device', async () => {
      mockDevice.connected = false;

      const { result } = renderHook(
        () => useNotifications(mockDevice as unknown as BeacioDevice, SERVICE, CHARACTERISTIC),
        { wrapper }
      );

      await act(async () => {
        await result.current.subscribe();
      });

      expect(result.current.error?.message).toBe('Device not available or not connected');
      expect(result.current.isSubscribed).toBe(false);
    });
  });

  describe('Notification handling', () => {
    it('should handle incoming notifications', async () => {
      const mockValue1 = new DataView(new ArrayBuffer(4));
      mockValue1.setUint32(0, 0x12345678, true);

      const mockValue2 = new DataView(new ArrayBuffer(4));
      mockValue2.setUint32(0, 0x87654321, true);

      // Capture the notification callback
      let notificationCallback: ((value: DataView) => void) | null = null;
      mockDevice.subscribeAsync.mockImplementation(
        (_svc: string, _char: string, cb: (value: DataView) => void) => {
          notificationCallback = cb;
          return jest.fn();
        }
      );

      const { result } = renderHook(
        () => useNotifications(mockDevice as unknown as BeacioDevice, SERVICE, CHARACTERISTIC),
        { wrapper }
      );

      // Subscribe to notifications
      await act(async () => {
        await result.current.subscribe();
      });

      // Simulate first notification
      act(() => {
        notificationCallback!(mockValue1);
      });

      expect(result.current.value).toBe(mockValue1);
      expect(result.current.history).toHaveLength(1);
      expect(result.current.history[0].value).toBe(mockValue1);
      expect(result.current.history[0].timestamp).toBeInstanceOf(Date);

      // Simulate second notification
      act(() => {
        notificationCallback!(mockValue2);
      });

      expect(result.current.value).toBe(mockValue2);
      expect(result.current.history).toHaveLength(2);
      expect(result.current.history[1].value).toBe(mockValue2);
    });

    it('should limit history to maxHistory entries', async () => {
      let notificationCallback: ((value: DataView) => void) | null = null;
      mockDevice.subscribeAsync.mockImplementation(
        (_svc: string, _char: string, cb: (value: DataView) => void) => {
          notificationCallback = cb;
          return jest.fn();
        }
      );

      const { result } = renderHook(
        () => useNotifications(mockDevice as unknown as BeacioDevice, SERVICE, CHARACTERISTIC, { maxHistory: 3 }),
        { wrapper }
      );

      // Subscribe to notifications
      await act(async () => {
        await result.current.subscribe();
      });

      // Send 5 notifications
      for (let i = 0; i < 5; i++) {
        const mockValue = new DataView(new ArrayBuffer(4));
        mockValue.setUint32(0, i, true);

        act(() => {
          notificationCallback!(mockValue);
        });
      }

      // Should only keep the last 3
      expect(result.current.history).toHaveLength(3);
      expect(result.current.history[0].value.getUint32(0, true)).toBe(2);
      expect(result.current.history[1].value.getUint32(0, true)).toBe(3);
      expect(result.current.history[2].value.getUint32(0, true)).toBe(4);
    });

    it('should clear history', async () => {
      const mockValue = new DataView(new ArrayBuffer(4));
      mockValue.setUint32(0, 0x12345678, true);

      let notificationCallback: ((value: DataView) => void) | null = null;
      mockDevice.subscribeAsync.mockImplementation(
        (_svc: string, _char: string, cb: (value: DataView) => void) => {
          notificationCallback = cb;
          return jest.fn();
        }
      );

      const { result } = renderHook(
        () => useNotifications(mockDevice as unknown as BeacioDevice, SERVICE, CHARACTERISTIC),
        { wrapper }
      );

      // Subscribe and receive a notification
      await act(async () => {
        await result.current.subscribe();
      });

      act(() => {
        notificationCallback!(mockValue);
      });

      expect(result.current.history).toHaveLength(1);
      expect(result.current.value).toBe(mockValue);

      // Clear history
      act(() => {
        result.current.clear();
      });

      expect(result.current.history).toEqual([]);
      expect(result.current.value).toBeNull();
    });
  });

  describe('Options', () => {
    it('should auto-subscribe when autoSubscribe is true', async () => {
      mockDevice.subscribeAsync.mockReturnValue(jest.fn());

      const { result } = renderHook(
        () => useNotifications(mockDevice as unknown as BeacioDevice, SERVICE, CHARACTERISTIC, { autoSubscribe: true }),
        { wrapper }
      );

      // Wait for auto-subscription to complete and state to update
      await waitFor(() => {
        expect(mockDevice.subscribeAsync).toHaveBeenCalledWith(
          SERVICE,
          CHARACTERISTIC,
          expect.any(Function)
        );
        expect(result.current.isSubscribed).toBe(true);
      });
    });

    it('should not auto-subscribe when autoSubscribe is false', async () => {
      const { result } = renderHook(
        () => useNotifications(mockDevice as unknown as BeacioDevice, SERVICE, CHARACTERISTIC, { autoSubscribe: false }),
        { wrapper }
      );

      // Give it time to potentially auto-subscribe (it shouldn't)
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockDevice.subscribeAsync).not.toHaveBeenCalled();
      expect(result.current.isSubscribed).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('should clean up on unmount', async () => {
      const unsubFn = jest.fn();
      mockDevice.subscribeAsync.mockReturnValue(unsubFn);

      const { result, unmount } = renderHook(
        () => useNotifications(mockDevice as unknown as BeacioDevice, SERVICE, CHARACTERISTIC),
        { wrapper }
      );

      // Subscribe to notifications
      await act(async () => {
        await result.current.subscribe();
      });

      // Unmount the hook
      unmount();

      // The unsub function returned by device.subscribe should be called
      expect(unsubFn).toHaveBeenCalled();
    });

    it('should handle cleanup when not subscribed', () => {
      const { unmount } = renderHook(
        () => useNotifications(mockDevice as unknown as BeacioDevice, SERVICE, CHARACTERISTIC),
        { wrapper }
      );

      // Should not throw when unmounting without subscription
      expect(() => unmount()).not.toThrow();
    });

    it('should handle cleanup with null device', () => {
      const { unmount } = renderHook(
        () => useNotifications(null, SERVICE, CHARACTERISTIC),
        { wrapper }
      );

      // Should not throw when unmounting with null device
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Hook return values', () => {
    it('should return all expected properties', () => {
      const { result } = renderHook(
        () => useNotifications(mockDevice as unknown as BeacioDevice, SERVICE, CHARACTERISTIC),
        { wrapper }
      );

      expect(result.current).toHaveProperty('isSubscribed');
      expect(result.current).toHaveProperty('value');
      expect(result.current).toHaveProperty('history');
      expect(result.current).toHaveProperty('subscribe');
      expect(result.current).toHaveProperty('unsubscribe');
      expect(result.current).toHaveProperty('clear');
      expect(result.current).toHaveProperty('error');
    });
  });

  describe('Edge cases', () => {
    it('should handle multiple subscriptions gracefully', async () => {
      const unsubFn = jest.fn();
      mockDevice.subscribeAsync.mockReturnValue(unsubFn);

      const { result } = renderHook(
        () => useNotifications(mockDevice as unknown as BeacioDevice, SERVICE, CHARACTERISTIC),
        { wrapper }
      );

      // Subscribe twice
      await act(async () => {
        await result.current.subscribe();
      });

      await act(async () => {
        await result.current.subscribe();
      });

      // Should only call subscribe once (second call is guarded by isSubscribed)
      expect(mockDevice.subscribeAsync).toHaveBeenCalledTimes(1);
      expect(result.current.isSubscribed).toBe(true);
    });

    it('should handle multiple unsubscriptions gracefully', async () => {
      const unsubFn = jest.fn();
      mockDevice.subscribeAsync.mockReturnValue(unsubFn);

      const { result } = renderHook(
        () => useNotifications(mockDevice as unknown as BeacioDevice, SERVICE, CHARACTERISTIC),
        { wrapper }
      );

      // Subscribe first
      await act(async () => {
        await result.current.subscribe();
      });

      // Unsubscribe twice
      await act(async () => {
        await result.current.unsubscribe();
      });

      await act(async () => {
        await result.current.unsubscribe();
      });

      // Should handle gracefully -- unsub called once, second is guarded
      expect(unsubFn).toHaveBeenCalledTimes(1);
      expect(result.current.isSubscribed).toBe(false);
    });
  });
});

import { renderHook, act } from '@testing-library/react';
import { useScan } from '../../src/hooks/useScan';
import { useBeacio } from '../../src/core/BeacioProvider';
import { BeacioDevice } from '@beacio/core';

// Mock the useBeacio hook
jest.mock('../../src/core/BeacioProvider', () => ({
  useBeacio: jest.fn()
}));

describe('useScan', () => {
  let mockRequestLEScan: jest.Mock;
  let mockStopScan: jest.Mock;
  let mockScan: any;

  beforeEach(() => {
    mockRequestLEScan = jest.fn();
    mockStopScan = jest.fn();
    mockScan = {
      active: false,
      stop: mockStopScan
    };

    (useBeacio as jest.Mock).mockReturnValue({
      requestLEScan: mockRequestLEScan,
      stopScan: jest.fn()
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have idle scan state initially', () => {
      const { result } = renderHook(() => useScan());
      
      expect(result.current.scanState).toBe('idle');
      expect(result.current.devices).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Start Scanning', () => {
    it('should start scanning with filters', async () => {
      mockRequestLEScan.mockResolvedValue(mockScan);
      const { result } = renderHook(() => useScan());
      
      const filters = [{ services: ['heart_rate'] }];
      
      await act(async () => {
        await result.current.start({ filters });
      });
      
      expect(mockRequestLEScan).toHaveBeenCalledWith({ filters });
      expect(result.current.scanState).toBe('scanning');
    });

    it('should start scanning without filters', async () => {
      mockRequestLEScan.mockResolvedValue(mockScan);
      const { result } = renderHook(() => useScan());
      
      await act(async () => {
        await result.current.start();
      });
      
      expect(mockRequestLEScan).toHaveBeenCalledWith({});
      expect(result.current.scanState).toBe('scanning');
    });

    it('should handle scan start errors', async () => {
      const error = new Error('Bluetooth not available');
      mockRequestLEScan.mockRejectedValue(error);
      const { result } = renderHook(() => useScan());
      
      await act(async () => {
        await result.current.start();
      });

      expect(result.current.scanState).toBe('idle');
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe(error.message);
    });

    it('should not start if already scanning', async () => {
      mockRequestLEScan.mockResolvedValue(mockScan);
      const { result } = renderHook(() => useScan());
      
      // Start scanning
      await act(async () => {
        await result.current.start();
      });
      
      // Try to start again
      await act(async () => {
        await result.current.start();
      });
      
      expect(mockRequestLEScan).toHaveBeenCalledTimes(1);
    });

    it('should accept additional scan options', async () => {
      mockRequestLEScan.mockResolvedValue(mockScan);
      const { result } = renderHook(() => useScan());
      
      const options = {
        filters: [{ name: 'My Device' }],
        keepRepeatedDevices: true,
        acceptAllAdvertisements: false
      };
      
      await act(async () => {
        await result.current.start(options);
      });
      
      expect(mockRequestLEScan).toHaveBeenCalledWith(options);
    });
  });

  describe('Stop Scanning', () => {
    it('should stop active scan', async () => {
      mockScan.active = true;
      mockRequestLEScan.mockResolvedValue(mockScan);
      
      (useBeacio as jest.Mock).mockReturnValue({
        requestLEScan: mockRequestLEScan,
        stopScan: jest.fn()
      });
      
      const { result } = renderHook(() => useScan());
      
      // Start scanning first
      await act(async () => {
        await result.current.start();
      });
      
      // Stop scanning
      act(() => {
        result.current.stop();
      });
      
      expect(mockStopScan).toHaveBeenCalled();
      expect(result.current.scanState).toBe('stopped');
    });

    it('should handle stop when not scanning', () => {
      const { result } = renderHook(() => useScan());
      
      act(() => {
        result.current.stop();
      });
      
      expect(result.current.scanState).toBe('stopped');
      expect(mockStopScan).not.toHaveBeenCalled();
    });
  });

  describe('Device Discovery', () => {
    it('should add discovered devices', async () => {
      const mockDevice = {
        id: 'device-1',
        name: 'Test Device',
        gatt: { connected: false }
      };

      let advertisementCallback: any;
      mockRequestLEScan.mockImplementation(async (options) => {
        // Capture the event listener
        setTimeout(() => {
          if (advertisementCallback) {
            advertisementCallback({
              device: mockDevice,
              uuids: ['heart_rate'],
              rssi: -50
            });
          }
        }, 10);
        return mockScan;
      });

      const { result } = renderHook(() => useScan());
      
      // Set up listener
      (navigator as any).bluetooth.addEventListener.mockImplementation((event: string, callback: any) => {
        if (event === 'advertisementreceived') {
          advertisementCallback = callback;
        }
      });

      await act(async () => {
        await result.current.start();
      });

      // Wait for advertisement
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
      });

      expect(result.current.devices).toHaveLength(1);
      expect(result.current.devices[0]).toBeInstanceOf(BeacioDevice);
      expect((result.current.devices[0] as BeacioDevice).raw).toBe(mockDevice as any);
    });

    it('should prevent duplicate devices', async () => {
      const mockDevice = {
        id: 'device-1',
        name: 'Test Device',
        gatt: { connected: false }
      };

      let advertisementCallback: any;
      mockRequestLEScan.mockImplementation(async () => mockScan);

      const { result } = renderHook(() => useScan());
      
      (navigator as any).bluetooth.addEventListener.mockImplementation((event: string, callback: any) => {
        if (event === 'advertisementreceived') {
          advertisementCallback = callback;
        }
      });

      await act(async () => {
        await result.current.start();
      });

      // Simulate multiple advertisements from same device
      act(() => {
        advertisementCallback?.({ device: mockDevice, rssi: -50 });
        advertisementCallback?.({ device: mockDevice, rssi: -48 });
        advertisementCallback?.({ device: mockDevice, rssi: -52 });
      });

      expect(result.current.devices).toHaveLength(1);
    });
  });

  describe('Clear Devices', () => {
    it('should clear all discovered devices', async () => {
      const devices = [
        { id: '1', name: 'Device 1' },
        { id: '2', name: 'Device 2' }
      ];

      mockRequestLEScan.mockResolvedValue(mockScan);
      const { result } = renderHook(() => useScan());
      
      // Add some devices first
      let advertisementCallback: any;
      (navigator as any).bluetooth.addEventListener.mockImplementation((event: string, callback: any) => {
        if (event === 'advertisementreceived') {
          advertisementCallback = callback;
        }
      });

      await act(async () => {
        await result.current.start();
      });

      act(() => {
        devices.forEach(device => {
          advertisementCallback?.({ device, rssi: -50 });
        });
      });

      expect(result.current.devices).toHaveLength(2);

      // Clear devices
      act(() => {
        result.current.clear();
      });

      expect(result.current.devices).toEqual([]);
    });

    it('should clear error when clearing devices', async () => {
      const error = new Error('Test error');
      mockRequestLEScan.mockRejectedValueOnce(error);
      const { result } = renderHook(() => useScan());

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.error).toBeInstanceOf(Error);

      act(() => {
        result.current.clear();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup on unmount', async () => {
      mockScan.active = true;
      mockRequestLEScan.mockResolvedValue(mockScan);
      
      (useBeacio as jest.Mock).mockReturnValue({
        requestLEScan: mockRequestLEScan,
        stopScan: jest.fn()
      });

      const { result, unmount } = renderHook(() => useScan());
      
      await act(async () => {
        await result.current.start();
      });

      unmount();

      expect(mockStopScan).toHaveBeenCalled();
      expect((navigator as any).bluetooth.removeEventListener).toHaveBeenCalled();
    });
  });
});

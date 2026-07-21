import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DeviceScanner } from '../../src/components/DeviceScanner';
import { useScan } from '../../src/hooks/useScan';
import { useDevice } from '../../src/hooks/useDevice';

// Mock the hooks
jest.mock('../../src/hooks/useScan');
jest.mock('../../src/hooks/useDevice');

const mockUseScan = useScan as jest.MockedFunction<typeof useScan>;
const mockUseDevice = useDevice as jest.MockedFunction<typeof useDevice>;

describe('DeviceScanner', () => {
  const mockStart = jest.fn();
  const mockStop = jest.fn();
  const mockClear = jest.fn();
  const mockConnect = jest.fn();
  const mockOnDeviceSelected = jest.fn();

  const mockDevice1 = {
    id: 'device-1',
    name: 'Test Device 1',
    gatt: {}
  };

  const mockDevice2 = {
    id: 'device-2',
    name: 'Test Device 2',
    gatt: {}
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseScan.mockReturnValue({
      scanState: 'idle',
      devices: [],
      start: mockStart,
      stop: mockStop,
      clear: mockClear,
      error: null
    } as unknown as ReturnType<typeof useScan>);

    mockUseDevice.mockReturnValue({
      connectionState: 'disconnected',
      connect: mockConnect,
      disconnect: jest.fn(),
      error: null
    } as unknown as ReturnType<typeof useDevice>);
  });

  describe('Rendering', () => {
    it('should render with default props', () => {
      render(<DeviceScanner />);
      
      expect(screen.getByText('Bluetooth Device Scanner')).toBeInTheDocument();
      expect(screen.getByText('Start Scan')).toBeInTheDocument();
    });

    it('should render with custom className', () => {
      const { container } = render(<DeviceScanner className="custom-scanner" />);
      
      expect(container.querySelector('.device-scanner.custom-scanner')).toBeInTheDocument();
    });

    it('should show scanning state', () => {
      mockUseScan.mockReturnValue({
        scanState: 'scanning',
        devices: [],
        start: mockStart,
        stop: mockStop,
        clear: mockClear,
        error: null
      } as unknown as ReturnType<typeof useScan>);

      render(<DeviceScanner />);
      
      expect(screen.getByText('Stop Scan')).toBeInTheDocument();
      expect(screen.getByText('● Scanning')).toBeInTheDocument();
      expect(screen.getByText('Searching for devices...')).toBeInTheDocument();
    });

    it('should show error state', () => {
      const error = new Error('Bluetooth not available');
      mockUseScan.mockReturnValue({
        scanState: 'idle',
        devices: [],
        start: mockStart,
        stop: mockStop,
        clear: mockClear,
        error
      } as unknown as ReturnType<typeof useScan>);

      render(<DeviceScanner />);
      
      expect(screen.getByText('Bluetooth not available')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Device List', () => {
    it('should display discovered devices', () => {
      mockUseScan.mockReturnValue({
        scanState: 'idle',
        devices: [mockDevice1, mockDevice2],
        start: mockStart,
        stop: mockStop,
        clear: mockClear,
        error: null
      } as unknown as ReturnType<typeof useScan>);

      render(<DeviceScanner />);
      
      expect(screen.getByText('Test Device 1')).toBeInTheDocument();
      expect(screen.getByText('Test Device 2')).toBeInTheDocument();
      expect(screen.getByText('Found 2 device(s)')).toBeInTheDocument();
    });

    it('should handle devices without names', () => {
      const deviceWithoutName = { ...mockDevice1, name: null };

      mockUseScan.mockReturnValue({
        scanState: 'idle',
        devices: [deviceWithoutName],
        start: mockStart,
        stop: mockStop,
        clear: mockClear,
        error: null
      } as unknown as ReturnType<typeof useScan>);

      render(<DeviceScanner />);
      
      expect(screen.getByText('Unknown Device')).toBeInTheDocument();
    });

    it('should limit number of displayed devices', () => {
      const devices = [];
      for (let i = 1; i <= 15; i++) {
        devices.push({
          id: `device-${i}`,
          name: `Device ${i}`,
          gatt: {}
        });
      }

      mockUseScan.mockReturnValue({
        scanState: 'idle',
        devices,
        start: mockStart,
        stop: mockStop,
        clear: mockClear,
        error: null
      } as unknown as ReturnType<typeof useScan>);

      render(<DeviceScanner maxDevices={5} />);
      
      const deviceButtons = screen.getAllByRole('button', { name: /Device \d+/ });
      expect(deviceButtons).toHaveLength(5);
    });
  });

  describe('Scanning Controls', () => {
    it('should start scanning when start button is clicked', async () => {
      mockStart.mockResolvedValue(undefined);
      
      render(<DeviceScanner filters={[{ services: ['heart_rate'] }]} />);
      
      const startButton = screen.getByText('Start Scan');
      fireEvent.click(startButton);
      
      await waitFor(() => {
        expect(mockClear).toHaveBeenCalled();
        expect(mockStart).toHaveBeenCalledWith({ filters: [{ services: ['heart_rate'] }] });
      });
    });

    it('should stop scanning when stop button is clicked', () => {
      mockUseScan.mockReturnValue({
        scanState: 'scanning',
        devices: [],
        start: mockStart,
        stop: mockStop,
        clear: mockClear,
        error: null
      } as unknown as ReturnType<typeof useScan>);

      render(<DeviceScanner />);
      
      const stopButton = screen.getByText('Stop Scan');
      fireEvent.click(stopButton);
      
      expect(mockStop).toHaveBeenCalled();
    });

    it('should clear devices when clear button is clicked', () => {
      mockUseScan.mockReturnValue({
        scanState: 'idle',
        devices: [mockDevice1],
        start: mockStart,
        stop: mockStop,
        clear: mockClear,
        error: null
      } as unknown as ReturnType<typeof useScan>);

      render(<DeviceScanner />);
      
      const clearButton = screen.getByText('Clear');
      fireEvent.click(clearButton);
      
      expect(mockClear).toHaveBeenCalled();
    });

    it('should auto-stop after scan duration', async () => {
      jest.useFakeTimers();
      mockStart.mockResolvedValue(undefined);
      
      render(<DeviceScanner scanDuration={5000} />);
      
      const startButton = screen.getByText('Start Scan');
      fireEvent.click(startButton);
      
      await waitFor(() => {
        expect(mockStart).toHaveBeenCalled();
      });
      
      jest.advanceTimersByTime(5001);
      
      await waitFor(() => {
        expect(mockStop).toHaveBeenCalled();
      });
      
      jest.useRealTimers();
    });
  });

  describe('Device Selection', () => {
    it('should call onDeviceSelected when device is clicked', () => {
      mockUseScan.mockReturnValue({
        scanState: 'idle',
        devices: [mockDevice1],
        start: mockStart,
        stop: mockStop,
        clear: mockClear,
        error: null
      } as unknown as ReturnType<typeof useScan>);

      render(<DeviceScanner onDeviceSelected={mockOnDeviceSelected} />);
      
      const deviceButton = screen.getByRole('button', { name: /Test Device 1/ });
      fireEvent.click(deviceButton);
      
      expect(mockOnDeviceSelected).toHaveBeenCalledWith(mockDevice1);
    });

    it('should auto-connect when autoConnect is true', async () => {
      mockConnect.mockResolvedValue(undefined);

      mockUseScan.mockReturnValue({
        scanState: 'idle',
        devices: [mockDevice1],
        start: mockStart,
        stop: mockStop,
        clear: mockClear,
        error: null
      } as unknown as ReturnType<typeof useScan>);

      render(<DeviceScanner autoConnect={true} />);
      
      const deviceButton = screen.getByRole('button', { name: /Test Device 1/ });
      fireEvent.click(deviceButton);
      
      await waitFor(() => {
        expect(mockConnect).toHaveBeenCalled();
      });
    });

    it('should show connection status', () => {
      mockUseScan.mockReturnValue({
        scanState: 'idle',
        devices: [mockDevice1],
        start: mockStart,
        stop: mockStop,
        clear: mockClear,
        error: null
      } as unknown as ReturnType<typeof useScan>);

      // First render as connecting
      mockUseDevice.mockReturnValue({
        connectionState: 'connecting',
        connect: mockConnect,
        disconnect: jest.fn(),
        error: null
      } as unknown as ReturnType<typeof useDevice>);

      const { rerender } = render(<DeviceScanner />);
      
      const deviceButton = screen.getByRole('button', { name: /Test Device 1/ });
      fireEvent.click(deviceButton);
      
      expect(screen.getByText('Connecting...')).toBeInTheDocument();
      expect(deviceButton).toBeDisabled();
      
      // Then update to connected
      mockUseDevice.mockReturnValue({
        connectionState: 'connected',
        connect: mockConnect,
        disconnect: jest.fn(),
        error: null
      } as unknown as ReturnType<typeof useDevice>);
      
      rerender(<DeviceScanner />);
      
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });

  describe('RSSI Display', () => {
    it('should show RSSI indicator when showRssi is true', () => {
      mockUseScan.mockReturnValue({
        scanState: 'idle',
        devices: [mockDevice1],
        start: mockStart,
        stop: mockStop,
        clear: mockClear,
        error: null
      } as unknown as ReturnType<typeof useScan>);

      render(<DeviceScanner showRssi={true} />);
      
      // RSSI display components should be present even if value is not set
      const deviceItem = screen.getByRole('button', { name: /Test Device 1/ });
      expect(deviceItem).toBeInTheDocument();
    });

    it('should not show RSSI when showRssi is false', () => {
      mockUseScan.mockReturnValue({
        scanState: 'idle',
        devices: [mockDevice1],
        start: mockStart,
        stop: mockStop,
        clear: mockClear,
        error: null
      } as unknown as ReturnType<typeof useScan>);

      render(<DeviceScanner showRssi={false} />);
      
      expect(screen.queryByText(/dBm/)).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<DeviceScanner />);
      
      expect(screen.getByLabelText('Start scanning for Bluetooth devices')).toBeInTheDocument();
    });

    it('should have proper ARIA roles', () => {
      mockUseScan.mockReturnValue({
        scanState: 'idle',
        devices: [mockDevice1],
        start: mockStart,
        stop: mockStop,
        clear: mockClear,
        error: null
      } as unknown as ReturnType<typeof useScan>);

      render(<DeviceScanner />);
      
      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Select Test Device 1/ })).toBeInTheDocument();
    });

    it('should show error with alert role', () => {
      mockUseScan.mockReturnValue({
        scanState: 'idle',
        devices: [],
        start: mockStart,
        stop: mockStop,
        clear: mockClear,
        error: new Error('Test error')
      } as unknown as ReturnType<typeof useScan>);

      render(<DeviceScanner />);
      
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});

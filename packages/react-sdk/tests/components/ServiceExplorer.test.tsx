import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ServiceExplorer } from '../../src/components/ServiceExplorer';
import { useDevice } from '../../src/hooks/useDevice';
import { useCharacteristic } from '../../src/hooks/useCharacteristic';
import type { BeacioDevice } from '@beacio/core';

// Smoke suite: one test per major branch (no-device / disconnected / connecting /
// connected+services / expanded characteristics / read / write / notify / errors /
// empty & unknown-UUID fallbacks). Exhaustive per-permutation cases were removed
// deliberately (simplification T1-I1) — this file is a smoke net, not a spec.

jest.mock('../../src/hooks/useDevice');
jest.mock('../../src/hooks/useCharacteristic');

const mockUseDevice = useDevice as jest.MockedFunction<typeof useDevice>;
const mockUseCharacteristic = useCharacteristic as jest.MockedFunction<typeof useCharacteristic>;

describe('ServiceExplorer', () => {
  const mockConnect = jest.fn().mockResolvedValue(undefined);
  const mockDisconnect = jest.fn().mockResolvedValue(undefined);
  const mockRead = jest.fn().mockResolvedValue(undefined);
  const mockWrite = jest.fn().mockResolvedValue(undefined);
  const mockStartNotifications = jest.fn().mockResolvedValue(undefined);
  const mockStopNotifications = jest.fn().mockResolvedValue(undefined);

  const mockDevice = { id: 'test-device-1', name: 'Test Device' };

  const charProps = (overrides: Record<string, boolean> = {}) => ({
    read: false,
    write: false,
    writeWithoutResponse: false,
    notify: false,
    indicate: false,
    broadcast: false,
    authenticatedSignedWrites: false,
    reliableWrite: false,
    writableAuxiliaries: false,
    ...overrides
  });

  const makeChar = (uuid: string, propOverrides: Record<string, boolean>) => ({
    uuid,
    properties: charProps(propOverrides),
    service: null as unknown,
    readValue: jest.fn(),
    writeValue: jest.fn(),
    writeValueWithoutResponse: jest.fn(),
    startNotifications: jest.fn(),
    stopNotifications: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    getDescriptor: jest.fn(),
    getDescriptors: jest.fn()
  });

  const makeService = (uuid: string, chars: ReturnType<typeof makeChar>[], isPrimary = true) => ({
    uuid,
    isPrimary,
    getCharacteristics: jest.fn().mockImplementation(async function (this: unknown) {
      return chars.map(c => ({ ...c, service: this }));
    })
  });

  const mockServices = [
    makeService('0000180d-0000-1000-8000-00805f9b34fb', [ // Heart Rate
      makeChar('00002a37-0000-1000-8000-00805f9b34fb', { read: true, notify: true }), // HR Measurement
      makeChar('00002a38-0000-1000-8000-00805f9b34fb', { read: true, write: true }) // Body Sensor Location
    ]),
    makeService('0000180f-0000-1000-8000-00805f9b34fb', [ // Battery
      makeChar('00002a19-0000-1000-8000-00805f9b34fb', { read: true, notify: true }) // Battery Level
    ])
  ];

  const deviceState = (overrides: Record<string, object> = {}) => ({
    device: mockDevice,
    services: [],
    isConnected: false,
    isConnecting: false,
    connect: mockConnect,
    disconnect: mockDisconnect,
    error: null,
    forget: jest.fn(),
    watchAdvertisements: jest.fn(),
    unwatchAdvertisements: jest.fn(),
    isWatchingAdvertisements: false,
    connectionPriority: null,
    setConnectionPriority: jest.fn(),
    ...overrides
  }) as unknown as ReturnType<typeof useDevice>;

  const charState = (overrides: Record<string, object> = {}) =>
    (characteristic: { uuid: string; properties: Record<string, boolean> } | null) => ({
      characteristic,
      value: null,
      properties: characteristic?.properties || null,
      read: mockRead,
      write: mockWrite,
      writeWithoutResponse: jest.fn().mockResolvedValue(undefined),
      startNotifications: mockStartNotifications,
      stopNotifications: mockStopNotifications,
      subscribe: mockStartNotifications,
      unsubscribe: mockStopNotifications,
      isNotifying: false,
      getDescriptor: jest.fn(),
      getDescriptors: jest.fn().mockResolvedValue([]),
      error: null,
      ...overrides
    });

  const connectedState = (overrides: Record<string, unknown> = {}) =>
    deviceState({ services: mockServices, isConnected: true, ...overrides });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDevice.mockReturnValue(deviceState());
    mockUseCharacteristic.mockImplementation(charState());
  });

  describe('rendering states', () => {
    it('shows "No device selected" when there is no device', () => {
      mockUseDevice.mockReturnValue(deviceState({ device: null }));
      render(<ServiceExplorer />);
      expect(screen.getByText('No device selected')).toBeInTheDocument();
    });

    it('renders device info and disconnected status', () => {
      const { container } = render(
        <ServiceExplorer device={mockDevice as unknown as BeacioDevice} className="custom-explorer" />
      );
      expect(screen.getByText('Test Device')).toBeInTheDocument();
      expect(screen.getByText('disconnected')).toBeInTheDocument();
      expect(container.querySelector('.service-explorer.custom-explorer')).toBeInTheDocument();
    });

    it('falls back to "Unknown Device" when the device has no name', () => {
      const unnamed = { id: 'test-device-2', name: null };
      mockUseDevice.mockReturnValue(deviceState({ device: unnamed }));
      render(<ServiceExplorer device={unnamed as unknown as BeacioDevice} />);
      expect(screen.getByText('Unknown Device')).toBeInTheDocument();
    });
  });

  describe('connection management', () => {
    it('connects via the connect button and auto-connects with autoConnect', () => {
      const { unmount } = render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} />);
      fireEvent.click(screen.getByText('Connect to Device'));
      expect(mockConnect).toHaveBeenCalledTimes(1);
      unmount();

      render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} autoConnect={true} />);
      expect(mockConnect).toHaveBeenCalledTimes(2);
    });

    it('shows the connecting state', () => {
      mockUseDevice.mockReturnValue(deviceState({ isConnecting: true }));
      render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} />);
      expect(screen.getByText('Connecting...')).toBeInTheDocument();
    });

    it('disconnects via the disconnect button when connected', () => {
      mockUseDevice.mockReturnValue(connectedState());
      render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} />);
      fireEvent.click(screen.getByText('Disconnect'));
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('prompts to connect when disconnected without autoConnect', () => {
      render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} autoConnect={false} />);
      expect(
        screen.getByText('Connect to the device to explore its services and characteristics.')
      ).toBeInTheDocument();
    });
  });

  describe('service display', () => {
    it('lists services when connected and shows discovery message when empty', () => {
      mockUseDevice.mockReturnValue(connectedState());
      const { unmount } = render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} />);
      expect(screen.getByText('Found 2 service(s)')).toBeInTheDocument();
      expect(screen.getByText('Heart Rate')).toBeInTheDocument();
      expect(screen.getByText('Battery Service')).toBeInTheDocument();
      expect(screen.getAllByText('Primary')).toHaveLength(2);
      unmount();

      mockUseDevice.mockReturnValue(connectedState({ services: [] }));
      render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} />);
      expect(screen.getByText('Discovering services...')).toBeInTheDocument();
    });

    it('toggles services independently (expand/collapse)', async () => {
      mockUseDevice.mockReturnValue(connectedState());
      render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} />);

      fireEvent.click(screen.getByLabelText('Expand Heart Rate'));
      await waitFor(() => {
        expect(screen.getByText('Heart Rate Measurement')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Expand Battery Service'));
      await waitFor(() => {
        expect(screen.getByText('Battery Level')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Collapse Heart Rate'));
      expect(screen.queryByText('Heart Rate Measurement')).not.toBeInTheDocument();
      expect(screen.getByText('Battery Level')).toBeInTheDocument();
    });

    it('expands all services when expandedByDefault is true', async () => {
      mockUseDevice.mockReturnValue(connectedState());
      render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} expandedByDefault={true} />);
      await waitFor(() => {
        expect(screen.getByText('Heart Rate Measurement')).toBeInTheDocument();
        expect(screen.getByText('Body Sensor Location')).toBeInTheDocument();
        expect(screen.getByText('Battery Level')).toBeInTheDocument();
      });
    });

    it('falls back to raw UUIDs for unknown services', () => {
      mockUseDevice.mockReturnValue(
        connectedState({ services: [makeService('custom-service-uuid', [], false)] })
      );
      render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} />);
      expect(screen.getByText('custom-service-uuid')).toBeInTheDocument();
      expect(screen.getByText('Secondary')).toBeInTheDocument();
    });
  });

  describe('characteristic interactions', () => {
    beforeEach(() => {
      mockUseDevice.mockReturnValue(connectedState());
    });

    const expandHeartRate = async () => {
      fireEvent.click(screen.getByLabelText('Expand Heart Rate'));
      await waitFor(() => {
        expect(screen.getByText('Heart Rate Measurement')).toBeInTheDocument();
      });
    };

    it('shows property indicators and reports characteristic selection', async () => {
      const onSelect = jest.fn();
      render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} onCharacteristicSelect={onSelect} />);
      await expandHeartRate();

      expect(screen.getAllByText('R').length).toBeGreaterThan(0);
      expect(screen.getAllByText('N').length).toBeGreaterThan(0);
      expect(screen.getAllByText('W').length).toBeGreaterThan(0);

      fireEvent.click(screen.getByLabelText('Select characteristic Heart Rate Measurement'));
      expect(onSelect).toHaveBeenCalledWith('00002a37-0000-1000-8000-00805f9b34fb');
    });

    it('reads a characteristic and renders its value (hex + sanitized text)', async () => {
      const mockValue = new DataView(new ArrayBuffer(4));
      mockValue.setUint8(0, 0x48); // 'H'
      mockValue.setUint8(1, 0x69); // 'i'
      mockValue.setUint8(2, 0x21); // '!'
      mockValue.setUint8(3, 0x00); // control char -> '.'
      mockUseCharacteristic.mockImplementation(charState({ value: mockValue }));

      render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} />);
      await expandHeartRate();

      fireEvent.click(screen.getAllByText('Read')[0]);
      await waitFor(() => expect(mockRead).toHaveBeenCalled());
      await waitFor(() => {
        expect(screen.getByText('Value (4 bytes):')).toBeInTheDocument();
        expect(screen.getByText('Hex: 48 69 21 00')).toBeInTheDocument();
        expect(screen.getByText('Text: Hi!.')).toBeInTheDocument();
      });
    });

    it('writes encoded input and clears the field; empty input is a no-op', async () => {
      render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} />);
      await expandHeartRate();

      // Empty input: write must not fire
      fireEvent.click(screen.getAllByText('Write')[0]);
      await waitFor(() => expect(mockWrite).not.toHaveBeenCalled());

      const input = screen.getByPlaceholderText('Enter value to write') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.click(screen.getAllByText('Write')[0]);

      await waitFor(() => {
        expect(mockWrite).toHaveBeenCalled();
        expect(mockWrite.mock.calls[0][0].length).toBe(5); // 'Hello' = 5 bytes
        expect(input.value).toBe('');
      });
    });

    it('starts notifications from the notify button', async () => {
      render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} />);
      await expandHeartRate();
      fireEvent.click(screen.getByText('Start Notify'));
      await waitFor(() => expect(mockStartNotifications).toHaveBeenCalled());
    });

    it('stops notifications when already notifying', async () => {
      mockUseCharacteristic.mockImplementation(charState({ isNotifying: true }));
      render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} />);
      await expandHeartRate();
      fireEvent.click(screen.getByText('Stop Notify'));
      await waitFor(() => expect(mockStopNotifications).toHaveBeenCalled());
    });
  });

  describe('error handling', () => {
    it('renders the device error as an alert', () => {
      mockUseDevice.mockReturnValue(deviceState({ error: new Error('Connection failed') }));
      render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} />);
      expect(screen.getByRole('alert')).toHaveTextContent('Connection failed');
    });

    it('renders characteristic errors as alerts', async () => {
      mockUseDevice.mockReturnValue(connectedState());
      mockUseCharacteristic.mockImplementation(charState({ error: new Error('Read failed') }));
      render(<ServiceExplorer device={mockDevice as unknown as BeacioDevice} />);
      fireEvent.click(screen.getByLabelText('Expand Heart Rate'));
      await waitFor(() => {
        const errorAlert = screen
          .getAllByRole('alert')
          .find(alert => alert.textContent?.includes('Read failed'));
        expect(errorAlert).toBeInTheDocument();
      });
    });
  });
});

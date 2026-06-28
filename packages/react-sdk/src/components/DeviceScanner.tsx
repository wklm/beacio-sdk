import React, { useState, useCallback, useEffect } from 'react';
import type { BeacioDevice } from '@beacio/core';
import { useScan } from '../hooks/useScan';
import { useDevice } from '../hooks/useDevice';
import type { BluetoothLEScanFilter } from '../types';

interface DeviceScannerProps {
  onDeviceSelected?: (device: BeacioDevice) => void;
  filters?: BluetoothLEScanFilter[];
  className?: string;
  showRssi?: boolean;
  sortByRssi?: boolean;
  maxDevices?: number;
  scanDuration?: number;
  autoConnect?: boolean;
}

interface DeviceItemProps {
  device: BeacioDevice;
  onSelect: (device: BeacioDevice) => void;
  isConnecting?: boolean;
  isConnected?: boolean;
}

function DeviceItem({ device, onSelect, isConnecting, isConnected }: DeviceItemProps) {
  return (
    <li className="device-item" data-beacio-device="" data-beacio-state={isConnected ? 'connected' : isConnecting ? 'connecting' : 'idle'}>
      <button
        onClick={() => onSelect(device)}
        disabled={isConnecting}
        className={`device-button ${isConnected ? 'connected' : ''} ${isConnecting ? 'connecting' : ''}`}
        aria-label={`Select ${device.name ?? 'Unknown Device'}`}
        data-beacio-device-button=""
      >
        <div className="device-info" data-beacio-device-info="">
          <span className="device-name" data-beacio-device-name="">{device.name ?? 'Unknown Device'}</span>
          <span className="device-id" data-beacio-device-id="">{device.id}</span>
        </div>
        {isConnected && <span className="connection-status" data-beacio-device-status="">Connected</span>}
        {isConnecting && <span className="connection-status" data-beacio-device-status="">Connecting...</span>}
      </button>
    </li>
  );
}

/**
 * DeviceScanner - Full-featured device scanner UI component
 */
export function DeviceScanner(props: DeviceScannerProps) {
  const {
    onDeviceSelected,
    filters,
    className,
    maxDevices = 10,
    scanDuration,
    autoConnect = false,
  } = props;

  const { scanState, devices, start, stop, error, clear } = useScan();
  const [selectedDevice, setSelectedDevice] = useState<BeacioDevice | null>(null);
  const [pendingAutoConnect, setPendingAutoConnect] = useState(false);
  const { connectionState, connect } = useDevice(selectedDevice);

  const handleStartScan = useCallback(async () => {
    clear();
    await start({ filters });

    if (scanDuration) {
      setTimeout(() => {
        stop();
      }, scanDuration);
    }
  }, [start, stop, clear, filters, scanDuration]);

  const handleDeviceSelect = useCallback((device: BeacioDevice) => {
    setSelectedDevice(device);
    onDeviceSelected?.(device);
    if (autoConnect) {
      setPendingAutoConnect(true);
    }
  }, [autoConnect, onDeviceSelected]);

  // Deferred auto-connect: waits for useDevice to resolve the new device
  useEffect(() => {
    if (pendingAutoConnect && connectionState === 'disconnected') {
      setPendingAutoConnect(false);
      void connect();
    }
  }, [pendingAutoConnect, connectionState, connect]);

  const visibleDevices = devices.slice(0, maxDevices);

  return (
    <div className={`device-scanner ${className || ''}`} data-beacio-scanner="" data-beacio-state={scanState}>
      <div className="scanner-header" data-beacio-scanner-header="">
        <h2>Bluetooth Device Scanner</h2>
        <div className="scanner-status" data-beacio-scanner-status="">
          {scanState === 'scanning' && (
            <span className="status-indicator scanning">● Scanning</span>
          )}
          {scanState === 'idle' && devices.length > 0 && (
            <span className="status-indicator idle">Found {devices.length} device(s)</span>
          )}
        </div>
      </div>

      <div className="scanner-controls" data-beacio-scanner-controls="">
        {scanState === 'idle' && (
          <button 
            onClick={handleStartScan}
            className="scan-button start"
            aria-label="Start scanning for Bluetooth devices"
          >
            Start Scan
          </button>
        )}
        {scanState === 'scanning' && (
          <button 
            onClick={stop}
            className="scan-button stop"
            aria-label="Stop scanning"
          >
            Stop Scan
          </button>
        )}
        {scanState === 'idle' && devices.length > 0 && (
          <button 
            onClick={clear}
            className="scan-button clear"
            aria-label="Clear discovered devices"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="scanner-error" role="alert" data-beacio-scanner-error="">
          <span className="error-icon">⚠</span>
          <span className="error-message">{error.message}</span>
        </div>
      )}

      {visibleDevices.length > 0 && (
        <ul className="device-list" role="list" data-beacio-device-list="">
          {visibleDevices.map(device => (
            <DeviceItem
              key={device.id}
              device={device}
              onSelect={handleDeviceSelect}
              isConnecting={selectedDevice?.id === device.id && connectionState === 'connecting'}
              isConnected={selectedDevice?.id === device.id && connectionState === 'connected'}
            />
          ))}
        </ul>
      )}

      {scanState === 'scanning' && devices.length === 0 && (
        <div className="scanner-empty" data-beacio-scanner-empty="">
          <div className="scanning-animation" data-beacio-scanner-animation="">
            <div className="pulse"></div>
            <div className="pulse"></div>
            <div className="pulse"></div>
          </div>
          <p>Searching for devices...</p>
        </div>
      )}

      {scanState === 'idle' && devices.length === 0 && !error && (
        <div className="scanner-empty" data-beacio-scanner-empty="">
          <p>No devices found. Click "Start Scan" to search for Bluetooth devices.</p>
        </div>
      )}
    </div>
  );
}

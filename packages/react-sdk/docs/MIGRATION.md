# Migration Guide

## Migrating from Vanilla Web Bluetooth to @beacio/react

This guide helps you migrate existing Web Bluetooth code to use the @beacio/react SDK.

## Quick Comparison

### Vanilla Web Bluetooth

```javascript
// Request device
navigator.bluetooth.requestDevice({
  filters: [{ services: ['heart_rate'] }]
})
.then(device => {
  console.log('Device:', device.name);
  return device.gatt.connect();
})
.then(server => {
  return server.getPrimaryService('heart_rate');
})
.then(service => {
  return service.getCharacteristic('heart_rate_measurement');
})
.then(characteristic => {
  characteristic.addEventListener('characteristicvaluechanged', handleValue);
  return characteristic.startNotifications();
})
.catch(error => {
  console.error('Error:', error);
});

function handleValue(event) {
  const value = event.target.value;
  const heartRate = value.getUint8(1);
  console.log('Heart Rate:', heartRate);
}
```

### @beacio/react

```tsx
import { useBluetooth, useDevice, useNotifications } from '@beacio/react';
import type { BeacioDevice } from '@beacio/react';

function HeartRateMonitor() {
  const { requestDevice } = useBluetooth();
  const [device, setDevice] = useState<BeacioDevice | null>(null);
  const { connect } = useDevice(device);
  const { value, subscribe } = useNotifications(
    device,
    'heart_rate',
    'heart_rate_measurement',
  );
  
  const handleConnect = async () => {
    try {
      const paired = await requestDevice({
        filters: [{ services: ['heart_rate'] }]
      });
      if (paired) {
        setDevice(paired);
        await connect();
        await subscribe();
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };
  
  const heartRate = value ? value.getUint8(1) : 0;
  
  return (
    <div>
      <button onClick={handleConnect}>Connect</button>
      {heartRate > 0 && <div>Heart Rate: {heartRate} BPM</div>}
    </div>
  );
}
```

## Step-by-Step Migration

### 1. Installation and Setup

First, install the SDK:

```bash
npm install @beacio/react
```

Wrap your app with the provider:

```tsx
import { BeacioProvider } from '@beacio/react';

function App() {
  return (
    <BeacioProvider>
      <YourApp />
    </BeacioProvider>
  );
}
```

### 2. Device Discovery

#### Before (Vanilla)

```javascript
let device;

async function requestDevice() {
  try {
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['battery_service'] }],
      optionalServices: ['device_information']
    });
    console.log('Device:', device.name);
  } catch (error) {
    if (error.name === 'NotFoundError') {
      console.log('User cancelled');
    }
  }
}
```

#### After (@beacio/react)

```tsx
function Component() {
  const { requestDevice } = useBluetooth();
  const [device, setDevice] = useState<BeacioDevice | null>(null);
  
  const handleRequest = async () => {
    try {
      const paired = await requestDevice({
        filters: [{ services: ['battery_service'] }],
        optionalServices: ['device_information']
      });
      if (paired) {
        setDevice(paired);
        console.log('Device:', paired.name);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        console.log('User cancelled');
      }
    }
  };
}
```

### 3. Connection Management

#### Before (Vanilla)

```javascript
let server;

async function connect() {
  try {
    server = await device.gatt.connect();
    console.log('Connected');
    
    device.addEventListener('gattserverdisconnected', onDisconnected);
  } catch (error) {
    console.error('Connection failed:', error);
  }
}

function onDisconnected() {
  console.log('Disconnected');
  // Reconnection logic
  setTimeout(() => connect(), 5000);
}
```

#### After (@beacio/react)

```tsx
function Component({ device }: { device: BeacioDevice | null }) {
  const { connect, disconnect, isConnected } = useDevice(device, {
    autoReconnect: true,
    reconnectAttempts: 5,
  });
  
  useEffect(() => {
    if (device && !isConnected) {
      connect();
    }
  }, [device]);
  
  // Auto-reconnection is handled by useDevice when `autoReconnect` is set.
}
```

### 4. Service Discovery

#### Before (Vanilla)

```javascript
let service;
let characteristics = [];

async function discoverServices() {
  try {
    // Get specific service
    service = await server.getPrimaryService('heart_rate');
    
    // Get all characteristics
    characteristics = await service.getCharacteristics();
    
    console.log('Found characteristics:', characteristics.length);
  } catch (error) {
    console.error('Service discovery failed:', error);
  }
}
```

#### After (@beacio/react)

```tsx
function Component({ device }: { device: BeacioDevice | null }) {
  const { services } = useDevice(device);
  
  // Services are automatically discovered after connection
  useEffect(() => {
    if (services.length > 0) {
      console.log('Found services:', services.length);
      
      // Get specific service
      const heartRateService = services.find(s => s.uuid === 'heart_rate');
    }
  }, [services]);
}
```

### 5. Reading Characteristics

#### Before (Vanilla)

```javascript
async function readBatteryLevel() {
  try {
    const service = await server.getPrimaryService('battery_service');
    const characteristic = await service.getCharacteristic('battery_level');
    const value = await characteristic.readValue();
    const batteryLevel = value.getUint8(0);
    console.log('Battery:', batteryLevel + '%');
  } catch (error) {
    console.error('Read failed:', error);
  }
}
```

#### After (@beacio/react)

```tsx
function BatteryLevel({ device }: { device: BeacioDevice | null }) {
  const { value, read, error } = useCharacteristic(
    device,
    'battery_service',
    'battery_level',
  );
  
  useEffect(() => {
    read();
  }, []);
  
  if (error) {
    return <div>Error: {error.message}</div>;
  }
  
  const batteryLevel = value ? value.getUint8(0) : null;
  
  return (
    <div>
      {batteryLevel !== null ? `Battery: ${batteryLevel}%` : 'Loading...'}
      <button onClick={() => read()}>Refresh</button>
    </div>
  );
}
```

### 6. Writing Characteristics

#### Before (Vanilla)

```javascript
async function setLightColor(r, g, b) {
  try {
    const service = await server.getPrimaryService('light_service');
    const characteristic = await service.getCharacteristic('light_color');
    
    const data = new Uint8Array([r, g, b]);
    await characteristic.writeValue(data);
    
    console.log('Color set');
  } catch (error) {
    console.error('Write failed:', error);
  }
}
```

#### After (@beacio/react)

```tsx
function LightControl({ device }: { device: BeacioDevice | null }) {
  const { write, error } = useCharacteristic(
    device,
    'light_service',
    'light_color',
  );
  const [isWriting, setIsWriting] = useState(false);
  
  const setColor = async (r: number, g: number, b: number) => {
    setIsWriting(true);
    try {
      await write(new Uint8Array([r, g, b]));
    } finally {
      setIsWriting(false);
    }
  };
  
  return (
    <div>
      <button onClick={() => setColor(255, 0, 0)} disabled={isWriting}>
        Red
      </button>
      <button onClick={() => setColor(0, 255, 0)} disabled={isWriting}>
        Green
      </button>
      <button onClick={() => setColor(0, 0, 255)} disabled={isWriting}>
        Blue
      </button>
      {error && <div>Error: {error.message}</div>}
    </div>
  );
}
```

### 7. Notifications

#### Before (Vanilla)

```javascript
let characteristic;

async function startNotifications() {
  try {
    const service = await server.getPrimaryService('heart_rate');
    characteristic = await service.getCharacteristic('heart_rate_measurement');
    
    characteristic.addEventListener('characteristicvaluechanged', handleNotification);
    await characteristic.startNotifications();
    
    console.log('Notifications started');
  } catch (error) {
    console.error('Failed to start notifications:', error);
  }
}

function handleNotification(event) {
  const value = event.target.value;
  const heartRate = value.getUint8(1);
  updateUI(heartRate);
}

async function stopNotifications() {
  if (characteristic) {
    characteristic.removeEventListener('characteristicvaluechanged', handleNotification);
    await characteristic.stopNotifications();
  }
}
```

#### After (@beacio/react)

```tsx
function HeartRateMonitor({ device }: { device: BeacioDevice | null }) {
  const { 
    value, 
    isSubscribed, 
    subscribe, 
    unsubscribe, 
    history 
  } = useNotifications(device, 'heart_rate', 'heart_rate_measurement');
  
  useEffect(() => {
    subscribe();
    return () => {
      unsubscribe();
    };
  }, []);
  
  const heartRate = value ? value.getUint8(1) : 0;
  
  return (
    <div>
      <div>Heart Rate: {heartRate} BPM</div>
      <div>Status: {isSubscribed ? 'Monitoring' : 'Not monitoring'}</div>
      <button onClick={isSubscribed ? unsubscribe : subscribe}>
        {isSubscribed ? 'Stop' : 'Start'} Monitoring
      </button>
      <div>
        History:
        {history.map((entry, i) => (
          <div key={i}>
            {entry.value.getUint8(1)} BPM at {entry.timestamp.toLocaleTimeString()}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 8. Scanning

#### Before (Vanilla)

```javascript
let scan;

async function startScan() {
  try {
    scan = await navigator.bluetooth.requestLEScan({
      filters: [{ namePrefix: 'Device' }],
      keepRepeatedDevices: true
    });
    
    navigator.bluetooth.addEventListener('advertisementreceived', handleAdvertisement);
    
    // Stop after 10 seconds
    setTimeout(() => stopScan(), 10000);
  } catch (error) {
    console.error('Scan failed:', error);
  }
}

function handleAdvertisement(event) {
  console.log('Found:', event.device.name, 'RSSI:', event.rssi);
}

function stopScan() {
  if (scan) {
    scan.stop();
    navigator.bluetooth.removeEventListener('advertisementreceived', handleAdvertisement);
  }
}
```

#### After (@beacio/react)

```tsx
function DeviceScanner() {
  const { scanState, devices, start, stop } = useScan();
  const isScanning = scanState === 'scanning';
  
  const startScan = () =>
    start({
      filters: [{ namePrefix: 'Device' }],
      keepRepeatedDevices: true,
      timeout: 10000  // Auto-stop after 10 seconds
    });
  
  return (
    <div>
      <button onClick={isScanning ? stop : startScan}>
        {isScanning ? 'Stop Scan' : 'Start Scan'}
      </button>
      <div>
        {devices.map(device => (
          <div key={device.id}>
            {device.name || 'Unknown'}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Common Patterns

### Error Handling

#### Before (Vanilla)

```javascript
try {
  const device = await navigator.bluetooth.requestDevice(options);
  // ... more code
} catch (error) {
  if (error.name === 'NotFoundError') {
    // User cancelled
  } else if (error.name === 'NotAllowedError') {
    // Permission denied
  } else if (error.name === 'NetworkError') {
    // Connection failed
  } else {
    // Unknown error
  }
}
```

#### After (@beacio/react)

```tsx
function Component() {
  const { requestDevice } = useBluetooth();
  const [error, setError] = useState<Error>();
  
  const connect = async () => {
    try {
      const device = await requestDevice(options);
      // ... more code
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      
      switch (error.name) {
        case 'NotFoundError':
          // User cancelled
          break;
        case 'NotAllowedError':
          // Permission denied
          break;
        case 'NetworkError':
          // Connection failed
          break;
      }
    }
  };
  
  // Or use the built-in error states
  const { error: deviceError } = useDevice(device);
  
  if (deviceError) {
    return <ErrorDisplay error={deviceError} />;
  }
}
```

### State Management

#### Before (Vanilla)

```javascript
// Global state
let device = null;
let server = null;
let services = [];
let isConnected = false;

// Manual state updates
function updateConnectionState(connected) {
  isConnected = connected;
  updateUI();
}
```

#### After (@beacio/react)

```tsx
// State is managed by hooks
function Component({ device }: { device: BeacioDevice | null }) {
  const { isConnected, services } = useDevice(device);
  
  // React handles UI updates automatically
  return (
    <div>
      {isConnected ? 'Connected' : 'Disconnected'}
      Services: {services.length}
    </div>
  );
}
```

### Cleanup

#### Before (Vanilla)

```javascript
function cleanup() {
  // Remove all event listeners
  if (characteristic) {
    characteristic.removeEventListener('characteristicvaluechanged', handler);
  }
  if (device) {
    device.removeEventListener('gattserverdisconnected', disconnectHandler);
  }
  
  // Stop notifications
  if (characteristic && characteristic.service.device.gatt.connected) {
    characteristic.stopNotifications();
  }
  
  // Disconnect
  if (server && server.connected) {
    server.disconnect();
  }
}

window.addEventListener('beforeunload', cleanup);
```

#### After (@beacio/react)

```tsx
// Cleanup is automatic with React hooks
function Component({ device }: { device: BeacioDevice | null }) {
  const { disconnect } = useDevice(device);
  const { unsubscribe } = useNotifications(
    device,
    'heart_rate',
    'heart_rate_measurement',
  );
  
  // Cleanup happens automatically on unmount
  useEffect(() => {
    return () => {
      // Optional: explicit cleanup if needed
      disconnect();
      unsubscribe();
    };
  }, []);
}
```

## Advanced Migration

### Custom Service Classes

#### Before (Vanilla)

```javascript
class HeartRateService {
  constructor(server) {
    this.server = server;
    this.service = null;
    this.measurementChar = null;
  }
  
  async init() {
    this.service = await this.server.getPrimaryService('heart_rate');
    this.measurementChar = await this.service.getCharacteristic('heart_rate_measurement');
  }
  
  async startMonitoring(callback) {
    this.measurementChar.addEventListener('characteristicvaluechanged', (e) => {
      callback(e.target.value.getUint8(1));
    });
    await this.measurementChar.startNotifications();
  }
}
```

#### After (@beacio/react)

```tsx
// Create a custom hook instead
function useHeartRateService(device: BeacioDevice | null) {
  const { services } = useDevice(device);
  const { value, subscribe } = useNotifications(
    device,
    'heart_rate',
    'heart_rate_measurement',
  );
  
  const heartRate = useMemo(() => {
    return value ? value.getUint8(1) : null;
  }, [value]);
  
  const startMonitoring = useCallback(() => {
    subscribe();
  }, [subscribe]);
  
  return {
    heartRate,
    startMonitoring,
    isMonitoring: value !== null
  };
}
```

### Promise Chains to Async/Await

#### Before (Vanilla)

```javascript
navigator.bluetooth.requestDevice(options)
  .then(device => {
    this.device = device;
    return device.gatt.connect();
  })
  .then(server => {
    this.server = server;
    return server.getPrimaryService('battery_service');
  })
  .then(service => {
    return service.getCharacteristic('battery_level');
  })
  .then(characteristic => {
    return characteristic.readValue();
  })
  .then(value => {
    console.log('Battery:', value.getUint8(0));
  })
  .catch(error => {
    console.error('Error:', error);
  });
```

#### After (@beacio/react)

```tsx
function Component() {
  const { requestDevice } = useBluetooth();
  const [device, setDevice] = useState<BeacioDevice | null>(null);
  const { connect } = useDevice(device);
  const { read } = useCharacteristic(device, 'battery_service', 'battery_level');
  
  const getBatteryLevel = async () => {
    try {
      const paired = await requestDevice(options);
      setDevice(paired);
      await connect();
      const value = await read();
      if (value) {
        console.log('Battery:', value.getUint8(0));
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };
}
```

## Testing Migration

### Before (Vanilla)

```javascript
// Mocking navigator.bluetooth
global.navigator.bluetooth = {
  requestDevice: jest.fn(),
  // ... more mocks
};

test('connects to device', async () => {
  const mockDevice = { 
    gatt: { 
      connect: jest.fn() 
    } 
  };
  navigator.bluetooth.requestDevice.mockResolvedValue(mockDevice);
  
  await connectToDevice();
  
  expect(mockDevice.gatt.connect).toHaveBeenCalled();
});
```

### After (@beacio/react)

```tsx
import { render, screen } from '@testing-library/react';
import { BeacioProvider, useBluetooth, useDevice } from '@beacio/react';

// Mock the @beacio/react hooks
jest.mock('@beacio/react', () => ({
  BeacioProvider: ({ children }) => children,
  useBluetooth: () => ({
    requestDevice: jest.fn(),
    isAvailable: true
  }),
  useDevice: () => ({
    connect: jest.fn(),
    isConnected: false
  })
}));

test('connects to device', async () => {
  const { getByText } = render(
    <BeacioProvider>
      <Component />
    </BeacioProvider>
  );
  
  fireEvent.click(getByText('Connect'));
  
  expect(useBluetooth().requestDevice).toHaveBeenCalled();
});
```

## Troubleshooting Migration Issues

### Issue: "Cannot read property 'requestDevice' of undefined"

**Solution:** Make sure your component is wrapped with `BeacioProvider`.

### Issue: "Hook called outside of provider"

**Solution:** All components using the `@beacio/react` hooks must be inside the provider tree.

### Issue: "Device is null"

**Solution:** Device operations are async. Use proper loading states:

```tsx
const { device, isConnected } = useDevice(pairedDevice);

if (!device) return <div>Loading...</div>;
if (!isConnected) return <div>Connecting...</div>;
```

### Issue: "Notifications not updating"

**Solution:** Make sure you're subscribed:

```tsx
const { value, isSubscribed, subscribe } = useNotifications(
  device,
  'heart_rate',
  'heart_rate_measurement',
);

useEffect(() => {
  if (!isSubscribed) {
    subscribe();
  }
}, [isSubscribed]);
```

## Best Practices After Migration

1. **Use TypeScript** - Get full type safety
2. **Leverage hooks** - Don't fight React's model
3. **Handle loading states** - Operations are async
4. **Use error boundaries** - Catch and display errors gracefully
5. **Optimize re-renders** - Use `useMemo` and `useCallback`
6. **Clean up properly** - Hooks handle most cleanup automatically
7. **Test thoroughly** - Use React Testing Library

## Need Help?

- Check the [API Documentation](./API.md)
- See [Examples](../../../examples/heart-rate-monitor/)
- File an [Issue](https://github.com/wklm/beacio-sdk/issues)
- Read the [FAQ](./FAQ.md)
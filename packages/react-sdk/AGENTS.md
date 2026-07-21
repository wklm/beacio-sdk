# @beacio/react — Agent Instructions

## What this package does
React SDK for Web Bluetooth. Provides `BeacioProvider` (context), hooks for
device discovery/connection/notifications, and pre-built UI components.
Optionally integrates with `@beacio/core`, `@beacio/core/profiles`, and
`@beacio/core/detect`.

## Safari iOS Support
Add `import '@beacio/core/auto'` to your app entry point for transparent Safari iOS support. This is separate from the React hooks below.

## Provider setup
Wrap your app in `BeacioProvider`. All hooks require this context.

```tsx
import { BeacioProvider } from '@beacio/react';

function App() {
  return (
    <BeacioProvider config={{ apiKey: 'wbl_xxxxx' }}>
      <MyBLEApp />
    </BeacioProvider>
  );
}
```

Config options: `autoConnect`, `cacheTimeout`, `retryAttempts`, `apiKey`,
`operatorName`, `appStoreUrl`. The `apiKey` enables automatic iOS Safari
install prompts via `@beacio/core/detect`.

## Hook reference

| Hook | Purpose | Key returns |
|---|---|---|
| `useBluetooth()` | Main entry — availability, device requests | `isAvailable`, `isSupported`, `requestDevice`, `getDevices`, `error` |
| `useDevice(device)` | Manage a specific device | `isConnected`, `isConnecting`, `connect`, `disconnect`, `services`, `error` |
| `useScan()` | BLE scanning | `startScan`, `stopScan`, `isScanning`, `devices` |
| `useProfile(ProfileClass, device)` | Bind a `@beacio/core/profiles` profile to a device | `profile`, `connect`, `error` |
| `useNotifications()` | Characteristic notifications | subscribe/unsubscribe helpers |
| `useCharacteristic()` | Read/write a single characteristic | `read`, `write`, `value`, `error` |
| `useConnection()` | Connection state management | connection lifecycle helpers |

## Core pattern
```tsx
import { BeacioProvider, useBluetooth, useDevice, useProfile } from '@beacio/react';
import { HeartRateProfile } from '@beacio/core/profiles';

function HeartRateMonitor() {
  const { requestDevice } = useBluetooth();
  const [rawDevice, setRawDevice] = useState(null);
  const { isConnected, connect } = useDevice(rawDevice);
  const { profile } = useProfile(HeartRateProfile, rawDevice);

  const handleScan = async () => {
    const device = await requestDevice({
      filters: [{ services: ['heart_rate'] }]
    });
    if (device) setRawDevice(device);
  };

  return (
    <div>
      <button onClick={handleScan}>Find HR Monitor</button>
      {rawDevice && !isConnected && <button onClick={connect}>Connect</button>}
    </div>
  );
}
```

## Pre-built components
- `<DeviceScanner />` — device discovery UI
- `<ServiceExplorer />` — browse GATT services/characteristics
- `<InstallationWizard />` — iOS extension install guide

## Common Mistakes

### User Gesture Required — useEffect Trap (Safari iOS)
`requestDevice()` MUST be called from a user gesture (click/tap handler). Safari iOS blocks Bluetooth requests without a user gesture. The #1 mistake in React is calling `requestDevice` inside `useEffect` — this silently fails.

```tsx
// CORRECT — triggered by user click
function Scanner() {
  const { requestDevice } = useBluetooth();
  return (
    <button onClick={async () => {
      const device = await requestDevice({ filters: [{ services: ['heart_rate'] }] });
    }}>Connect</button>
  );
}

// WRONG — silently fails on Safari iOS (no user gesture)
function Scanner() {
  const { requestDevice } = useBluetooth();
  useEffect(() => {
    requestDevice({ filters: [{ services: ['heart_rate'] }] }); // SecurityError
  }, []);
  return <div>Scanning...</div>;
}
```

### Use Hooks, Not Raw Web APIs
```tsx
// CORRECT — use React hooks
function HeartRate() {
  const { requestDevice } = useBluetooth()
  const [rawDevice, setRawDevice] = useState(null)
  const { profile } = useProfile(HeartRateProfile, rawDevice)
  return <div>{profile?.data?.heartRate} BPM</div>
}

// WRONG — raw addEventListener in React
useEffect(() => {
  navigator.bluetooth.addEventListener('characteristicvaluechanged', ...)
  // memory leak, no cleanup, wrong API
}, [])
```

### Provider Must Wrap Hooks
```tsx
// CORRECT — Provider at app root
function App() {
  return (
    <BeacioProvider>
      <MyBLEComponent />
    </BeacioProvider>
  )
}

// WRONG — hook without Provider
function App() {
  const { isAvailable } = useBluetooth() // throws: no BeacioProvider
  return <div>{isAvailable ? 'Yes' : 'No'}</div>
}
```

## DO
- Wrap your app in `<BeacioProvider>` before using any hooks
- Use `useProfile` for standard device types (heart rate, battery) instead of manual GATT calls
- Clean up subscriptions — hooks handle this automatically on unmount
- Use `useBluetooth().isAvailable` to conditionally render BLE UI
- Pass `apiKey` in config to enable iOS Safari extension install prompts

## DO NOT
- Do not call `useBeacio()` or any hook outside of `<BeacioProvider>` — throws an error
- Do not use raw `addEventListener` for BLE events — use the provided hooks
- Do not forget the Provider — all hooks throw if context is missing
- Do not mix `useDevice` manual connection with `useProfile` connection — pick one approach

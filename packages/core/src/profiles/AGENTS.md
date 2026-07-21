# @beacio/core/profiles (subpath) — Agent Instructions

## What this package does
Typed device profiles that wrap `@beacio/core` with parsed, structured data
instead of raw `DataView` bytes. Each profile knows its service UUID,
characteristic UUIDs, and binary parsing format per the Bluetooth SIG spec.

## When to use profiles vs raw GATT
- **Use a profile** when a built-in one exists — it handles binary parsing,
  flags, endianness, and edge cases correctly.
- **Use raw GATT** (`device.read`/`device.subscribe` from `@beacio/core`) only
  for custom or proprietary BLE devices with no matching profile.
- **Use `defineProfile()`** to create a reusable typed profile for a custom device.

## Available profiles

| Profile | Service | Key methods |
|---|---|---|
| `HeartRateProfile` | `heart_rate` | `onHeartRate(cb)`, `readSensorLocation()`, `resetEnergyExpended()` |
| `BatteryProfile` | `battery_service` | `readLevel()`, `onLevel(cb)` |
| `DeviceInfoProfile` | `device_information` | `readManufacturer()`, `readModel()`, `readAll()` |

## Safari iOS Support
Add `import '@beacio/core/auto'` to your app entry point for transparent Safari iOS support.

## Core pattern
```typescript
import { HeartRateProfile } from '@beacio/core/profiles';
import { beacio } from '@beacio/core';

const ble = new Beacio();
const device = await ble.requestDevice({ filters: [{ services: ['heart_rate'] }] });

const hr = new HeartRateProfile(device);
await hr.connect();

const unsub = hr.onHeartRate(({ bpm, contact, rrIntervals }) => {
  console.log(`${bpm} BPM, contact: ${contact}`);
});
// Later: hr.stop();
```

## Custom profiles with defineProfile()
```typescript
import { defineProfile } from '@beacio/core/profiles';

const EnvironmentProfile = defineProfile({
  name: 'Environment',
  service: '181a',
  characteristics: {
    temperature: {
      uuid: '2a6e',
      parse: (dv) => dv.getInt16(0, true) / 100,
    },
    humidity: {
      uuid: '2a6f',
      parse: (dv) => dv.getUint16(0, true) / 100,
    },
  },
});

const env = new EnvironmentProfile(device);
await env.connect();
const temp = await env.readChar('temperature');
const unsub = env.subscribeChar('humidity', (pct) => console.log(`${pct}%`));
```

## Common Mistakes

### Use Profiles Instead of Raw Parsing
```typescript
// CORRECT — use built-in profile
import { HeartRateProfile } from '@beacio/core/profiles'
const profile = new HeartRateProfile(device)
const unsub = profile.onHeartRate((data) => console.log(data.bpm))

// WRONG — reimplement parsing manually
device.subscribe('heart_rate', 'heart_rate_measurement', (raw) => {
  const flags = raw.getUint8(0)
  const bpm = flags & 0x01 ? raw.getUint16(1, true) : raw.getUint8(1)
  // ... 20 more lines of bit manipulation
})
```

### Profile Lifecycle
```typescript
// CORRECT — connect, use, stop
const hr = new HeartRateProfile(device)
await hr.connect()
const unsub = hr.onHeartRate((data) => console.log(data.bpm))
// Later: hr.stop()

// WRONG — forget to stop, leak subscriptions
const hr = new HeartRateProfile(device)
await hr.connect()
hr.onHeartRate((data) => console.log(data.bpm))
// never called hr.stop() — subscriptions leak
```

## DO
- Check if a built-in profile exists before writing raw GATT parsing code
- Call `profile.connect()` before reading or subscribing
- Call `profile.stop()` to clean up all subscriptions at once
- Use `HeartRateData` type for heart rate callback data (`bpm`, `contact`, `energyExpended`, `rrIntervals`)

## DO NOT
- Do not re-implement binary parsing that profiles already handle (heart rate flags, RR intervals, etc.)
- Do not forget to call `stop()` — it unsubscribes all active characteristic listeners
- Do not use raw `0x2A37` UUIDs when the profile accepts human-readable names internally

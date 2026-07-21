---
name: beacio
description: Web Bluetooth SDK — scan, connect, read/write BLE devices from web apps (iOS Safari + Chrome)
trigger: bluetooth ble web-bluetooth ios safari navigator.bluetooth requestDevice beacio beacio bluetooth-scan gatt connect-device heart-rate-monitor ble-profile bluetooth-low-energy
---

# beacio SDK Integration

## What this does
beacio is a Web Bluetooth SDK for web apps. It works on Chrome natively and on iOS Safari via a companion app + Safari extension. The SDK provides scan, connect, read/write/subscribe operations for BLE devices.

## Package Routing Table

| You want to... | Install | Scope |
|---|---|---|
| Scan, connect, read/write BLE devices | `npm install @beacio/core` | @beacio |
| Use typed device profiles (heart rate, battery, device info) | `npm install @beacio/core` (import from `@beacio/core/profiles`) | @beacio |
| React hooks and components for BLE | `npm install @beacio/react` | @beacio |
| Detect iOS Safari extension, show install banner | `npm install @beacio/core` (import from `@beacio/core/detect`) | @beacio |
| AI agent MCP tools | `npx -y @beacio/mcp` | @beacio |
| CLI scaffolding | `npx beacio init` | @beacio |

**Scope**: All packages are published under `@beacio/*`.

## Integration Path A: New BLE Application

### Step 1: Install
```
npm install @beacio/core
```

### Step 2: Scan and connect
```typescript
import { beacio } from '@beacio/core'

const ble = new Beacio()
const device = await ble.requestDevice({
  filters: [{ services: ['heart_rate'] }]
})
await device.connect()
```

### Step 3: Read or subscribe
```typescript
const value = await device.read('heart_rate', 'heart_rate_measurement')

device.subscribe('heart_rate', 'heart_rate_measurement', (data) => {
  console.log('Heart rate:', data)
})
```

### Step 4 (optional): Use a typed profile
Profiles ship inside `@beacio/core` — no separate install; import the `/profiles` subpath:
```
npm install @beacio/core
```
```typescript
import { HeartRateProfile } from '@beacio/core/profiles'

const profile = new HeartRateProfile(device)
profile.onHeartRate((data) => {
  console.log(`BPM: ${data.heartRate}, Contact: ${data.contactDetected}`)
})
```

### Step 5 (optional): Add iOS Safari support
The detect helpers ship inside `@beacio/core` — import the `/detect` subpath:
```
npm install @beacio/core
```
```typescript
import { initBeacio } from '@beacio/core/detect'
initBeacio({})
```

## Integration Path B: Existing Web Bluetooth App (iOS Safari support)

You already have a working `navigator.bluetooth` app (Chrome/Android) and want it to run on iPhone Safari. Don't hand-edit it — run `npx beacio migrate` (or, for an agent, call the `beacio_patch_existing_app` MCP tool) to apply the three edits below in place.

### Step 1: Load the canonical `@beacio/core` bootstrap first

The classic global `browser-auto.global.js` build polyfills `navigator.bluetooth` on iOS and self-no-ops on Chrome/Android. It MUST load before any code that reads `navigator.bluetooth`:
```html
<script src="https://cdn.beacio.com/@beacio/core@1.0.0/dist/browser-auto.global.js"></script>
```

### Step 2: Add `optionalServices` to your existing iOS `requestDevice` call

iOS enforces the service allow-list strictly, so every service you later `getPrimaryService()` must be declared. Add the filtered services to `optionalServices` (additive — it does not remove any filter):
```typescript
const device = await navigator.bluetooth.requestDevice({
  filters: [{ services: ['heart_rate'] }],
  optionalServices: ['heart_rate'], // required on iOS Safari for getPrimaryService()
})
```

### Step 3: Show the install banner + verify

```
npm install @beacio/core
```
```typescript
import { initBeacio } from '@beacio/core/detect'
initBeacio({}) // React/Next.js: wrap with <BeacioProvider> from '@beacio/react'
```
```
npx beacio check
```

## MCP Server (for agent tools)
```json
{
  "beacio": {
    "command": "npx",
    "args": ["-y", "@beacio/mcp"]
  }
}
```

## Rules
- Do NOT modify existing `navigator.bluetooth` calls except to add the filtered services to `optionalServices` on iOS (the one edit Path B requires) — the extension handles the rest
- Use human-readable UUID names (`'heart_rate'`) not hex (`'0x180D'`) — the SDK resolves automatically
- Use `@beacio/core/profiles` for standard devices instead of writing raw GATT parsing code
- For React, use `@beacio/react` hooks instead of raw event listeners
- API key is optional (campaign tracking only)
- The detect snippet only shows an install banner on iOS Safari when the extension is not installed
- Works alongside native Web Bluetooth on Chrome/Android (no-op on non-iOS)
- Requires HTTPS (localhost excepted)

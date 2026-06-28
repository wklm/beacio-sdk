<p align="center">
  <a href="https://beacio.com"><img src="https://beacio.com/img/logo.png" alt="beacio" width="84" height="84"></a>
</p>

# @beacio/profiles

Pre-built BLE device profiles -- heart rate, battery, device info. Typed parsers for Bluetooth GATT characteristics.

## Install

```bash
npm install @beacio/profiles @beacio/core
```

Enable Safari iOS support in your browser entry file:

```typescript
import '@beacio/core/auto';
```

`requestDevice()` must be triggered from a direct user gesture such as a button click.

## Usage

```typescript
import { beacio } from '@beacio/core';
import { HeartRateProfile } from '@beacio/profiles';

const ble = new beacio();
const device = await ble.requestDevice({ filters: [{ services: ['heart_rate'] }] });

const hr = new HeartRateProfile(device);
await hr.connect();

hr.onHeartRate((data) => {
  console.log(`${data.bpm} BPM, contact: ${data.contact}`);
  console.log('RR intervals:', data.rrIntervals);
});

const location = await hr.readSensorLocation(); // 0=Other, 1=Chest, 2=Wrist
hr.stop(); // unsubscribe all
```

Use `stop()` as soon as the user leaves the live monitoring view. Profiles usually wrap notifications under the hood, so prompt cleanup helps both app responsiveness and battery life.

## Available profiles

- **`HeartRateProfile`** -- `onHeartRate(cb)`, `readSensorLocation()`, `resetEnergyExpended()`
- **`BatteryProfile`** -- battery level reads and notifications
- **`DeviceInfoProfile`** -- manufacturer, model, firmware, serial number
- **`defineProfile(config)`** -- factory to create custom profiles with typed parsers

## Lifecycle guidance

- Call `profile.connect()` only when the user is ready to interact with the device.
- Use a click or tap handler for the initial `requestDevice()` call.
- Call `profile.stop()` before disconnecting or when the screen unmounts.
- Prefer built-in profile callbacks over ad hoc long-lived raw notification code.

## AI agent integration

MCP server for coding agents (Claude Code, Cursor, Copilot):

```
npx -y @beacio/mcp
```

Full SDK reference for LLM context: <https://beacio.com/llms-full.txt>

## Two scopes

The **`@beacio/*`** packages (`core`, `profiles`, `react`) are the cross-browser BLE SDK -- they work on any platform with Web Bluetooth support (Chrome, Edge, iOS Safari via the extension). The **`@beacio/*`** packages (`detect`, `cli`, `mcp`, `skill`) handle iOS-specific extension detection, install prompts, and agent tooling. Use both together for full iOS Safari coverage.

/**
 * MCP Resources for Beacio
 *
 * Exposes static documentation, profiles, UUIDs, and error references
 * as MCP resources that agents can read.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerResources(server: McpServer): void {
  // Resource 1: Quick Start Guide
  server.resource(
    'beacio://docs/quickstart',
    'Beacio quick start guide — 3-step setup',
    async () => ({
      contents: [
        {
          uri: 'beacio://docs/quickstart',
          mimeType: 'text/markdown',
          text: `# Beacio Quick Start

## Step 1: Install
\`\`\`bash
npm install @beacio/core
\`\`\`

## Step 2: Connect and read
\`\`\`typescript
import '@beacio/core/auto';
import { Beacio } from '@beacio/core'

const ble = new Beacio()
const device = await ble.requestDevice({
  filters: [{ services: ['heart_rate'] }]
})
await device.connect()

// Read a value
const value = await device.read('heart_rate', 'heart_rate_measurement')

// Subscribe to notifications
const unsub = device.subscribe('heart_rate', 'heart_rate_measurement', (dv) => {
  console.log('Notification:', dv)
})

// Disconnect
device.disconnect()
\`\`\`

## Step 3: Add iOS detection (optional)
The install-banner surface ships with @beacio/core (no extra package):
\`\`\`typescript
import { initBeacio } from '@beacio/core/detect'
initBeacio({ key: 'wbl_YOUR_API_KEY' })
\`\`\`

Shows an install banner on iOS Safari if the Beacio extension is not installed.
No-op on Chrome/Android where Web Bluetooth is native.

## Requirements
- HTTPS (localhost exempted)
- \`requestDevice()\` must be called from a user gesture (button click)
- iOS: Beacio app installed + Safari extension enabled
`,
        },
      ],
    })
  );

  // Resource 2: Full API Reference
  server.resource(
    'beacio://docs/api',
    'Full API reference for @beacio/core, @beacio/core/profiles, and @beacio/react',
    async () => ({
      contents: [
        {
          uri: 'beacio://docs/api',
          mimeType: 'text/markdown',
          text: `# Beacio API Reference

## @beacio/core

### Beacio
\`\`\`typescript
const ble = new Beacio(options?: { platform?: Platform })
ble.platform       // 'ios-extension' | 'chrome' | 'unsupported'
ble.isSupported    // boolean
await ble.requestDevice(options?: RequestDeviceOptions): Promise<BeacioDevice>
await ble.getAvailability(): Promise<boolean>
\`\`\`

### BeacioDevice
\`\`\`typescript
device.id: string
device.name: string | undefined
device.connected: boolean
device.raw: BluetoothDevice

await device.connect(): Promise<void>
device.disconnect(): void
await device.read(service, characteristic): Promise<DataView>
await device.write(service, characteristic, value: BufferSource): Promise<void>
await device.writeWithoutResponse(service, characteristic, value: BufferSource): Promise<void>
device.subscribe(service, characteristic, callback: (dv: DataView) => void): () => void
device.notifications(service, characteristic): AsyncIterable<DataView>
device.on('disconnected', fn): void
device.off('disconnected', fn): void
\`\`\`

### BeacioError
\`\`\`typescript
error.code: BeacioErrorCode
error.suggestion: string
BeacioError.from(error, fallbackCode?): BeacioError
\`\`\`

### UUID Utilities
\`\`\`typescript
resolveUUID(nameOrUUID: string): string
getServiceName(uuid: string): string | undefined
getCharacteristicName(uuid: string): string | undefined
\`\`\`

## @beacio/core/profiles

### HeartRateProfile — service: heart_rate (0x180D)
- \`onHeartRate(cb: (data: HeartRateData) => void): () => void\`
- \`readSensorLocation(): Promise<number>\`
- \`resetEnergyExpended(): Promise<void>\`
- \`stop(): void\`

### BatteryProfile — service: battery_service (0x180F)
- \`readLevel(): Promise<number>\`
- \`onLevelChange(cb: (level: number) => void): () => void\`
- \`stop(): void\`

### DeviceInfoProfile — service: device_information (0x180A)
- \`readAll(): Promise<DeviceInfo>\`
- \`readModelNumber(): Promise<string>\`
- \`readSerialNumber(): Promise<string>\`
- \`readFirmwareRevision(): Promise<string>\`
- \`readHardwareRevision(): Promise<string>\`
- \`readSoftwareRevision(): Promise<string>\`
- \`readManufacturerName(): Promise<string>\`
- \`readSystemId(): Promise<DataView>\`
- \`stop(): void\`

### defineProfile(config) — create custom typed profiles
\`\`\`typescript
const P = defineProfile({
  name: string, service: string,
  characteristics: { [key]: { uuid: string, parse: (dv: DataView) => T } }
})
const p = new P(device)
await p.readChar(name): Promise<T>
p.subscribeChar(name, cb: (value: T) => void): () => void
p.stop()
\`\`\`

## @beacio/react
- \`<BeacioProvider config={...}>\` — context provider
- \`useBeacio()\` — isAvailable, requestDevice, devices, error
- \`useDevice(device)\` — connect, disconnect, isConnected, services
- \`useNotifications(char, opts?)\` — subscribe, value, history
- \`useCharacteristic()\`, \`useScan()\`, \`useConnection()\`, \`useProfile()\`
- \`<DeviceScanner />\`, \`<ServiceExplorer />\`, \`<InstallationWizard />\`
`,
        },
      ],
    })
  );

  // Resource 3: Built-in Profile Catalog
  server.resource(
    'beacio://profiles',
    'Built-in BLE profile catalog with UUIDs and methods',
    async () => ({
      contents: [
        {
          uri: 'beacio://profiles',
          mimeType: 'text/markdown',
          text: `# Built-in BLE Profiles

## HeartRateProfile
- **Package**: \`@beacio/core/profiles\`
- **Service**: \`heart_rate\` (0x180D)
- **Characteristics**:
  - \`heart_rate_measurement\` (0x2A37) — Notify: BPM, contact, energy, RR intervals
  - \`body_sensor_location\` (0x2A38) — Read: sensor location enum
  - \`heart_rate_control_point\` (0x2A39) — Write: reset energy expended
- **Methods**: \`onHeartRate(cb)\`, \`readSensorLocation()\`, \`resetEnergyExpended()\`, \`stop()\`
- **Data type**: \`HeartRateData { bpm, contact, energyExpended, rrIntervals }\`

## BatteryProfile
- **Package**: \`@beacio/core/profiles\`
- **Service**: \`battery_service\` (0x180F)
- **Characteristics**:
  - \`battery_level\` (0x2A19) — Read/Notify: 0-100%
- **Methods**: \`readLevel()\`, \`onLevelChange(cb)\`, \`stop()\`

## DeviceInfoProfile
- **Package**: \`@beacio/core/profiles\`
- **Service**: \`device_information\` (0x180A)
- **Characteristics**:
  - \`model_number_string\` (0x2A24), \`serial_number_string\` (0x2A25)
  - \`firmware_revision_string\` (0x2A26), \`hardware_revision_string\` (0x2A27)
  - \`software_revision_string\` (0x2A28), \`manufacturer_name_string\` (0x2A29)
  - \`system_id\` (0x2A23)
- **Methods**: \`readAll()\`, \`readModelNumber()\`, \`readSerialNumber()\`, etc.
- **Data type**: \`DeviceInfo { modelNumber?, serialNumber?, firmwareRevision?, ... }\`

## Custom profiles
Use \`defineProfile()\` to create typed profiles for any BLE service:
\`\`\`typescript
import { defineProfile } from '@beacio/core/profiles'
const MyProfile = defineProfile({
  name: 'My Sensor',
  service: 'my-service-uuid',
  characteristics: {
    temp: { uuid: 'char-uuid', parse: (dv) => dv.getInt16(0, true) / 100 },
  },
})
\`\`\`
`,
        },
      ],
    })
  );

  // Resource 4: Bluetooth SIG UUID Lookup
  server.resource(
    'beacio://uuids',
    'Common Bluetooth SIG service and characteristic UUID lookup table',
    async () => ({
      contents: [
        {
          uri: 'beacio://uuids',
          mimeType: 'text/markdown',
          text: `# Bluetooth SIG UUID Reference

All names below can be used directly in @beacio/core API calls (e.g. \`device.read('heart_rate', 'heart_rate_measurement')\`).
Short UUIDs like \`180d\` are also accepted and resolved to the full 128-bit form.

## Services (16-bit)

| Name | UUID | Hex |
|------|------|-----|
| generic_access (gap) | 00001800-0000-1000-8000-00805f9b34fb | 0x1800 |
| generic_attribute (gatt) | 00001801-0000-1000-8000-00805f9b34fb | 0x1801 |
| device_information | 0000180a-0000-1000-8000-00805f9b34fb | 0x180A |
| heart_rate | 0000180d-0000-1000-8000-00805f9b34fb | 0x180D |
| battery_service | 0000180f-0000-1000-8000-00805f9b34fb | 0x180F |
| health_thermometer | 00001809-0000-1000-8000-00805f9b34fb | 0x1809 |
| glucose | 00001808-0000-1000-8000-00805f9b34fb | 0x1808 |
| blood_pressure | 00001810-0000-1000-8000-00805f9b34fb | 0x1810 |
| running_speed_and_cadence | 00001814-0000-1000-8000-00805f9b34fb | 0x1814 |
| cycling_speed_and_cadence | 00001816-0000-1000-8000-00805f9b34fb | 0x1816 |
| cycling_power | 00001818-0000-1000-8000-00805f9b34fb | 0x1818 |
| location_and_navigation | 00001819-0000-1000-8000-00805f9b34fb | 0x1819 |
| environmental_sensing | 0000181a-0000-1000-8000-00805f9b34fb | 0x181A |
| body_composition | 0000181b-0000-1000-8000-00805f9b34fb | 0x181B |
| weight_scale | 0000181d-0000-1000-8000-00805f9b34fb | 0x181D |
| fitness_machine | 00001826-0000-1000-8000-00805f9b34fb | 0x1826 |
| pulse_oximeter | 00001822-0000-1000-8000-00805f9b34fb | 0x1822 |
| continuous_glucose_monitoring | 0000181f-0000-1000-8000-00805f9b34fb | 0x181F |

Names resolve from the vendored WebBluetoothCG GATT assigned-numbers registry
(\`registries/gatt_assigned_services.txt\`). Services without a registry name
(e.g. Insulin Delivery 0x183A, Media Control 0x1848) must be addressed by hex
shorthand or full 128-bit UUID.

## Characteristics (16-bit)

| Name | UUID | Hex |
|------|------|-----|
| gap.device_name | 00002a00-0000-1000-8000-00805f9b34fb | 0x2A00 |
| gap.appearance | 00002a01-0000-1000-8000-00805f9b34fb | 0x2A01 |
| battery_level | 00002a19-0000-1000-8000-00805f9b34fb | 0x2A19 |
| system_id | 00002a23-0000-1000-8000-00805f9b34fb | 0x2A23 |
| model_number_string | 00002a24-0000-1000-8000-00805f9b34fb | 0x2A24 |
| serial_number_string | 00002a25-0000-1000-8000-00805f9b34fb | 0x2A25 |
| firmware_revision_string | 00002a26-0000-1000-8000-00805f9b34fb | 0x2A26 |
| hardware_revision_string | 00002a27-0000-1000-8000-00805f9b34fb | 0x2A27 |
| software_revision_string | 00002a28-0000-1000-8000-00805f9b34fb | 0x2A28 |
| manufacturer_name_string | 00002a29-0000-1000-8000-00805f9b34fb | 0x2A29 |
| heart_rate_measurement | 00002a37-0000-1000-8000-00805f9b34fb | 0x2A37 |
| body_sensor_location | 00002a38-0000-1000-8000-00805f9b34fb | 0x2A38 |
| heart_rate_control_point | 00002a39-0000-1000-8000-00805f9b34fb | 0x2A39 |

## UUID Format
The base Bluetooth SIG UUID is: \`XXXXXXXX-0000-1000-8000-00805f9b34fb\`
- 4-hex shorthand: \`180d\` -> \`0000180d-0000-1000-8000-00805f9b34fb\`
- 8-hex shorthand: \`0000180d\` -> \`0000180d-0000-1000-8000-00805f9b34fb\`
- Full 128-bit: used as-is
`,
        },
      ],
    })
  );

  // Resource 5: Error Code Reference
  server.resource(
    'beacio://errors',
    'BeacioError code reference with causes and suggestions',
    async () => ({
      contents: [
        {
          uri: 'beacio://errors',
          mimeType: 'text/markdown',
          text: `# BeacioError Code Reference

All errors are instances of \`BeacioError\` from \`@beacio/core\`.
Each has a \`.code\` (string) and \`.suggestion\` (human-readable fix).

| Code | Cause | Suggestion |
|------|-------|------------|
| BLUETOOTH_UNAVAILABLE | Browser/device has no Bluetooth support | Check browser supports Web Bluetooth and Bluetooth is enabled |
| EXTENSION_NOT_INSTALLED | iOS Safari without Beacio extension | Install Beacio app and enable Safari extension. Use @beacio/core/detect for auto-banner |
| PERMISSION_DENIED | User denied Bluetooth permission | Request from user gesture (button click). If denied, user must re-grant in Settings |
| DEVICE_NOT_FOUND | No device matching scan filters | Check device is powered on, in range, and filters are correct |
| DEVICE_DISCONNECTED | GATT op on disconnected device | Call device.connect() first. Use device.on('disconnected', ...) for detection |
| CONNECTION_TIMEOUT | Device didn't respond to connect | Check range, ensure device is advertising |
| SERVICE_NOT_FOUND | Service UUID not present on device | Verify UUID. Include in filters or optionalServices |
| CHARACTERISTIC_NOT_FOUND | Characteristic UUID not in service | Check UUID against device spec |
| CHARACTERISTIC_NOT_READABLE | Read attempted on non-readable char | Use subscribe() if char supports Notify |
| CHARACTERISTIC_NOT_WRITABLE | Write attempted on non-writable char | Try writeWithoutResponse() or check char properties |
| CHARACTERISTIC_NOT_NOTIFIABLE | Subscribe on non-notifiable char | Use read() for polling instead |
| GATT_OPERATION_FAILED | Generic GATT error | Check connection state, retry after reconnect |
| SCAN_ALREADY_IN_PROGRESS | Duplicate requestDevice() call | Wait for current scan to complete |
| USER_CANCELLED | User dismissed device picker | Normal behavior — no action needed |
| TIMEOUT | Operation timed out | Check connectivity, retry |

## Error handling pattern
\`\`\`typescript
import '@beacio/core/auto';
import { BeacioError } from '@beacio/core'

try {
  await device.read('heart_rate', 'heart_rate_measurement')
} catch (e) {
  if (e instanceof BeacioError) {
    switch (e.code) {
      case 'DEVICE_DISCONNECTED':
        await device.connect()  // reconnect
        break
      case 'SERVICE_NOT_FOUND':
        console.error('Service not available:', e.suggestion)
        break
      default:
        console.error(\`[\${e.code}] \${e.message}\`)
    }
  }
}
\`\`\`
`,
        },
      ],
    })
  );

  // Resource 6: TypeScript Schema
  server.resource(
    'beacio://schema',
    'Full TypeScript type definitions for all @beacio/* public exports',
    async () => ({
      contents: [
        {
          uri: 'beacio://schema',
          mimeType: 'text/typescript',
          text: `// @beacio/core — Public API Types

export class Beacio {
  constructor(options?: { platform?: Platform })
  readonly platform: 'ios-extension' | 'chrome' | 'unsupported'
  readonly isSupported: boolean
  requestDevice(options?: RequestDeviceOptions): Promise<BeacioDevice>
  getAvailability(): Promise<boolean>
}

export class BeacioDevice {
  readonly id: string
  readonly name: string | undefined
  readonly connected: boolean
  readonly raw: BluetoothDevice

  connect(): Promise<void>
  disconnect(): void
  read(service: string, characteristic: string): Promise<DataView>
  write(service: string, characteristic: string, value: BufferSource): Promise<void>
  writeWithoutResponse(service: string, characteristic: string, value: BufferSource): Promise<void>
  subscribe(service: string, characteristic: string, callback: (dv: DataView) => void): () => void
  notifications(service: string, characteristic: string): AsyncIterable<DataView>
  on(event: 'disconnected', fn: () => void): void
  off(event: 'disconnected', fn: () => void): void
}

export class BeacioError extends Error {
  readonly code: BeacioErrorCode
  readonly suggestion: string
  static from(error: unknown, fallbackCode?: BeacioErrorCode): BeacioError
}

export type BeacioErrorCode =
  | 'BLUETOOTH_UNAVAILABLE' | 'EXTENSION_NOT_INSTALLED' | 'PERMISSION_DENIED'
  | 'DEVICE_NOT_FOUND' | 'DEVICE_DISCONNECTED' | 'CONNECTION_TIMEOUT'
  | 'SERVICE_NOT_FOUND' | 'CHARACTERISTIC_NOT_FOUND'
  | 'CHARACTERISTIC_NOT_READABLE' | 'CHARACTERISTIC_NOT_WRITABLE' | 'CHARACTERISTIC_NOT_NOTIFIABLE'
  | 'GATT_OPERATION_FAILED' | 'SCAN_ALREADY_IN_PROGRESS' | 'USER_CANCELLED' | 'TIMEOUT'

export function resolveUUID(nameOrUUID: string): string
export function getServiceName(uuid: string): string | undefined
export function getCharacteristicName(uuid: string): string | undefined

export interface RequestDeviceOptions {
  filters?: BluetoothLEScanFilter[]
  optionalServices?: string[]
  acceptAllDevices?: boolean
}

// @beacio/core/profiles — Public API Types

export abstract class BaseProfile {
  constructor(device: BeacioDevice)
  connect(): Promise<void>
  stop(): void
}

export class HeartRateProfile extends BaseProfile {
  onHeartRate(cb: (data: HeartRateData) => void): () => void
  readSensorLocation(): Promise<number>
  resetEnergyExpended(): Promise<void>
}

export class BatteryProfile extends BaseProfile {
  readLevel(): Promise<number>
  onLevelChange(cb: (level: number) => void): () => void
}

export class DeviceInfoProfile extends BaseProfile {
  readAll(): Promise<DeviceInfo>
  readModelNumber(): Promise<string>
  readSerialNumber(): Promise<string>
  readFirmwareRevision(): Promise<string>
  readHardwareRevision(): Promise<string>
  readSoftwareRevision(): Promise<string>
  readManufacturerName(): Promise<string>
  readSystemId(): Promise<DataView>
}

export function defineProfile<T>(config: ProfileConfig<T>): new (device: BeacioDevice) => CustomProfile<T>

export interface HeartRateData { bpm: number; contact: boolean; energyExpended?: number; rrIntervals?: number[] }
export interface DeviceInfo { modelNumber?: string; serialNumber?: string; firmwareRevision?: string; hardwareRevision?: string; softwareRevision?: string; manufacturerName?: string; systemId?: DataView }

// @beacio/react — Public API Types

export function BeacioProvider(props: { config?: BeacioConfig; children: React.ReactNode }): JSX.Element
export function useBluetooth(): { isAvailable: boolean; isSupported: boolean; requestDevice: (opts?: RequestDeviceOptions) => Promise<BeacioDevice | null>; getDevices: () => BeacioDevice[]; error: BeacioError | null }
export function useDevice(device: BeacioDevice | null): { isConnected: boolean; isConnecting: boolean; connect: () => Promise<void>; disconnect: () => void; services: string[]; error: BeacioError | null }
export function useProfile<T extends BaseProfile>(ProfileClass: new (d: BeacioDevice) => T, device: BeacioDevice | null): { profile: T | null; connect: () => Promise<void>; error: BeacioError | null }
export function useScan(): { startScan: (opts?: RequestDeviceOptions) => void; stopScan: () => void; isScanning: boolean; devices: BeacioDevice[] }
export function useNotifications(): { subscribe: (service: string, char: string, cb: (dv: DataView) => void) => () => void }
export function useCharacteristic(): { read: (service: string, char: string) => Promise<DataView>; write: (service: string, char: string, value: BufferSource) => Promise<void>; value: DataView | null; error: BeacioError | null }
export function useConnection(): { connect: () => Promise<void>; disconnect: () => void; isConnected: boolean }

// @beacio/core/detect — Public API Types

export function initBeacio(options: { key: string; appStoreUrl?: string; operatorName?: string }): void
export function isBeacioInstalled(): boolean
export function BeacioProvider(props: { apiKey: string; children: React.ReactNode }): JSX.Element
`,
        },
      ],
    })
  );

  // Resource 7: Changelog
  server.resource(
    'beacio://changelog',
    'Beacio version history',
    async () => ({
      contents: [
        {
          uri: 'beacio://changelog',
          mimeType: 'text/markdown',
          text: `# Beacio Changelog

## 2.0.0 (June 2026)

### @beacio/mcp
- BREAKING: resource URI scheme renamed \`ioswebble://\` → \`beacio://\` (resource identity now matches the beacio brand). Update any cached resource URIs. Identity \`com.beacio/mcp\` unchanged.

## 1.0.0-beta.1 (March 2026)

### @beacio/core
- Initial release
- \`Beacio\` class with platform detection and device discovery
- \`BeacioDevice\` with full GATT operations: read, write, writeWithoutResponse, subscribe, notifications (async iterator)
- \`BeacioError\` with typed error codes and auto-classification from native errors
- UUID resolution: Bluetooth SIG names, 4-hex, 8-hex, and full 128-bit UUIDs
- Service and characteristic caching
- Automatic subscription cleanup on disconnect

### @beacio/core/profiles
- \`HeartRateProfile\` — heart rate measurement, sensor location, energy reset
- \`BatteryProfile\` — battery level read and notifications
- \`DeviceInfoProfile\` — device information service with readAll()
- \`defineProfile()\` factory for custom typed profiles
- \`BaseProfile\` abstract class with connect/stop/read/write/subscribe

### @beacio/react
- \`BeacioProvider\` context with @beacio/core/detect integration
- Hooks: useBeacio, useDevice, useNotifications, useCharacteristic, useScan, useConnection, useProfile, useBluetooth
- Components: DeviceScanner, ServiceExplorer, InstallationWizard
- Auto-detection of @beacio/core when installed alongside react SDK

### @beacio/core/detect
- iOS Safari extension detection
- Auto install banner for iOS users
- React provider component
- No-op on platforms with native Web Bluetooth

### @beacio/mcp
- MCP server for AI coding agents
- Consumer tools: beacio_install_plan, beacio_patch_existing_app, beacio_verify_integration, beacio_example, beacio_detect_ios_support, beacio_premium_guide, beacio_troubleshoot, beacio_spec_citation
- Developer tools (--developer): beacio_dev_best_practices, beacio_dev_search_docs, beacio_dev_list_structure, beacio_dev_find_examples
- Resources: quickstart, api, profiles, uuids, errors, changelog
`,
        },
      ],
    })
  );
}

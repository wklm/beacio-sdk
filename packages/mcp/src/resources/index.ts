/**
 * MCP Resources for WebBLE
 *
 * Exposes static documentation, profiles, UUIDs, and error references
 * as MCP resources that agents can read.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerResources(server: McpServer): void {
  // Resource 1: Quick Start Guide
  server.resource(
    'ioswebble://docs/quickstart',
    'WebBLE quick start guide — 3-step setup',
    async () => ({
      contents: [
        {
          uri: 'ioswebble://docs/quickstart',
          mimeType: 'text/markdown',
          text: `# WebBLE Quick Start

## Step 1: Install
\`\`\`bash
npm install @ios-web-bluetooth/core
\`\`\`

## Step 2: Connect and read
\`\`\`typescript
import '@ios-web-bluetooth/core/auto';
import { WebBLE } from '@ios-web-bluetooth/core'

const ble = new WebBLE()
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
\`\`\`bash
npm install @ios-web-bluetooth/detect
\`\`\`
\`\`\`typescript
import { initIOSWebBLE } from '@ios-web-bluetooth/detect'
initIOSWebBLE({ key: 'wbl_YOUR_API_KEY' })
\`\`\`

Shows an install banner on iOS Safari if the WebBLE extension is not installed.
No-op on Chrome/Android where Web Bluetooth is native.

## Requirements
- HTTPS (localhost exempted)
- \`requestDevice()\` must be called from a user gesture (button click)
- iOS: WebBLE app installed + Safari extension enabled
`,
        },
      ],
    })
  );

  // Resource 2: Full API Reference
  server.resource(
    'ioswebble://docs/api',
    'Full API reference for @ios-web-bluetooth/core, @ios-web-bluetooth/profiles, and @ios-web-bluetooth/react',
    async () => ({
      contents: [
        {
          uri: 'ioswebble://docs/api',
          mimeType: 'text/markdown',
          text: `# WebBLE API Reference

## @ios-web-bluetooth/core

### WebBLE
\`\`\`typescript
const ble = new WebBLE(options?: { platform?: Platform })
ble.platform       // 'ios-extension' | 'chrome' | 'unsupported'
ble.isSupported    // boolean
await ble.requestDevice(options?: RequestDeviceOptions): Promise<WebBLEDevice>
await ble.getAvailability(): Promise<boolean>
\`\`\`

### WebBLEDevice
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

### WebBLEError
\`\`\`typescript
error.code: WebBLEErrorCode
error.suggestion: string
WebBLEError.from(error, fallbackCode?): WebBLEError
\`\`\`

### UUID Utilities
\`\`\`typescript
resolveUUID(nameOrUUID: string): string
getServiceName(uuid: string): string | undefined
getCharacteristicName(uuid: string): string | undefined
\`\`\`

## @ios-web-bluetooth/profiles

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

## @ios-web-bluetooth/react
- \`<WebBLEProvider config={...}>\` — context provider
- \`useWebBLE()\` — isAvailable, requestDevice, devices, error
- \`useDevice(device)\` — connect, disconnect, isConnected, services
- \`useNotifications(char, opts?)\` — subscribe, value, history
- \`useCharacteristic()\`, \`useScan()\`, \`useConnection()\`, \`useProfile()\`
- \`<DeviceScanner />\`, \`<ServiceExplorer />\`, \`<ConnectionStatus />\`, \`<InstallationWizard />\`
`,
        },
      ],
    })
  );

  // Resource 3: Built-in Profile Catalog
  server.resource(
    'ioswebble://profiles',
    'Built-in BLE profile catalog with UUIDs and methods',
    async () => ({
      contents: [
        {
          uri: 'ioswebble://profiles',
          mimeType: 'text/markdown',
          text: `# Built-in BLE Profiles

## HeartRateProfile
- **Package**: \`@ios-web-bluetooth/profiles\`
- **Service**: \`heart_rate\` (0x180D)
- **Characteristics**:
  - \`heart_rate_measurement\` (0x2A37) — Notify: BPM, contact, energy, RR intervals
  - \`body_sensor_location\` (0x2A38) — Read: sensor location enum
  - \`heart_rate_control_point\` (0x2A39) — Write: reset energy expended
- **Methods**: \`onHeartRate(cb)\`, \`readSensorLocation()\`, \`resetEnergyExpended()\`, \`stop()\`
- **Data type**: \`HeartRateData { bpm, contact, energyExpended, rrIntervals }\`

## BatteryProfile
- **Package**: \`@ios-web-bluetooth/profiles\`
- **Service**: \`battery_service\` (0x180F)
- **Characteristics**:
  - \`battery_level\` (0x2A19) — Read/Notify: 0-100%
- **Methods**: \`readLevel()\`, \`onLevelChange(cb)\`, \`stop()\`

## DeviceInfoProfile
- **Package**: \`@ios-web-bluetooth/profiles\`
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
import { defineProfile } from '@ios-web-bluetooth/profiles'
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
    'ioswebble://uuids',
    'Common Bluetooth SIG service and characteristic UUID lookup table',
    async () => ({
      contents: [
        {
          uri: 'ioswebble://uuids',
          mimeType: 'text/markdown',
          text: `# Bluetooth SIG UUID Reference

All names below can be used directly in @ios-web-bluetooth/core API calls (e.g. \`device.read('heart_rate', 'heart_rate_measurement')\`).
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
| insulin_delivery | 0000183a-0000-1000-8000-00805f9b34fb | 0x183A |
| audio_input_control | 00001843-0000-1000-8000-00805f9b34fb | 0x1843 |
| volume_control | 00001844-0000-1000-8000-00805f9b34fb | 0x1844 |
| media_control | 00001848-0000-1000-8000-00805f9b34fb | 0x1848 |
| microphone_control | 0000184d-0000-1000-8000-00805f9b34fb | 0x184D |

## Characteristics (16-bit)

| Name | UUID | Hex |
|------|------|-----|
| device_name | 00002a00-0000-1000-8000-00805f9b34fb | 0x2A00 |
| appearance | 00002a01-0000-1000-8000-00805f9b34fb | 0x2A01 |
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
    'ioswebble://errors',
    'WebBLEError code reference with causes and suggestions',
    async () => ({
      contents: [
        {
          uri: 'ioswebble://errors',
          mimeType: 'text/markdown',
          text: `# WebBLEError Code Reference

All errors are instances of \`WebBLEError\` from \`@ios-web-bluetooth/core\`.
Each has a \`.code\` (string) and \`.suggestion\` (human-readable fix).

| Code | Cause | Suggestion |
|------|-------|------------|
| BLUETOOTH_UNAVAILABLE | Browser/device has no Bluetooth support | Check browser supports Web Bluetooth and Bluetooth is enabled |
| EXTENSION_NOT_INSTALLED | iOS Safari without WebBLE extension | Install WebBLE app and enable Safari extension. Use @ios-web-bluetooth/detect for auto-banner |
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
import '@ios-web-bluetooth/core/auto';
import { WebBLEError } from '@ios-web-bluetooth/core'

try {
  await device.read('heart_rate', 'heart_rate_measurement')
} catch (e) {
  if (e instanceof WebBLEError) {
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
    'ioswebble://schema',
    'Full TypeScript type definitions for all @ios-web-bluetooth/* public exports',
    async () => ({
      contents: [
        {
          uri: 'ioswebble://schema',
          mimeType: 'text/typescript',
          text: `// @ios-web-bluetooth/core — Public API Types

export class WebBLE {
  constructor(options?: { platform?: Platform })
  readonly platform: 'ios-extension' | 'chrome' | 'unsupported'
  readonly isSupported: boolean
  requestDevice(options?: RequestDeviceOptions): Promise<WebBLEDevice>
  getAvailability(): Promise<boolean>
}

export class WebBLEDevice {
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

export class WebBLEError extends Error {
  readonly code: WebBLEErrorCode
  readonly suggestion: string
  static from(error: unknown, fallbackCode?: WebBLEErrorCode): WebBLEError
}

export type WebBLEErrorCode =
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

// @ios-web-bluetooth/profiles — Public API Types

export abstract class BaseProfile {
  constructor(device: WebBLEDevice)
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

export function defineProfile<T>(config: ProfileConfig<T>): new (device: WebBLEDevice) => CustomProfile<T>

export interface HeartRateData { bpm: number; contact: boolean; energyExpended?: number; rrIntervals?: number[] }
export interface DeviceInfo { modelNumber?: string; serialNumber?: string; firmwareRevision?: string; hardwareRevision?: string; softwareRevision?: string; manufacturerName?: string; systemId?: DataView }

// @ios-web-bluetooth/react — Public API Types

export function WebBLEProvider(props: { config?: WebBLEConfig; children: React.ReactNode }): JSX.Element
export function useBluetooth(): { isAvailable: boolean; isSupported: boolean; requestDevice: (opts?: RequestDeviceOptions) => Promise<WebBLEDevice | null>; getDevices: () => WebBLEDevice[]; error: WebBLEError | null }
export function useDevice(device: WebBLEDevice | null): { isConnected: boolean; isConnecting: boolean; connect: () => Promise<void>; disconnect: () => void; services: string[]; error: WebBLEError | null }
export function useProfile<T extends BaseProfile>(ProfileClass: new (d: WebBLEDevice) => T, device: WebBLEDevice | null): { profile: T | null; connect: () => Promise<void>; error: WebBLEError | null }
export function useScan(): { startScan: (opts?: RequestDeviceOptions) => void; stopScan: () => void; isScanning: boolean; devices: WebBLEDevice[] }
export function useNotifications(): { subscribe: (service: string, char: string, cb: (dv: DataView) => void) => () => void }
export function useCharacteristic(): { read: (service: string, char: string) => Promise<DataView>; write: (service: string, char: string, value: BufferSource) => Promise<void>; value: DataView | null; error: WebBLEError | null }
export function useConnection(): { connect: () => Promise<void>; disconnect: () => void; isConnected: boolean }

// @ios-web-bluetooth/detect — Public API Types

export function initIOSWebBLE(options: { key: string; appStoreUrl?: string; operatorName?: string }): void
export function isIOSWebBLEInstalled(): boolean
export function IOSWebBLEProvider(props: { apiKey: string; children: React.ReactNode }): JSX.Element
`,
        },
      ],
    })
  );

  // Resource 7: Changelog
  server.resource(
    'ioswebble://changelog',
    'WebBLE version history',
    async () => ({
      contents: [
        {
          uri: 'ioswebble://changelog',
          mimeType: 'text/markdown',
          text: `# WebBLE Changelog

## 1.0.0-beta.1 (March 2026)

### @ios-web-bluetooth/core
- Initial release
- \`WebBLE\` class with platform detection and device discovery
- \`WebBLEDevice\` with full GATT operations: read, write, writeWithoutResponse, subscribe, notifications (async iterator)
- \`WebBLEError\` with typed error codes and auto-classification from native errors
- UUID resolution: Bluetooth SIG names, 4-hex, 8-hex, and full 128-bit UUIDs
- Service and characteristic caching
- Automatic subscription cleanup on disconnect

### @ios-web-bluetooth/profiles
- \`HeartRateProfile\` — heart rate measurement, sensor location, energy reset
- \`BatteryProfile\` — battery level read and notifications
- \`DeviceInfoProfile\` — device information service with readAll()
- \`defineProfile()\` factory for custom typed profiles
- \`BaseProfile\` abstract class with connect/stop/read/write/subscribe

### @ios-web-bluetooth/react
- \`WebBLEProvider\` context with @ios-web-bluetooth/detect integration
- Hooks: useWebBLE, useDevice, useNotifications, useCharacteristic, useScan, useConnection, useProfile, useBluetooth
- Components: DeviceScanner, ServiceExplorer, ConnectionStatus, InstallationWizard
- Auto-detection of @ios-web-bluetooth/core when installed alongside react SDK

### @ios-web-bluetooth/detect
- iOS Safari extension detection
- Auto install banner for iOS users
- React provider component
- No-op on platforms with native Web Bluetooth

### @ios-web-bluetooth/mcp
- MCP server for AI coding agents
- Consumer tools: webble_install_plan, webble_verify_integration, webble_example, webble_detect_ios_support, webble_premium_guide, webble_troubleshoot, webble_spec_citation
- Developer tools (--developer): webble_dev_best_practices, webble_dev_search_docs, webble_dev_list_structure, webble_dev_find_examples
- Resources: quickstart, api, profiles, uuids, errors, changelog
`,
        },
      ],
    })
  );
}

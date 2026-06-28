# Background Sync

Background Sync lets your web app register BLE work that continues through the iOS companion app when Safari is not in the foreground.

This page covers the public API and usage model only.

## Namespace

```typescript
navigator.beacio.backgroundSync
```

## What It Can Do

- keep a granted BLE device connected in the background
- show iOS notifications when a characteristic value changes
- show iOS notifications when matching BLE beacons are detected
- manage active registrations for the current origin

## Permission Flow

Request notification permission from a direct user gesture:

```javascript
button.addEventListener('click', async () => {
  const permission = await navigator.beacio.backgroundSync.requestPermission();
  if (permission === 'granted') {
    console.log('Notifications enabled');
  }
});
```

`requestPermission()` must be called from a user gesture.

## Keep A Device Connected

```javascript
const keepAlive = await navigator.beacio.backgroundSync.requestBackgroundConnection({
  deviceId: device.id,
});
```

Use this when you want the companion app to maintain the BLE connection for future background work.

## Characteristic Notifications

```javascript
const alerts = await navigator.beacio.backgroundSync.registerCharacteristicNotifications({
  deviceId: device.id,
  serviceUUID: 'heart_rate',
  characteristicUUID: 'heart_rate_measurement',
  cooldownSeconds: 30,
  template: {
    title: 'Heart rate update',
    body: '{{device.name}} sent {{value.hex}} at {{timestamp}}',
    url: 'https://example.com/monitor',
  },
});
```

## Beacon Scanning

```javascript
const beacons = await navigator.beacio.backgroundSync.registerBeaconScanning({
  filters: [{ services: ['0000fee0-0000-1000-8000-00805f9b34fb'] }],
  template: {
    title: 'Nearby BLE beacon',
    body: '{{device.name}} is advertising nearby',
    url: 'https://example.com/beacons',
  },
});
```

At least one `services` filter is required.

## Manage Registrations

```javascript
const registrations = await navigator.beacio.backgroundSync.getRegistrations();

for (const registration of registrations) {
  console.log(registration.id, registration.type);
}

await alerts.update({
  body: 'Latest payload from {{device.name}}: {{value.hex}}',
});

await beacons.unregister();
```

`BackgroundRegistration.update()` is supported for notification and beacon registrations. Connection registrations do not support `update()`.

## Template Placeholders

- `{{value.utf8}}`
- `{{value.hex}}`
- `{{value.int16be}}`
- `{{value.int32be}}`
- `{{timestamp}}`
- `{{device.name}}`
- `{{device.id}}`

Interpolated values are sanitized before delivery.

## Security And Limits

- `template.url` must use `https://`
- `template.url` must stay on the same origin as the page that created the registration
- `deviceId` must come from a device previously granted through your site flow
- quotas: 50 intents per origin, 200 global registrations
- registrations expire after 30 days
- notification cooldown defaults to 5 seconds where supported

## Complete Example

```javascript
const permission = await navigator.beacio.backgroundSync.requestPermission();

if (permission !== 'granted') {
  throw new Error('Enable notifications to use background BLE alerts');
}

const device = await navigator.bluetooth.requestDevice({
  filters: [{ services: ['heart_rate'] }],
});

await device.gatt.connect();

const keepAlive = await navigator.beacio.backgroundSync.requestBackgroundConnection({
  deviceId: device.id,
});

const heartRateAlerts = await navigator.beacio.backgroundSync.registerCharacteristicNotifications({
  deviceId: device.id,
  serviceUUID: 'heart_rate',
  characteristicUUID: 'heart_rate_measurement',
  cooldownSeconds: 30,
  template: {
    title: 'Heart rate update',
    body: '{{device.name}} sent {{value.hex}} at {{timestamp}}',
    url: 'https://example.com/monitor',
  },
});

const activeRegistrations = await navigator.beacio.backgroundSync.getRegistrations();
console.log(activeRegistrations.map(({ id, type }) => ({ id, type })));

await heartRateAlerts.update({
  body: 'Latest payload from {{device.name}}: {{value.hex}}',
});
```

## More Detail

- Hosted docs: <https://beacio.com/docs#api-background-sync>
- Public API reference source: <https://github.com/wklm/beacio-sdk/blob/main/README.md>

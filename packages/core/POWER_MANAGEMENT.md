# Power Management

`@beacio/core` works in foreground browser tabs, but BLE radio use still costs battery on both the phone and the peripheral. Treat power usage as part of the API contract when you design scans, subscriptions, and reconnect logic.

## Rules of thumb

1. Call `requestDevice()` only from a direct user gesture.
2. Connect only when the user is about to read or control something.
3. Prefer short-lived reads over permanent notification streams when polling every few seconds is acceptable.
4. Unsubscribe before disconnecting.
5. Stop work when the page is hidden, the route changes, or the user leaves the screen.

## User gesture requirement

Safari iOS requires `requestDevice()` to run inside a click or tap handler. This is a platform rule, but it also helps power usage: it prevents accidental scans on page load or background timers.

```typescript
button.addEventListener('click', async () => {
  const device = await ble.requestDevice({
    filters: [{ services: ['heart_rate'] }],
  });
});
```

Avoid calling it from `useEffect`, `DOMContentLoaded`, `setTimeout`, or automatic reconnect loops.

## Notification streams

Notification subscriptions keep both the page and the BLE link active. Use them only while you are actively showing live data.

### Callback style

```typescript
const unsubscribe = device.subscribe(
  'heart_rate',
  'heart_rate_measurement',
  (value) => {
    console.log(value.getUint8(1));
  },
);

// Later
unsubscribe();
device.disconnect();
```

### Async iterator style

```typescript
let keepReading = true;

async function watchHeartRate() {
  for await (const value of device.notifications('heart_rate', 'heart_rate_measurement', {
    maxQueueSize: 8,
  })) {
    if (!keepReading) break;
    console.log(value.getUint8(1));
  }
}

watchHeartRate();

// On unmount, tab change, or stop action:
keepReading = false;
device.disconnect();
```

## Queue sizing guidance

- Use the smallest `maxQueueSize` that matches your UI latency budget.
- Small queues surface overload quickly instead of hiding stale data.
- Large queues increase memory use and can let old values drain long after the UI stopped caring.

Practical starting points:

- `maxQueueSize: 1-4` for dashboards that only need the latest value.
- `maxQueueSize: 8-16` for charts or short bursts of buffered processing.
- Avoid larger queues unless you have a measured reason.

## Scanning and reconnects

- Narrow `requestDevice()` filters to the service you actually need.
- Avoid repeated request loops when a device is missing; surface a retry button instead.
- Back off reconnect attempts after link loss instead of retrying continuously.

```typescript
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    await device.connect();
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
}
```

## UI lifecycle hooks

If your app has screens, tabs, or modal flows, tie BLE activity to visible UI state.

- Start live notifications when the live view appears.
- Stop notifications when the live view disappears.
- Disconnect from peripherals the user is no longer interacting with.
- Pause high-frequency updates while the document is hidden.

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    device.disconnect();
  }
});
```

This is intentionally conservative. Some apps may keep a connection alive across short navigations, but the default should favor shorter sessions until you have measured user benefit.

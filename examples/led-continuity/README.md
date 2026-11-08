# Blink an LED

[Open the demo](https://wklm.github.io/beacio-sdk/) on an iPhone with beacio.

One page, two ways to blink a Bluetooth LED:

- **Foreground only.** The page sends each on and off itself. Safari may slow or stop it when the page is hidden.
- **Background continuity.** The page hands beacio a tiny program, and beacio keeps blinking while the page is hidden or the phone is locked.

Start one, lock your phone, and watch the LED.

## The code that matters

```js
const device = await new Beacio().requestDevice({ filters: [{ services: [SERVICE] }] });
await device.connect();
await device.subscribeAsync(SERVICE, LED, showLed); // the LED reports what it shows
await device.write(SERVICE, LED, Uint8Array.of(1)); // on (0 is off)

// Or let beacio blink it every 2 seconds, with the page in the background:
const led = await (await device.raw.gatt.getPrimaryService(SERVICE)).getCharacteristic(LED);
const registration = await navigator.beacio.backgroundSync.requestBackgroundConnection({
  deviceId: device.id,
  program: { deviceId: device.id, characteristicId: led.id, activeWhen: 'always',
    cycle: { frames: [[0x01], [0x00]], timer: { cadence: 'uniform', everyMs: 2000 } } },
});
await registration.unregister(); // Stop
```

The rest of [`app.js`](app.js) is the button and the lamp. There is no build step:
[`index.html`](index.html) loads [`@beacio/core`](https://www.npmjs.com/package/@beacio/core) 2.2.0
from jsDelivr, pinned with a subresource integrity hash.

The SDK turns each GATT step into one line with string UUIDs, and its errors carry a
`suggestion` you can show as is. Background programs are newer than @beacio/core 2.2.0, so the
page calls them on `navigator.beacio.backgroundSync` (or `navigator.bluetooth.backgroundSync`).

## Try it

1. On your iPhone, allow beacio for the demo site. For background continuity, open the beacio app and leave it running.
2. Have an LED nearby: real hardware, or the emulator below.
3. Tap **Connect** and choose **EmulatedPeripheral**. Pick a mode, then tap **Start blinking**.
4. Lock the phone, watch the LED, come back and tap **Stop**.

To host the page yourself, serve this folder over HTTPS with a certificate the iPhone trusts.
On a computer, `python3 -m http.server` and `http://localhost:8000` in desktop Chrome
runs foreground mode, since Chrome has Web Bluetooth built in.

## No LED? Run the emulator

On a Mac or Linux computer near the phone:

```sh
cd examples/led-continuity/emulator
npm ci
npm start
```

- **macOS:** allow Bluetooth for your terminal app in System Settings > Privacy & Security > Bluetooth.
- **Linux:** stop `bluetoothd` (`sudo systemctl stop bluetooth`), then run with `sudo` or grant Node
  raw-socket access once: `sudo setcap cap_net_raw+eip "$(readlink -f "$(command -v node)")"`.

It advertises service `0000FFF0-0000-1000-8000-00805F9B34FB` with one characteristic,
`0000FFF1-0000-1000-8000-00805F9B34FB` (read, write with response, notify). It starts at `BE AC`,
shown as Unknown. Write `01` for on and `00` for off; every write is notified back. Built on
[`@stoprocent/bleno`](https://github.com/stoprocent/bleno) (MIT). Its install scripts are denied
in `package.json`: the packages ship prebuilt binaries.

## Good to know

The background program runs in the beacio app and sends at most one command every 2 seconds:
that is beacio's battery policy, not an iOS limit. It needs a live Bluetooth link and the beacio
app running, so timing is best effort. Returning to Safari doesn't stop it; **Stop** does, and
it unregisters the program before it writes off. After a reload, a program from an earlier visit
has unknown status, so the page asks you to stop it before starting again. The page offers
background continuity only when beacio supports programs, and it opens the device chooser
straight from your tap, as Safari requires.

## Test

```sh
cd examples/led-continuity/test
npm ci
npx playwright install chromium
npx playwright test
```

One smoke test runs the page and the published SDK file against a Bluetooth double. It does
not prove radio behaviour or iOS background timing.

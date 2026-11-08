# Blink an LED

[Open the demo](https://wklm.github.io/beacio-sdk/) on an iPhone with [beacio](https://beacio.com),
the Safari extension that brings Web Bluetooth to iOS.

One page, two ways to blink a Bluetooth LED:

- **Foreground only.** The page sends each on and off itself. Safari slows it, then pauses it, when the page is hidden.
- **Background continuity.** The page hands beacio a tiny program, and beacio keeps blinking while the page is hidden or the phone is locked.

## Step by step

1. **Open the beacio app and leave it running.** You see the beacio app. Come back to Safari.
2. **Tap Connect and choose your LED** (or **EmulatedPeripheral**). You see the lamp on the page say Connected, On or Off.
3. **Pick who keeps it blinking:** Foreground only or Background continuity. You see your choice ticked.
4. **Tap Start blinking.** You see the LED and the lamp blink.
5. **Leave Safari or lock the phone.** Watch the LED. Foreground only: it slows, then stops. Background continuity:
   it keeps blinking every 2 s.
6. **Come back to the page.** You see the lamp catch up. Coming back does not stop a background program.
7. **Tap Stop.** You see the LED turn off if the page is connected. **Leaving the page does not stop a background
   program**: it keeps running, even for hours, until you tap Stop. If you leave one running, the page shows
   "A blink program from your last visit is still running" with a Stop button the next time you open it.
   That Stop ends the program, but the page is not connected yet, so it cannot send off. The page says
   "Stopped. The LED keeps its last state." Connect, then Start blinking and Stop, to turn the LED off.

The page highlights the step you are on.

## Who does what

![Who does what: this page starts and stops a blink program, the beacio app sends on and off to the LED every 2 seconds, and the LED reports each value back.](flow.svg)

In Foreground only, the page sends every blink itself, through beacio. In Background continuity,
it hands the beacio app one small program, and the app keeps it going.

## Why the page alone stops

![Timeline: when the page is hidden, its own timer slows down and then pauses, while the beacio program keeps the same rhythm, 2 seconds on and 2 seconds off.](timeline.svg)

A sketch, not a measurement: how soon Safari slows and pauses a hidden page varies.

## Good to know

- **2 s on, 2 s off.** 2000 ms is the time between commands and beacio's current minimum, not an iOS limit.
  A faster program is rejected, not slowed down.
- **Coming back doesn't stop it.** Only Stop does: it unregisters the program, then the page sends off if it is connected.
- **Best effort.** If iOS ends the beacio app or the Bluetooth link drops, blinks can be late or missed.
- **Twice is fine.** While beacio runs, a notified value can arrive twice. The lamp shows the value,
  not a count, so it stays right.

## LED example

This is standard [Web Bluetooth](https://developer.mozilla.org/docs/Web/API/Web_Bluetooth_API), written like
[Chrome's samples](https://github.com/GoogleChrome/samples/tree/gh-pages/web-bluetooth), so the same code runs
in Chrome on a desktop. beacio brings `navigator.bluetooth` to Safari on iPhone. The only beacio-specific line is
`backgroundSync.requestBackgroundConnection`, which keeps the LED blinking with the phone locked.

```js
// Your device
const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC = '0000fff1-0000-1000-8000-00805f9b34fb'; // the one you write commands to
const ON = Uint8Array.of(0x01);
const OFF = Uint8Array.of(0x00);

// Connect. Call this from a tap: Safari opens the chooser only from a user gesture.
const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE] }] });
const server = await device.gatt.connect();
const service = await server.getPrimaryService(SERVICE);
const characteristic = await service.getCharacteristic(CHARACTERISTIC);

// Switch it from the page. blink.js does this every 500 ms, one write at a time.
await characteristic.writeValue(ON);
await characteristic.writeValue(OFF);

// Or let beacio blink it, 2 s on and 2 s off, even with the phone locked.
const program = await navigator.bluetooth.backgroundSync.requestBackgroundConnection({
  deviceId: device.id,
  program: {
    deviceId: device.id,
    characteristicId: characteristic.id, // beacio's id for this characteristic
    activeWhen: 'always',
    cycle: { frames: [Array.from(ON), Array.from(OFF)], timer: { cadence: 'uniform', everyMs: 2000 } },
  },
});

// Stop. Leaving the page does not stop a program: unregister it, then switch the LED off.
await program.unregister();
await characteristic.writeValue(OFF);
```

All of it is in [`blink.js`](blink.js), about 60 lines. It also listens to the LED's notifications, so the page
shows what the LED reports. [`app.js`](app.js) only draws the page: the lamp, the steps, the banner and the buttons.
There is no build step and no library: [`index.html`](index.html) loads `app.js`, which imports `blink.js`.

To host the page yourself, serve this folder over HTTPS with a certificate the iPhone trusts.
On a computer, `python3 -m http.server` and `http://localhost:8000` in desktop Chrome
runs foreground mode, since Chrome has Web Bluetooth built in.

## Make it yours

Put your device's service, characteristic and commands in the four "Your device" lines at the top of
[`blink.js`](blink.js). A command can be several bytes, for example the encoded command your own SDK sends:
`export const ON = Uint8Array.from(yourOnCommand);`.

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
so the page shows Connected until the LED reports on or off. Write `01` for on and `00` for off;
every write is notified back. Built on [`@stoprocent/bleno`](https://github.com/stoprocent/bleno)
(MIT). Its install scripts are denied in `package.json`: the packages ship prebuilt binaries.

## Test

```sh
cd examples/led-continuity/test
npm ci
npx playwright install chromium
npx playwright test
```

One smoke test runs the page against a stub of `navigator.bluetooth` and checks that the steps,
the pictures and the leftover-program banner render, that the SVG files here match the ones on
the page, and that Pages publishes every file the page loads. It does not prove radio behaviour or iOS background timing.

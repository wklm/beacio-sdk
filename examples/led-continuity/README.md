# LED continuity

[Open the demo](https://wklm.github.io/beacio-sdk/)

A small TypeScript app comparing two ways to alternate a Bluetooth LED command:

- **Foreground only:** the webpage alternates on/off every 500 ms. Safari may slow or suspend its timer when the page is hidden.
- **Background continuity:** beacio executes a declared repeating sequence, targeting 2 seconds on and 2 seconds off while the webpage is visible or hidden. This requires the beacio extension with background program support and a prepared companion-app session.

## Connect an emulated peripheral

The page needs a nearby BLE peripheral advertising service `0000FFF0-0000-1000-8000-00805F9B34FB`. The demo uses the advertised name **EmulatedPeripheral**; discovery filters by service, so another name also works.

Its characteristic `0000FFF1-0000-1000-8000-00805F9B34FB` must support reading, writing with response and notifications:

- Initial value: `BE AC`, displayed as Unknown.
- Write `01`: store the value and notify subscribers; displayed as On.
- Write `00`: store the value and notify subscribers; displayed as Off.

Start the emulator on a separate nearby computer, or use hardware implementing this contract. The page does not create a Bluetooth peripheral. Its indicator shows the last value received from the peripheral and refreshes with a read when the page becomes visible. These payloads are specific to this emulation; real devices may require another service, characteristic and command format.

On iPhone, enable beacio for the demo's HTTPS website, tap **Connect emulated peripheral**, then choose **EmulatedPeripheral**. Bluetooth requires local radio range regardless of where the website is hosted. Selection is initiated directly from the tap to preserve Safari's user-gesture requirement.

## Try background continuity

Open beacio to prepare its background session, leave it running, and return to Safari within the preparation window. Connect the emulated peripheral, choose **Background continuity**, then tap **Start blinking**.

The program uses the discovered characteristic instance ID, rather than its UUID:

```ts
const registration = await navigator.beacio.backgroundSync.requestBackgroundConnection({
  deviceId: device.id,
  program: {
    deviceId: device.id,
    characteristicId: characteristic.id,
    activeWhen: 'always',
    cycle: {
      frames: [[0x01], [0x00]],
      timer: { cadence: 'uniform', everyMs: 2000 }
    }
  }
});
```

`activeWhen: 'always'` allows execution in both page visibility states. The page starts no competing interval in this mode. The two-second minimum is beacio's current conservative resource policy, rather than an iOS-imposed minimum; sustained 500 ms companion execution has not been enabled or validated. Native execution is best effort and requires a live connection and native session. Closing/reloading the tab, ending the session, and losing the link are separate lifecycle cases; indefinite execution is not guaranteed.

**Stop** unregisters the program before writing off. Unregistering alone does not send an off command. If unregistering fails or an existing registration's ownership cannot be read, new writers remain blocked until Stop succeeds. On reconnect, a recovered registration has unknown execution status and must be stopped before starting another writer. Registrations are scoped to the website's origin, so use a dedicated origin for this demo during testing.

## Develop locally

Requires Node 22.12+; CI uses Node 24.

```sh
cd examples/led-continuity
npm ci --workspaces=false
npm run dev
```

Open `http://localhost:5173`. Physical phones need HTTPS with a trusted certificate; the localhost secure-context exception does not apply to another computer's LAN address. Either use a trusted HTTPS proxy or supply both certificate files:

```sh
HTTPS_CERT=/absolute/path/to/cert.pem \
HTTPS_KEY=/absolute/path/to/key.pem \
npm run dev
```

For a development proxy that preserves its hostname, set `APP_ALLOWED_HOST` to that exact hostname. Production assets use relative paths so the build works both at `/beacio-sdk/` on GitHub Pages and behind a local HTTPS proxy.

```sh
npm run build
npx playwright install chromium
npm test
```

The app pins published `@beacio/core` 2.2.0 for ordinary Bluetooth operations. The newer background program boundary is typed locally and uses `navigator.beacio.backgroundSync`, with a `navigator.bluetooth.backgroundSync` fallback. It checks for program support before offering background continuity.

The browser interaction tests use a deterministic Bluetooth boundary double. They cover connection from a gesture, observed values, alternating writes, native declaration contents, stop failures, ownership recovery, disconnection/reconnect and readback on return. They do not establish physical radio correctness or iOS background timing.

## GitHub Pages

The repository's **LED continuity Pages** workflow builds and tests this directory on changes to `main`, then publishes `dist/` using GitHub Pages. Pull requests run the same build and browser tests without deploying. The workflow can also be started manually. No native binaries, personal research notes or local runtime state are published.

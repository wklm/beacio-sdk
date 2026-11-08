// Everything beacio needs to blink a Bluetooth LED. No page code here: app.js draws the page.
const { Beacio } = window.BeacioCore; // @beacio/core, which index.html runs before this module

// Your device: the only device-specific lines. For your own device, put its service and
// characteristic UUIDs here, and the bytes it expects for on and off. A command can be any number
// of bytes, such as the encoded command your own SDK already sends.
export const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
export const LED = '0000fff1-0000-1000-8000-00805f9b34fb'; // the characteristic you write commands to
export const ON = [0x01];
export const OFF = [0x00];

// Background programs are not in @beacio/core 2.2.0 yet, so they are called on navigator.
const programs = () => navigator.beacio?.backgroundSync ?? navigator.bluetooth?.backgroundSync;

// 1. Connect. Call it straight from the tap: Safari opens the chooser only from a user gesture.
export async function connect({ onValue, onDisconnect }) {
  const ble = new Beacio(); // made on the tap: the extension may mount after page load
  if (!ble.isSupported) return undefined; // this browser has no Web Bluetooth
  const device = await ble.requestDevice({ filters: [{ services: [SERVICE] }] });
  try {
    await device.connect();
    device.on('disconnected', onDisconnect);
    await device.subscribeAsync(SERVICE, LED, onValue, { autoRecover: false }); // the LED reports each value
    onValue(await readLed(device)); // and once now
    return device;
  } catch (err) {
    device.disconnect();
    throw err;
  }
}

export const readLed = (device) => device.read(SERVICE, LED, { timeoutMs: 3000 });
export const setLed = (device, command) => device.write(SERVICE, LED, Uint8Array.from(command), { timeoutMs: 4000 });

// 2a. The page blinks it every 500 ms. Safari slows this timer, then pauses it, when the page is hidden.
// Gives stop(): it clears the timer and waits for the write in flight, so a late "on" never lands after "off".
export function blinkFromPage(device, onError) {
  let next = ON;
  let inflight;
  const timer = setInterval(() => {
    if (inflight) return; // skip a tick rather than queue writes
    inflight = setLed(device, next)
      .then(() => { next = next === ON ? OFF : ON; }, (err) => { clearInterval(timer); onError(err); })
      .finally(() => { inflight = undefined; });
  }, 500);
  return async () => { clearInterval(timer); await inflight; };
}

// 2b. Or beacio blinks it, 2 s on and 2 s off, with the page hidden or the phone locked.
// Leaving the page never stops this program: only stopBackground() does.
export async function blinkInBackground(device) {
  const service = await device.raw.gatt.getPrimaryService(SERVICE);
  const led = await service.getCharacteristic(LED); // the program needs beacio's id for it, not the UUID
  return programs().requestBackgroundConnection({
    deviceId: device.id,
    program: {
      deviceId: device.id,
      characteristicId: led.id,
      activeWhen: 'always', // visible or hidden
      cycle: {
        frames: [ON, OFF], // your two commands, in turn
        timer: { cadence: 'uniform', everyMs: 2000 }, // 2 s between commands: beacio's minimum
      },
    },
  });
}

// The blink programs beacio runs for this site, from this visit or an earlier one.
export async function backgroundPrograms() {
  if (!programs()) return [];
  const registrations = await programs().getRegistrations();
  return registrations.filter((r) => r.type === 'connection');
}

// 3. Stop: the stop() from 2a, or stopBackground() for 2b, then switchOff().
// Unregister first, then off, or the program turns the LED back on.
export async function stopBackground() {
  for (const program of await backgroundPrograms()) await program.unregister();
}
export const switchOff = (device) => setLed(device, OFF);

// Offer the background only when this beacio supports programs.
export const canBlinkInBackground = () => typeof programs()?.declareProgram === 'function';

// Blink a Bluetooth LED. Standard Web Bluetooth, plus one beacio call for blinking in the background.

// Your device: put your service, your characteristic and your two commands here.
// A command can be several bytes, for example the encoded command your own SDK sends.
export const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
export const CHARACTERISTIC = '0000fff1-0000-1000-8000-00805f9b34fb'; // the one you write commands to
export const ON = Uint8Array.of(0x01);
export const OFF = Uint8Array.of(0x00);

export let device, characteristic;
let timer;
let pending; // the write in flight
let program; // the background program, while beacio runs it

// Call it straight from the tap: Safari opens the chooser only from a user gesture.
export async function connect(handleNotifications, onDisconnected) {
  device = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE] }] });
  device.addEventListener('gattserverdisconnected', onDisconnected);
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE);
  characteristic = await service.getCharacteristic(CHARACTERISTIC);
  characteristic.addEventListener('characteristicvaluechanged', handleNotifications);
  await characteristic.startNotifications(); // the LED reports each value it takes
}

// The page blinks it: one write every 500 ms. Safari slows this timer, then pauses it, when the page is hidden.
export function startBlinking(onError) {
  let next = ON;
  timer = setInterval(() => {
    if (pending) return; // Web Bluetooth rejects a second GATT operation while one is pending
    pending = characteristic.writeValue(next)
      .then(() => { next = next === ON ? OFF : ON; })
      .catch((error) => { clearInterval(timer); onError(error); })
      .finally(() => { pending = undefined; });
  }, 500);
}

// Or beacio blinks it, 2 s on and 2 s off, even with the page hidden or the phone locked.
export async function startBackgroundBlinking() {
  program = await navigator.bluetooth.backgroundSync.requestBackgroundConnection({
    deviceId: device.id,
    program: {
      deviceId: device.id,
      characteristicId: characteristic.id, // beacio's id for this characteristic
      activeWhen: 'always', // visible or hidden
      cycle: {
        frames: [Array.from(ON), Array.from(OFF)], // your two commands, in turn
        timer: { cadence: 'uniform', everyMs: 2000 }, // 2 s between commands: beacio's minimum
      },
    },
  });
  return program;
}

// Stop. Leaving the page does not stop a background program: only unregister() does.
export async function stopBlinking() {
  clearInterval(timer);
  await pending; // so a late "on" never lands after "off"
  if (program) await program.unregister(); // before "off", or the program turns it on again
  program = undefined;
  if (device.gatt.connected) await characteristic.writeValue(OFF);
}

// Blink a Bluetooth LED from Safari: the page blinks it, or beacio does in the background.
const { Beacio } = window.BeacioCore; // @beacio/core, loaded by index.html

const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
const LED = '0000fff1-0000-1000-8000-00805f9b34fb'; // read, write, notify: 01 on, 00 off
const $ = (id) => document.getElementById(id);

let state = 'disconnected'; // disconnected | unsupported | connected | foreground | background | recovered
let device, ledId, led = 'unknown', timer, inflight;

// Background programs are not in @beacio/core 2.2.0 yet, so they are called on navigator.
const programs = () => navigator.beacio?.backgroundSync ?? navigator.bluetooth?.backgroundSync;
const hasPrograms = () => typeof programs()?.declareProgram === 'function';
const write = (byte) => device.write(SERVICE, LED, Uint8Array.of(byte), { timeoutMs: 4000 });
const read = () => device.read(SERVICE, LED, { timeoutMs: 3000 });

async function connect() {
  const ble = new Beacio(); // built on the tap: the extension may mount after page load
  if (!ble.isSupported) return render('unsupported');
  // The chooser opens straight from the tap: Safari requires a user gesture.
  device = await ble.requestDevice({ filters: [{ services: [SERVICE] }] });
  try {
    await device.connect();
    device.on('disconnected', onDrop);
    await device.subscribeAsync(SERVICE, LED, show, { autoRecover: false });
    show(await read());
    // The background program needs beacio's instance id of the characteristic, not its UUID.
    const service = await device.raw.gatt.getPrimaryService(SERVICE);
    ledId = (await service.getCharacteristic(LED)).id;
    render((await leftoverProgram()) ? 'recovered' : 'connected');
  } catch (err) {
    device.disconnect();
    throw err;
  }
}

// A program found after a reload has unknown status, and so does a failed lookup:
// either way it must be stopped before a new writer starts.
async function leftoverProgram() {
  if (!programs()) return false;
  try { return (await programs().getRegistrations()).some((r) => r.type === 'connection'); }
  catch { return true; }
}

function startForeground() {
  let next = 1;
  timer = setInterval(() => {
    if (inflight) return; // skip a tick rather than queue GATT writes
    inflight = write(next)
      .then(() => { next = next ? 0 : 1; }, (err) => {
        if (state !== 'foreground') return;
        clearInterval(timer);
        render(device.connected ? 'connected' : 'disconnected');
        report(err);
      })
      .finally(() => { inflight = undefined; });
  }, 500);
  render('foreground');
}

async function startBackground() {
  await programs().requestBackgroundConnection({
    deviceId: device.id,
    program: {
      deviceId: device.id,
      characteristicId: ledId,
      activeWhen: 'always', // visible or hidden
      cycle: { frames: [[0x01], [0x00]], timer: { cadence: 'uniform', everyMs: 2000 } },
    },
  });
  render('background');
}

async function stop() {
  clearInterval(timer);
  if (state !== 'foreground') {
    // Unregister first, from a fresh lookup. If it throws, the state stays and Stop retries.
    for (const r of await programs().getRegistrations()) if (r.type === 'connection') await r.unregister();
  }
  await inflight; // never let a late "on" land after "off"
  if (device?.connected) await write(0);
  render(device?.connected ? 'connected' : 'disconnected');
}

function onDrop() {
  if (state === 'foreground') clearInterval(timer);
  // A background program may still be registered: keep Stop on offer.
  render(state === 'background' || state === 'recovered' ? state : 'disconnected');
}

// The lamp shows only what the LED itself reported, by notification or read.
function show(view) {
  const byte = view.byteLength === 1 ? view.getUint8(0) : null;
  led = { 1: 'on', 0: 'off' }[byte] ?? 'unknown'; // BE AC, or anything else, is unknown
  drawLamp();
}

const LAMP = {
  none: { word: 'Not connected', label: 'LED not connected', caption: '' },
  unknown: { word: 'Connected', label: 'LED value unknown', caption: 'waiting for the LED to report on or off' },
  on: { word: 'On', label: 'LED on', caption: 'as reported by the LED' },
  off: { word: 'Off', label: 'LED off', caption: 'as reported by the LED' },
};

function drawLamp() {
  const value = device?.connected ? led : 'none';
  $('lamp').dataset.led = value;
  $('lamp').setAttribute('aria-label', LAMP[value].label);
  $('word').textContent = LAMP[value].word;
  $('caption').textContent = LAMP[value].caption;
}

const BUTTON = { disconnected: 'Connect', unsupported: 'Connect', connected: 'Start blinking' };
const STATUS = {
  disconnected: 'Turn on your LED, then tap Connect.',
  unsupported: 'Bluetooth isn’t available here. Open this page in Safari on an iPhone with beacio.',
  connected: 'Choose who keeps it blinking, then tap Start.',
  foreground: 'The page blinks the LED every half second. Lock your phone to see it slow down or stop.',
  background: 'beacio blinks the LED every 2 seconds, even with Safari hidden or the phone locked.',
  recovered: 'A program from an earlier visit may still be running. Stop it before you start again.',
};

function render(next = state) {
  state = next;
  const running = !BUTTON[state]; // foreground, background or recovered: the button is Stop
  const bg = $('bg-input');
  bg.disabled = Boolean(device) && !hasPrograms(); // only offer it when beacio supports programs
  if (state === 'recovered') bg.checked = true; // a leftover is a background program
  else if (bg.disabled) $('fg-input').checked = true;
  $('bg-d').textContent = bg.disabled
    ? 'Needs a beacio version with background programs.'
    : 'beacio keeps blinking, even with the phone locked.';
  $('modes').disabled = state !== 'connected';
  $('app').toggleAttribute('data-running', running);
  $('go').textContent = BUTTON[state] ?? 'Stop';
  $('msg').textContent = STATUS[state];
  $('setup').hidden = state !== 'unsupported';
  drawLamp();
}

function report(err) {
  $('msg').textContent = [err?.message ?? String(err), err?.suggestion].filter(Boolean).join(' ');
}

$('go').addEventListener('click', async () => {
  const go = $('go');
  go.disabled = true;
  try {
    if (state === 'disconnected' || state === 'unsupported') await connect(); // opens the chooser first
    else if (state === 'connected') await ($('bg-input').checked ? startBackground() : startForeground());
    else await stop();
  } catch (err) {
    report(err);
  } finally {
    go.disabled = false;
  }
});

// Never stop on hide. On return, read the LED: the page could not see it while hidden.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && device?.connected) read().then(show, report);
});

render();

// Blink a Bluetooth LED from Safari: the page blinks it, or beacio does in the background.
const { Beacio } = window.BeacioCore; // @beacio/core, loaded by index.html

const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
const LED = '0000fff1-0000-1000-8000-00805f9b34fb'; // read, write, notify: 01 on, 00 off
const $ = (id) => document.getElementById(id);

let state = 'disconnected'; // disconnected | unsupported | connected | foreground | background | recovered
let device, ledId, timer, inflight;
let led = 'unknown'; // what the LED last reported: on, off or unknown
let leftPage = false; // the page was hidden while it blinked (step 5 is done)

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
    const value = await read();
    show(value);
    // The background program needs beacio's instance id of the characteristic, not its UUID.
    const service = await device.raw.gatt.getPrimaryService(SERVICE);
    const characteristic = await service.getCharacteristic(LED);
    ledId = characteristic.id;
    if (await leftoverProgram()) render('recovered');
    else render('connected');
  } catch (err) {
    device.disconnect();
    throw err;
  }
}

// The blink programs beacio runs for this site, from this visit or an earlier one.
async function runningPrograms() {
  if (!programs()) return [];
  const registrations = await programs().getRegistrations();
  return registrations.filter((r) => r.type === 'connection');
}

// Before a new writer starts, a program we cannot look up counts as running.
async function leftoverProgram() {
  try {
    const running = await runningPrograms();
    return running.length > 0;
  } catch {
    return true;
  }
}

// On load, a program left running by an earlier visit gets the banner and its Stop button.
async function lookForLeftover() {
  try {
    const running = await runningPrograms();
    if (running.length > 0 && state === 'disconnected') render('recovered');
  } catch {
    // No answer yet: Connect looks again.
  }
}

function startForeground() {
  let next = 1;
  timer = setInterval(() => {
    if (inflight) return; // skip a tick rather than queue GATT writes
    inflight = write(next)
      .then(() => { next = next ? 0 : 1; }, onWriteError)
      .finally(() => { inflight = undefined; });
  }, 500);
  leftPage = false;
  render('foreground');
}

function onWriteError(err) {
  if (state !== 'foreground') return;
  clearInterval(timer);
  if (device.connected) render('connected');
  else render('disconnected');
  report(err);
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
  leftPage = false;
  render('background');
}

async function stop() {
  clearInterval(timer);
  if (state !== 'foreground') {
    // Unregister first, from a fresh lookup. If it throws, the state stays and Stop retries.
    for (const program of await runningPrograms()) await program.unregister();
  }
  await inflight; // never let a late "on" land after "off"
  if (device?.connected) {
    await write(0); // then off
    render('connected');
  } else {
    render('disconnected');
    // Not connected, so no off was sent. Say so, or this looks like a fresh load.
    $('msg').textContent = 'Stopped. The LED keeps its last state.';
  }
}

function onDrop() {
  if (state === 'foreground') clearInterval(timer);
  // A background program may still be registered: keep Stop on offer.
  if (state === 'background' || state === 'recovered') render();
  else render('disconnected');
}

// The lamp shows only what the LED itself reported. It is set from the value, never toggled,
// so a notification that arrives twice changes nothing.
function show(view) {
  const byte = view.byteLength === 1 ? view.getUint8(0) : undefined;
  if (byte === 1) led = 'on';
  else if (byte === 0) led = 'off';
  else led = 'unknown'; // BE AC, or anything else
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

// The steps you are on, out of the seven in index.html.
function currentSteps() {
  if (state === 'unsupported') return [1];
  if (state === 'disconnected') return [1, 2];
  if (state === 'connected') return [3, 4];
  if (state === 'recovered') return [7];
  if (leftPage) return [6, 7]; // back on the page, still blinking
  return [5];
}

// Highlight them in the list, and copy them into the card by the lamp.
function drawSteps() {
  const now = currentSteps();
  $('now').replaceChildren();
  for (const step of $('steps').children) {
    const current = now.includes(Number(step.dataset.step));
    step.classList.toggle('now', current);
    if (current) $('now').append(step.cloneNode(true));
  }
}

const BUTTON = {
  disconnected: 'Connect', unsupported: 'Connect', connected: 'Start blinking',
  foreground: 'Stop', background: 'Stop', recovered: 'Stop',
};

function render(next = state) {
  state = next;
  $('app').dataset.state = state; // index.html shows the banner, the card and the setup link from it
  const running = state === 'foreground' || state === 'background' || state === 'recovered';
  $('app').toggleAttribute('data-running', running);
  const bg = $('bg-input');
  bg.disabled = Boolean(device) && !hasPrograms(); // only offer it when beacio supports programs
  if (state === 'recovered') bg.checked = true; // a leftover is a background program
  else if (bg.disabled) $('fg-input').checked = true;
  if (bg.disabled) $('bg-d').textContent = 'Needs a beacio version with background programs.';
  else $('bg-d').textContent = 'beacio blinks it, even when locked.';
  $('modes').disabled = state !== 'connected';
  $('go').textContent = BUTTON[state];
  $('msg').textContent = '';
  drawSteps();
  drawLamp();
}

function report(err) {
  let text = err?.message ?? String(err);
  if (err?.suggestion) text += ' ' + err.suggestion;
  $('msg').textContent = text;
}

// One tap, one action. Both buttons wait while it runs; errors show under the main button.
async function run(action) {
  $('go').disabled = true;
  $('stop-leftover').disabled = true;
  try {
    await action();
  } catch (err) {
    report(err);
  } finally {
    $('go').disabled = false;
    $('stop-leftover').disabled = false;
  }
}

$('go').addEventListener('click', () => {
  if (state === 'disconnected' || state === 'unsupported') run(connect); // opens the chooser first
  else if (state === 'connected' && $('bg-input').checked) run(startBackground);
  else if (state === 'connected') run(startForeground);
  else run(stop);
});
$('stop-leftover').addEventListener('click', () => run(stop));

// Never stop on hide. On return, show step 6 and read the LED: the page could not see it while hidden.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state === 'foreground' || state === 'background') leftPage = true;
    return;
  }
  render();
  if (device?.connected) read().then(show, report);
});

render();
lookForLeftover();
window.addEventListener('beacio:extension:ready', lookForLeftover); // the extension may mount late

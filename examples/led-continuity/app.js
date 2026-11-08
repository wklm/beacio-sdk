// The page: the lamp, the steps, the banner and the buttons. blink.js does the Bluetooth part.
import {
  connect, readLed, blinkFromPage, blinkInBackground, backgroundPrograms, stopBackground, switchOff,
  canBlinkInBackground,
} from './blink.js';

const $ = (id) => document.getElementById(id);

let state = 'disconnected'; // disconnected | unsupported | connected | foreground | background | recovered
let device;
let stopPageBlink = async () => {}; // from blinkFromPage(), while the page blinks
let led = 'unknown'; // what the LED last reported: on, off or unknown
let leftPage = false; // the page was hidden while it blinked (step 5 is done)

async function connectLed() {
  // connect() opens the chooser at once, inside this tap.
  const connected = await connect({ onValue: show, onDisconnect: onDrop });
  if (!connected) return render('unsupported');
  device = connected;
  if (await leftoverProgram()) render('recovered');
  else render('connected');
}

// Before a new writer starts, a program we cannot look up counts as running.
async function leftoverProgram() {
  try {
    const running = await backgroundPrograms();
    return running.length > 0;
  } catch {
    return true;
  }
}

// On load, a program left running by an earlier visit gets the banner and its Stop button.
async function lookForLeftover() {
  try {
    const running = await backgroundPrograms();
    if (running.length > 0 && state === 'disconnected') render('recovered');
  } catch {
    // No answer yet: Connect looks again.
  }
}

function startForeground() {
  stopPageBlink = blinkFromPage(device, onWriteError);
  leftPage = false;
  render('foreground');
}

// A write from the page failed. blink.js has already stopped its timer.
function onWriteError(err) {
  if (state !== 'foreground') return;
  if (device.connected) render('connected');
  else render('disconnected');
  report(err);
}

async function startBackground() {
  await blinkInBackground(device);
  leftPage = false;
  render('background');
}

async function stop() {
  // Unregister first, from a fresh lookup. If it throws, the state stays and Stop retries.
  if (state !== 'foreground') await stopBackground();
  await stopPageBlink(); // never let a late "on" land after "off"
  if (device?.connected) {
    await switchOff(device); // then off
    render('connected');
  } else {
    render('disconnected');
    // Not connected, so no off was sent. Say so, or this looks like a fresh load.
    $('msg').textContent = 'Stopped. The LED keeps its last state.';
  }
}

function onDrop() {
  if (state === 'foreground') stopPageBlink();
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
  bg.disabled = Boolean(device) && !canBlinkInBackground(); // only offer it when beacio supports programs
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
  if (state === 'disconnected' || state === 'unsupported') run(connectLed); // opens the chooser first
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
  if (device?.connected) readLed(device).then(show, report);
});

render();
lookForLeftover();
window.addEventListener('beacio:extension:ready', lookForLeftover); // the extension may mount late

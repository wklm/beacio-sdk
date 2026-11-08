import './style.css';
import { LedController, describeError, type Mode } from './led-controller';
import { supportsNativeProgram } from './native-program';

function element<T extends HTMLElement>(id: string): T {
  const match = document.getElementById(id);
  if (!match) throw new Error(`Missing element: ${id}`);
  return match as T;
}

const connect = element<HTMLButtonElement>('connect');
const reconnect = element<HTMLButtonElement>('reconnect');
const disconnect = element<HTMLButtonElement>('disconnect');
const start = element<HTMLButtonElement>('start');
const stop = element<HTMLButtonElement>('stop');
const on = element<HTMLButtonElement>('on');
const off = element<HTMLButtonElement>('off');
const mode = element<HTMLSelectElement>('mode');
const errorBox = element<HTMLParagraphElement>('error');
const logBox = element<HTMLPreElement>('log');
const logLines: string[] = [];
let busy = false;

function log(message: string): void {
  logLines.push(`${new Date().toISOString().slice(11, 23)}  ${message}`);
  if (logLines.length > 150) logLines.shift();
  logBox.textContent = logLines.join('\n');
  logBox.scrollTop = logBox.scrollHeight;
}

function report(error: unknown): void {
  const text = describeError(error);
  errorBox.hidden = false;
  errorBox.textContent = text;
  log(`Error: ${text}`);
}

const controller = new LedController(render, log, report);

function selectedMode(): Mode { return mode.value === 'native' ? 'native' : 'browser'; }

function render(): void {
  const state = controller.state;
  const running = state.run !== 'stopped';
  const native = selectedMode() === 'native';
  const nativeSupported = supportsNativeProgram();
  element('connection').textContent = state.connected ? `${state.name} · connected` : 'Disconnected';
  element('led').dataset.state = state.led.toLowerCase();
  element('led-state').textContent = state.led;
  element('observed').textContent = state.observedAt ? `Last observed ${state.observedAt}` : 'No emulated peripheral value received yet';
  element('run-state').textContent = state.recovered ? 'Background continuity · status unknown'
    : state.run === 'native' ? 'Background continuity · 2 s per step'
      : state.run === 'browser' ? 'Foreground only · 500 ms per step' : 'Stopped';
  element('writes').textContent = String(state.writes);
  element('notifications').textContent = String(state.notifications);
  connect.disabled = busy || state.connected || running;
  reconnect.disabled = busy || state.connected || running;
  disconnect.disabled = busy || (!state.connected && !running);
  start.disabled = busy || !state.connected || running || (native && !nativeSupported);
  stop.disabled = busy || (!state.connected && !running);
  on.disabled = off.disabled = busy || !state.connected || running;
  mode.disabled = busy || running;
  element('mode-help').textContent = native
    ? nativeSupported
      ? 'Open beacio first and leave it running. It alternates on/off every 2 seconds while the page is visible or hidden. Timing is best effort.'
      : 'Background continuity requires the beacio extension with background program support. Foreground only works with Web Bluetooth.'
    : 'Alternates on/off every 500 ms while the page runs. Switching tabs, leaving Safari or locking the phone can slow or pause blinking.';
}

async function action(task: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  errorBox.hidden = true;
  render();
  try { await task(); } catch (error) { report(error); }
  finally { busy = false; render(); }
}

connect.addEventListener('click', () => { void action(() => controller.connect()); });
reconnect.addEventListener('click', () => { void action(() => controller.connect(true)); });
disconnect.addEventListener('click', () => { void action(() => controller.disconnect()); });
start.addEventListener('click', () => { void action(() => controller.start(selectedMode())); });
stop.addEventListener('click', () => { void action(() => controller.stop()); });
on.addEventListener('click', () => { void action(() => controller.manual(true)); });
off.addEventListener('click', () => { void action(() => controller.manual(false)); });
mode.addEventListener('change', render);
element('clear-log').addEventListener('click', () => { logLines.length = 0; logBox.textContent = ''; });

document.addEventListener('visibilitychange', () => {
  log(`Page ${document.visibilityState}`);
  // No visibility-based stop or cleanup: the app program should continue.
  // Read the peripheral on return; never animate a guessed background LED state.
  if (document.visibilityState === 'visible') void controller.refresh().catch(report);
});
window.addEventListener('pageshow', (event) => log(`pageshow; restored from cache: ${event.persisted}`));

log('Ready · emulated peripheral FFF0 / FFF1 · on=01 off=00');
render();
if (!window.isSecureContext) report(new Error('Open this page over HTTPS, or use localhost on this computer.'));

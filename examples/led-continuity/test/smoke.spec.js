// One smoke test: the real page and the real published SDK file, against a Bluetooth double.
// It does not prove radio behaviour or iOS background timing.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const here = (path) => new URL(path, import.meta.url);
const SDK = 'https://cdn.jsdelivr.net/npm/@beacio/core@2.2.0/dist/browser.global.js';
const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';

// Runs in the page before app.js. sessionStorage survives a reload, like a real registration.
function installDouble() {
  const saved = (key) => sessionStorage.getItem(key) === '1';
  const ble = (window.__ble = { writes: [], programs: [], order: [], inTap: null, requestOptions: null,
    get registered() { return saved('registered'); },
    set registered(on) { on ? sessionStorage.setItem('registered', '1') : sessionStorage.removeItem('registered'); } });
  let connected = false;
  const later = (value) => new Promise((done) => setTimeout(done, 0, value)); // a real IPC round trip

  const led = new EventTarget();
  Object.assign(led, {
    id: 'led-instance-id', uuid: '0000fff1-0000-1000-8000-00805f9b34fb', notifying: false,
    properties: { read: true, write: true, writeWithoutResponse: false, notify: true },
    value: new DataView(Uint8Array.of(0xbe, 0xac).buffer),
    async readValue() { return led.value; },
    async writeValueWithResponse(data) {
      const bytes = Array.from(new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength));
      ble.writes.push(bytes);
      ble.order.push(`write:${bytes[0]}`);
      led.value = new DataView(Uint8Array.from(bytes).buffer);
      if (led.notifying) led.dispatchEvent(new Event('characteristicvaluechanged')); // echo, like the emulator
    },
    async writeValue(data) { return led.writeValueWithResponse(data); },
    async startNotifications() { led.notifying = true; return led; },
    async stopNotifications() { led.notifying = false; return led; },
  });
  const service = { uuid: '0000fff0-0000-1000-8000-00805f9b34fb', getCharacteristic: async () => led, getCharacteristics: async () => [led] };
  const device = Object.assign(new EventTarget(), { id: 'led-device', name: 'EmulatedPeripheral' });
  device.gatt = {
    device, get connected() { return connected; },
    async connect() { connected = true; return device.gatt; },
    disconnect() { connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); },
    getPrimaryService: async () => service, getPrimaryServices: async () => [service],
  };

  const registration = { id: 'r1', type: 'connection', async unregister() { ble.order.push('unregister'); ble.registered = false; } };
  const backgroundSync = {
    async requestBackgroundConnection(options) {
      ble.programs.push(structuredClone(options));
      ble.order.push('register');
      ble.registered = true;
      return registration;
    },
    getRegistrations: () => later(ble.registered ? [registration] : []),
  };
  if (!saved('noPrograms')) backgroundSync.declareProgram = async () => ({});
  const bluetooth = {
    __beacio: true, backgroundSync,
    getAvailability: () => later(true),
    getDevices: () => later([device]),
    async requestDevice(options) {
      ble.requestOptions = options;
      ble.inTap = window.event?.type === 'click'; // called during the tap itself, before any await
      return device;
    },
  };
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: bluetooth });
  Object.defineProperty(navigator, 'beacio', { configurable: true, value: bluetooth });
}

test('blinks in both modes and stops cleanly', async ({ page }) => {
  await page.route('**', (route) => route.abort()); // no network at all
  await page.route('https://led.test/**', async (route) => {
    const file = new URL(route.request().url()).pathname === '/app.js' ? '../app.js' : '../index.html';
    await route.fulfill({ body: await readFile(here(file)), contentType: file.endsWith('.js') ? 'text/javascript' : 'text/html' });
  });
  // The published npm file, served at the CDN URL: Chromium enforces the page's SRI hash on it.
  await page.route(SDK, async (route) => route.fulfill({
    body: await readFile(here('node_modules/@beacio/core/dist/browser.global.js')),
    contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' },
  }));
  await page.addInitScript(installDouble);
  const ble = (key) => page.evaluate((k) => window.__ble[k], key);
  const button = page.locator('#go');
  const lamp = page.getByRole('img');
  const connect = async () => {
    await page.getByRole('button', { name: 'Connect' }).click();
    await expect(lamp).toHaveAccessibleName(/LED (on|off|value unknown)/);
  };

  await test.step('connects from the tap', async () => {
    await page.goto('https://led.test/');
    await expect(lamp).toHaveAccessibleName('LED not connected');
    await connect();
    expect(await ble('requestOptions')).toEqual({ filters: [{ services: [SERVICE] }] });
    expect(await ble('inTap')).toBe(true);
    await expect(lamp).toHaveAccessibleName('LED value unknown'); // BE AC
    await expect(button).toHaveText('Start blinking');
  });

  await test.step('foreground only: the page blinks every 500 ms', async () => {
    await button.click();
    await expect(lamp).toHaveAccessibleName('LED on'); // from the echoed notification
    await expect.poll(async () => (await ble('writes')).length).toBeGreaterThanOrEqual(3);
    expect((await ble('writes')).slice(0, 3)).toEqual([[1], [0], [1]]);
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(button).toHaveText('Start blinking');
    const count = (await ble('writes')).length;
    await page.waitForTimeout(650);
    const writes = await ble('writes');
    expect(writes.length).toBe(count);
    expect(writes.at(-1)).toEqual([0]);
    await expect(lamp).toHaveAccessibleName('LED off');
  });

  await test.step('background continuity: beacio runs the program; Stop unregisters before off', async () => {
    await page.getByRole('radio', { name: 'Background continuity' }).check();
    await button.click();
    await expect(button).toHaveText('Stop');
    expect(await ble('programs')).toEqual([{ deviceId: 'led-device', program: {
      deviceId: 'led-device', characteristicId: 'led-instance-id', activeWhen: 'always',
      cycle: { frames: [[1], [0]], timer: { cadence: 'uniform', everyMs: 2000 } } } }]);
    const writes = (await ble('writes')).length;
    await page.evaluate(() => {
      for (const hidden of [true, false]) {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
        document.dispatchEvent(new Event('visibilitychange'));
      }
    });
    await page.waitForTimeout(650);
    expect((await ble('writes')).length).toBe(writes); // the page itself writes nothing
    expect(await ble('registered')).toBe(true); // hiding the page never stops it
    await button.click();
    await expect(button).toHaveText('Start blinking');
    expect((await ble('order')).slice(-3)).toEqual(['register', 'unregister', 'write:0']);
  });

  await test.step('a program left from an earlier visit must be stopped first', async () => {
    await page.evaluate(() => { window.__ble.registered = true; });
    await page.reload();
    await connect();
    await expect(button).toHaveText('Stop');
    await expect(page.getByRole('status')).toContainText('earlier visit');
    await button.click();
    await expect(button).toHaveText('Start blinking');
    expect(await ble('registered')).toBe(false);
  });

  await test.step('without program support, only foreground is offered', async () => {
    await page.evaluate(() => sessionStorage.setItem('noPrograms', '1'));
    await page.reload();
    await connect();
    await expect(page.getByRole('radio', { name: 'Background continuity' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'Foreground only' })).toBeChecked();
    await button.click();
    await expect(lamp).toHaveAccessibleName('LED on');
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(button).toHaveText('Start blinking');
  });
});

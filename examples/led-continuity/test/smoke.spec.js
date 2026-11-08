// One smoke test: the real page and the real published SDK file, against a Bluetooth double.
// It does not prove radio behaviour or iOS background timing.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const here = (path) => new URL(path, import.meta.url);
const SDK = 'https://cdn.jsdelivr.net/npm/@beacio/core@2.2.0/dist/browser.global.js';
const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';

// Runs in the page before app.js and blink.js. sessionStorage survives a reload, like a real registration.
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
      // Echo, like the emulator. While beacio runs a value can arrive twice, so send it twice.
      if (led.notifying) led.dispatchEvent(new Event('characteristicvaluechanged'));
      if (led.notifying) led.dispatchEvent(new Event('characteristicvaluechanged'));
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

  // unregister completes on a later macrotask, so Stop must await it before writing off.
  const registration = { id: 'r1', type: 'connection',
    unregister: () => later().then(() => { ble.order.push('unregister'); ble.registered = false; }) };
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

test('guides each step, blinks in both modes and stops cleanly', async ({ page }) => {
  await page.route('**', (route) => route.abort()); // no network at all
  const served = []; // the files of this folder the page loaded, like a static host serves them
  await page.route('https://led.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = path === '/' ? 'index.html' : path.slice(1);
    const body = await readFile(here(`../${file}`)).catch(() => null);
    if (!body) return route.fulfill({ status: 404 });
    served.push(file);
    await route.fulfill({ body, contentType: file.endsWith('.js') ? 'text/javascript' : 'text/html' });
  });
  // The published npm file, served at the CDN URL: Chromium enforces the page's SRI hash on it.
  await page.route(SDK, async (route) => route.fulfill({
    body: await readFile(here('node_modules/@beacio/core/dist/browser.global.js')),
    contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' },
  }));
  await page.addInitScript(installDouble);
  const ble = (key) => page.evaluate((k) => window.__ble[k], key);
  const button = page.locator('#go');
  const lamp = page.getByRole('img', { name: /^LED/ });
  const steps = page.locator('#steps li.now');
  const card = page.locator('#now');
  const banner = page.getByRole('alert');
  const connect = async () => {
    await page.getByRole('button', { name: 'Connect' }).click();
    await expect(lamp).toHaveAccessibleName(/LED (on|off|value unknown)/);
    await expect(button).toHaveText(/Start blinking|Stop/); // connect() has finished and rendered
  };

  await test.step('the README pictures are the ones on the page', async () => {
    const html = await readFile(here('../index.html'), 'utf8');
    for (const name of ['flow.svg', 'timeline.svg']) {
      const file = await readFile(here(`../${name}`), 'utf8');
      // The file adds only its namespace and its own light and dark colours.
      const inline = file.replace(' xmlns="http://www.w3.org/2000/svg"', '').replace(/<style>.*<\/style>\n/, '').trim();
      expect(html).toContain(inline);
    }
  });

  await test.step('shows the seven steps, the two pictures and the facts', async () => {
    await page.goto('https://led.test/');
    await expect(lamp).toHaveAccessibleName('LED not connected');
    await expect(page.locator('#steps li')).toHaveCount(7);
    // Each step says what you see; step 5, with the page hidden, says to watch the LED itself.
    await expect(page.locator('#steps .see')).toHaveText([
      /^You see /, /^You see /, /^You see /, /^You see /, /^Watch the LED\. /, /^You see /, /^You see /]);
    await expect(steps).toHaveText([/^1Open the beacio app/, /^2Tap Connect/]);
    await expect(card).toContainText('Tap Connect');
    await expect(page.getByRole('img', { name: /^Who does what: this page/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /^Timeline: when the page is hidden/ })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'not an iOS limit' })).toBeVisible();
    await expect(banner).toBeHidden(); // nothing left running
  });

  await test.step('app.js loads blink.js, and Pages publishes every file the page loads', async () => {
    expect([...new Set(served)].sort()).toEqual(['app.js', 'blink.js', 'index.html']);
    const workflow = await readFile(here('../../../.github/workflows/led-continuity-pages.yml'), 'utf8');
    const publish = workflow.split('\n').find((line) => line.includes('mkdir _site'));
    for (const file of served) expect(publish).toContain(` examples/led-continuity/${file} `);
  });

  await test.step('connects from the tap', async () => {
    await connect();
    expect(await ble('requestOptions')).toEqual({ filters: [{ services: [SERVICE] }] });
    expect(await ble('inTap')).toBe(true);
    await expect(lamp).toHaveAccessibleName('LED value unknown'); // BE AC
    await expect(button).toHaveText('Start blinking');
    await expect(steps).toHaveText([/^3Pick/, /^4Tap Start/]);
  });

  await test.step('foreground only: the page blinks every 500 ms', async () => {
    await button.click();
    await expect(lamp).toHaveAccessibleName('LED on'); // from the echoed notification, delivered twice
    await expect(steps).toHaveText([/^5Leave Safari/]);
    await expect(card).toContainText('Leave Safari');
    await expect(card).toContainText('Foreground only: it slows, then stops.');
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
    await expect(steps).toHaveText([/^6Come back/, /^7Tap Stop/]);
    await expect(card).toContainText('Leaving the page never stops a background program.');
    await button.click();
    await expect(button).toHaveText('Start blinking');
    expect((await ble('order')).slice(-3)).toEqual(['register', 'unregister', 'write:0']);
  });

  await test.step('on load, a program from an earlier visit gets a banner with one Stop', async () => {
    await page.evaluate(() => { window.__ble.registered = true; });
    await page.reload();
    await expect(banner).toContainText('A blink program from your last visit is still running');
    await expect(button).toBeHidden(); // the banner's Stop is the only action
    await expect(steps).toHaveText([/^7Tap Stop/]);
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(banner).toBeHidden();
    expect(await ble('registered')).toBe(false);
    await expect(button).toHaveText('Connect');
    // Not connected, so no off was sent: the page says so instead of looking like a fresh load.
    expect((await ble('order')).at(-1)).toBe('unregister');
    await expect(page.locator('#msg')).toHaveText('Stopped. The LED keeps its last state.');
  });

  await test.step('a program found on connect must be stopped first, then off', async () => {
    await page.evaluate(() => { window.__ble.registered = true; });
    await connect();
    await expect(banner).toContainText('still running');
    await expect(page.getByRole('radio', { name: 'Background continuity' })).toBeChecked(); // the leftover is a program
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(button).toHaveText('Start blinking');
    expect(await ble('registered')).toBe(false);
    expect((await ble('order')).slice(-2)).toEqual(['unregister', 'write:0']);
  });

  await test.step('without program support, only foreground is offered', async () => {
    await page.evaluate(() => sessionStorage.setItem('noPrograms', '1'));
    await page.reload();
    await connect();
    await expect(page.getByRole('group')).toBeEnabled(); // so the radio below is disabled on its own
    await expect(page.getByRole('radio', { name: 'Background continuity' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'Foreground only' })).toBeChecked();
    await button.click();
    await expect(lamp).toHaveAccessibleName('LED on');
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(button).toHaveText('Start blinking');
  });
});

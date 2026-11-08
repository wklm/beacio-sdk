// One smoke test: the real page against a stub of navigator.bluetooth, the standard Web Bluetooth API
// plus beacio's backgroundSync. It does not prove radio behaviour or iOS background timing.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const here = (path) => new URL(path, import.meta.url);
const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';

// Runs in the page before app.js and blink.js. sessionStorage survives a reload, like a real registration.
function installDouble() {
  const saved = (key) => sessionStorage.getItem(key) === '1';
  const ble = (window.__ble = { writes: [], order: [], programs: [], overlaps: 0, busy: false, failNext: false,
    inTap: null, requestOptions: null,
    get registered() { return saved('registered'); },
    set registered(on) { on ? sessionStorage.setItem('registered', '1') : sessionStorage.removeItem('registered'); } });
  if (saved('noBluetooth')) return Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: undefined });
  const later = (value, ms = 0) => new Promise((done) => setTimeout(done, ms, value)); // a real IPC round trip

  // One GATT operation at a time, as in Web Bluetooth: a second one while one is pending is rejected.
  // A write takes longer than the page's 500 ms tick, so the page must skip a tick while one is pending.
  async function gatt(operation) {
    if (ble.busy) {
      ble.overlaps += 1;
      throw new DOMException('GATT operation already in progress.', 'NetworkError');
    }
    ble.busy = true;
    try { return await operation(); } finally { ble.busy = false; }
  }

  let connected = false;
  // The LED keeps its last value across visits; a new one starts at BE AC, like the emulator.
  const last = JSON.parse(sessionStorage.getItem('led') ?? '[190, 172]');
  const characteristic = Object.assign(new EventTarget(), {
    id: 'led-instance-id', uuid: '0000fff1-0000-1000-8000-00805f9b34fb', notifying: false,
    value: new DataView(Uint8Array.from(last).buffer),
    readValue: () => gatt(() => later(characteristic.value)),
    writeValue: (data) => gatt(async () => {
      const bytes = Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      ble.order.push(`write:${bytes}`);
      await later(undefined, 600);
      if (ble.failNext) {
        ble.failNext = false;
        throw new DOMException('GATT Server is disconnected. Cannot perform GATT operations.', 'NetworkError');
      }
      ble.writes.push(bytes);
      sessionStorage.setItem('led', JSON.stringify(bytes));
      characteristic.value = new DataView(Uint8Array.from(bytes).buffer);
      // Echo, like the emulator. While beacio runs a value can arrive twice, so send it twice.
      for (let i = 0; i < 2; i += 1) {
        if (characteristic.notifying) characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
      }
    }),
    async startNotifications() { characteristic.notifying = true; return characteristic; },
  });
  const service = { uuid: '0000fff0-0000-1000-8000-00805f9b34fb', getCharacteristic: async () => characteristic };
  const device = Object.assign(new EventTarget(), { id: 'led-device', name: 'EmulatedPeripheral' });
  device.gatt = {
    device, get connected() { return connected; },
    async connect() { connected = true; return device.gatt; },
    getPrimaryService: async () => service,
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
    getRegistrations: () => later(ble.registered ? [registration, { id: 'p1', type: 'periodic' }] : []),
  };
  const bluetooth = {
    async requestDevice(options) {
      ble.requestOptions = options;
      ble.inTap = window.event?.type === 'click'; // called during the tap itself, before any await
      return device;
    },
  };
  if (!saved('noPrograms')) bluetooth.backgroundSync = backgroundSync;
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: bluetooth });
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
  await page.addInitScript(installDouble);
  const ble = (key) => page.evaluate((k) => window.__ble[k], key);
  const flag = (key) => page.evaluate((k) => sessionStorage.setItem(k, '1'), key);
  const button = page.locator('#go');
  const lamp = page.getByRole('img', { name: /^LED/ });
  const steps = page.locator('#steps li.now');
  const card = page.locator('#now');
  const banner = page.getByRole('alert');
  const message = page.locator('#msg');
  const hideAndReturn = () => page.evaluate(() => {
    for (const hidden of [true, false]) {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    }
  });
  const connect = async () => {
    await page.getByRole('button', { name: 'Connect' }).click();
    await expect(lamp).toHaveAccessibleName(/LED (on|off|value unknown)/);
    await expect(button).toHaveText(/Start blinking|Stop/); // connectLed() has finished and rendered
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

  await test.step('foreground only: the page blinks, one write at a time, and Stop waits for the one in flight', async () => {
    await button.click();
    await expect(lamp).toHaveAccessibleName('LED on'); // from the echoed notification, delivered twice
    await expect(steps).toHaveText([/^5Leave Safari/]);
    await expect(card).toContainText('Leave Safari');
    await expect(card).toContainText('Foreground only: it slows, then stops.');
    await expect.poll(async () => (await ble('writes')).length).toBeGreaterThanOrEqual(3);
    expect((await ble('writes')).slice(0, 3)).toEqual([[1], [0], [1]]);
    await expect(lamp).toHaveAccessibleName(/LED (on|off)/); // the lamp follows each notified value
    await page.waitForFunction(() => window.__ble.busy); // a write is in flight
    await hideAndReturn(); // the page must not read now: that read would overlap the write
    await expect(steps).toHaveText([/^6Come back/, /^7Tap Stop/]);
    await page.waitForFunction(() => window.__ble.busy);
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(button).toHaveText('Start blinking');
    const count = (await ble('writes')).length;
    await page.waitForTimeout(650);
    const writes = await ble('writes');
    expect(writes.length).toBe(count);
    expect(writes.at(-1)).toEqual([0]);
    expect(await ble('overlaps')).toBe(0); // no write ever started while another was pending
    await expect(lamp).toHaveAccessibleName('LED off');
    await expect(message).toBeEmpty();
  });

  await test.step('background continuity: beacio runs the program; Stop unregisters before off', async () => {
    await page.getByRole('radio', { name: 'Background continuity' }).check();
    await button.click();
    await expect(button).toHaveText('Stop');
    expect(await ble('programs')).toEqual([{ deviceId: 'led-device', program: {
      deviceId: 'led-device', characteristicId: 'led-instance-id', activeWhen: 'always',
      cycle: { frames: [[1], [0]], timer: { cadence: 'uniform', everyMs: 2000 } } } }]);
    const writes = (await ble('writes')).length;
    await hideAndReturn();
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
    expect(await ble('order')).toEqual(['unregister']);
    await expect(message).toHaveText('Stopped. The LED keeps its last state.');
  });

  await test.step('a program found on connect must be stopped first, then off', async () => {
    await page.evaluate(() => { window.__ble.registered = true; });
    await connect();
    await expect(lamp).toHaveAccessibleName('LED off'); // read on connect: the LED kept its last value
    await expect(banner).toContainText('still running');
    await expect(page.getByRole('radio', { name: 'Background continuity' })).toBeChecked(); // the leftover is a program
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(button).toHaveText('Start blinking');
    expect(await ble('registered')).toBe(false);
    expect((await ble('order')).slice(-2)).toEqual(['unregister', 'write:0']);
  });

  await test.step('without backgroundSync, only foreground is offered', async () => {
    await flag('noPrograms');
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

  await test.step('a failed write stops the page blinking and shows the error', async () => {
    await button.click();
    await page.evaluate(() => { window.__ble.failNext = true; });
    await expect(message).toHaveText('GATT Server is disconnected. Cannot perform GATT operations.');
    await expect(button).toHaveText('Start blinking');
    const count = (await ble('writes')).length;
    await page.waitForTimeout(1300);
    expect((await ble('writes')).length).toBe(count); // the timer stopped
  });

  await test.step('without navigator.bluetooth, Connect points to the setup', async () => {
    await flag('noBluetooth');
    await page.reload();
    await button.click();
    await expect(page.getByRole('link', { name: 'Set up beacio' })).toBeVisible();
    await expect(steps).toHaveText([/^1Open the beacio app/]);
    await expect(message).toBeEmpty();
  });
});

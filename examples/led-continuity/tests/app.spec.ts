import { test, expect } from '@playwright/test';
import { installPeripheral } from './bluetooth-peripheral';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installPeripheral);
  await page.goto('/');
});

test('connects from the gesture and shows peripheral-confirmed LED values', async ({ page }) => {
  await page.getByRole('button', { name: 'Connect emulated peripheral', exact: true }).click();
  await expect(page.locator('#connection')).toHaveText('EmulatedPeripheral · connected');
  expect(await page.evaluate(() => window.__peripheral.userActivation)).toBe(true);
  expect(await page.evaluate(() => window.__peripheral.requestOptions)).toMatchObject({
    filters: [{ services: ['0000fff0-0000-1000-8000-00805f9b34fb'] }]
  });
  await expect(page.locator('#led-state')).toHaveText('Unknown');
  await page.getByRole('button', { name: 'LED on', exact: true }).click();
  await expect(page.locator('#led-state')).toHaveText('On');
  await page.getByRole('button', { name: 'LED off', exact: true }).click();
  await expect(page.locator('#led-state')).toHaveText('Off');
  expect(await page.evaluate(() => window.__peripheral.writes)).toEqual([[1], [0]]);

  // An ACK alone cannot prove the peripheral echoed a new observed value.
  await page.evaluate(() => { window.__peripheral.echo = false; });
  await page.getByRole('button', { name: 'LED on', exact: true }).click();
  await expect(page.locator('#led-state')).toHaveText('Off');
});

test('reproduces the original 500 ms loop and stops all later browser writes', async ({ page }) => {
  await page.getByRole('button', { name: 'Connect emulated peripheral', exact: true }).click();
  await page.getByRole('button', { name: 'Start blinking', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__peripheral.writes.length)).toBeGreaterThanOrEqual(3);
  const writes = await page.evaluate(() => window.__peripheral.writes.slice(0, 3));
  expect(writes).toEqual([[1], [0], [1]]);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const count = await page.evaluate(() => window.__peripheral.writes.length);
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => window.__peripheral.writes.length)).toBe(count);
  await expect(page.locator('#led-state')).toHaveText('Off');
});

test('hands the native app the whole always-active cycle and unregisters before LED off', async ({ page }) => {
  await page.getByRole('button', { name: 'Connect emulated peripheral', exact: true }).click();
  await page.getByLabel('Blinking mode').selectOption('native');
  await page.getByRole('button', { name: 'Start blinking', exact: true }).click();
  await expect(page.locator('#run-state')).toHaveText('Background continuity · 2 s per step');
  expect(await page.evaluate(() => window.__peripheral.programs)).toEqual([{
    deviceId: 'peripheral-device',
    program: {
      deviceId: 'peripheral-device',
      characteristicId: 'peripheral-characteristic-instance',
      activeWhen: 'always',
      cycle: { frames: [[1], [0]], timer: { cadence: 'uniform', everyMs: 2000 } }
    }
  }]);
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => window.__peripheral.writes)).toEqual([]);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  expect(await page.evaluate(() => window.__peripheral.order)).toEqual(['register', 'unregister', 'write:0']);
});

test('a failed native registration leaves the manual controls usable', async ({ page }) => {
  await page.getByRole('button', { name: 'Connect emulated peripheral', exact: true }).click();
  await page.evaluate(() => { window.__peripheral.failRegistration = true; });
  await page.getByLabel('Blinking mode').selectOption('native');
  await page.getByRole('button', { name: 'Start blinking', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Open beacio first');
  await expect(page.locator('#run-state')).toHaveText('Stopped');
  await page.getByRole('button', { name: 'LED on', exact: true }).click();
  await expect(page.locator('#led-state')).toHaveText('On');
});

test('a failed unregister preserves Stop and does not start a competing writer', async ({ page }) => {
  await page.getByRole('button', { name: 'Connect emulated peripheral', exact: true }).click();
  await page.getByLabel('Blinking mode').selectOption('native');
  await page.getByRole('button', { name: 'Start blinking', exact: true }).click();
  await expect(page.locator('#run-state')).toContainText('Background continuity');
  await page.evaluate(() => { window.__peripheral.failUnregister = true; });
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('App unreachable');
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'LED on', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.__peripheral.registered)).toBe(true);
  expect(await page.evaluate(() => window.__peripheral.writes)).toEqual([]);
  await page.evaluate(() => { window.__peripheral.failUnregister = false; });
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('#led-state')).toHaveText('Off');
});

test('missing program support disables only native mode', async ({ page }) => {
  await page.evaluate(() => window.__removeNativeAPI());
  await page.getByRole('button', { name: 'Connect emulated peripheral', exact: true }).click();
  await page.getByLabel('Blinking mode').selectOption('native');
  await expect(page.getByRole('button', { name: 'Start blinking', exact: true })).toBeDisabled();
  await expect(page.locator('#mode-help')).toContainText('background program support');
  await page.getByLabel('Blinking mode').selectOption('browser');
  await expect(page.getByRole('button', { name: 'Start blinking', exact: true })).toBeEnabled();
});

test('a dropped link stops the browser loop and allows reconnect without another chooser', async ({ page }) => {
  await page.getByRole('button', { name: 'Connect emulated peripheral', exact: true }).click();
  await page.getByRole('button', { name: 'Start blinking', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__peripheral.writes.length)).toBeGreaterThan(0);
  await page.evaluate(() => window.__dropPeripheral());
  await expect(page.locator('#connection')).toHaveText('Disconnected');
  const count = await page.evaluate(() => window.__peripheral.writes.length);
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => window.__peripheral.writes.length)).toBe(count);
  await page.getByRole('button', { name: 'Reconnect emulated peripheral', exact: true }).click();
  await expect(page.locator('#connection')).toHaveText('EmulatedPeripheral · connected');
  await expect(page.locator('#run-state')).toHaveText('Stopped');
});

test('unknown registration ownership blocks new writers until Stop can inspect and remove it', async ({ page }) => {
  await page.evaluate(() => {
    window.__peripheral.registered = true;
    window.__peripheral.failRegistrationLookup = true;
  });
  await page.getByRole('button', { name: 'Connect emulated peripheral', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start blinking', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'LED on', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  await page.evaluate(() => { window.__peripheral.failRegistrationLookup = false; });
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  expect(await page.evaluate(() => window.__peripheral.registered)).toBe(false);
  await expect(page.getByRole('button', { name: 'Start blinking', exact: true })).toBeEnabled();
});

test('visibility changes preserve the native registration and refresh the observed value on return', async ({ page }) => {
  await page.getByRole('button', { name: 'Connect emulated peripheral', exact: true }).click();
  await page.getByLabel('Blinking mode').selectOption('native');
  await page.getByRole('button', { name: 'Start blinking', exact: true }).click();
  await expect(page.locator('#run-state')).toContainText('Background continuity');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.__peripheral.registered)).toBe(true);
  const reads = await page.evaluate(() => window.__peripheral.reads);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.__peripheral.reads)).toBe(reads + 1);
  expect(await page.evaluate(() => window.__peripheral.registered)).toBe(true);
  expect(await page.evaluate(() => window.__peripheral.order)).not.toContain('unregister');
});

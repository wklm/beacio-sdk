#!/usr/bin/env node
// Emulates the BLE peripheral the LED continuity demo expects (contract in README.md):
// service FFF0, characteristic FFF1 with read, write (with response) and notify.
// Runs on macOS or Linux through @stoprocent/bleno (MIT).
import bleno from '@stoprocent/bleno';

const { Characteristic, PrimaryService } = bleno;

const SERVICE_UUID = '0000FFF0-0000-1000-8000-00805F9B34FB';
const CHARACTERISTIC_UUID = '0000FFF1-0000-1000-8000-00805F9B34FB';
const DEVICE_NAME = 'EmulatedPeripheral';
const POWER_ON_TIMEOUT_MS = 10_000;

const ON = Buffer.from([0x01]);
const OFF = Buffer.from([0x00]);

// Initial value BE AC, which the page displays as Unknown.
let value = Buffer.from([0xbe, 0xac]);
// Subscribed centrals: connection handle -> bleno's notify callback.
const subscribers = new Map();

const describe = (bytes) =>
  bytes.equals(ON) ? 'On (01)' : bytes.equals(OFF) ? 'Off (00)' : `unknown (${bytes.toString('hex').toUpperCase()})`;

const led = new Characteristic({
  uuid: CHARACTERISTIC_UUID,
  properties: ['read', 'write', 'notify'],
  onReadRequest(_handle, offset, callback) {
    if (offset > value.length) {
      callback(Characteristic.RESULT_INVALID_OFFSET);
      return;
    }
    callback(Characteristic.RESULT_SUCCESS, value.subarray(offset));
  },
  onWriteRequest(_handle, data, offset, _withoutResponse, callback) {
    if (offset !== 0) {
      callback(Characteristic.RESULT_ATTR_NOT_LONG);
      return;
    }
    // Store the value, notify every subscriber, then acknowledge the write.
    value = Buffer.from(data);
    console.log(`[write] ${describe(value)}`);
    for (const notify of subscribers.values()) notify(value);
    callback(Characteristic.RESULT_SUCCESS);
  },
  onSubscribe(handle, _maxValueSize, notify) {
    subscribers.set(handle, notify);
    console.log('[*] Central subscribed to notifications');
  },
  onUnsubscribe(handle) {
    subscribers.delete(handle);
    console.log('[*] Central unsubscribed from notifications');
  },
});

bleno.on('accept', (address) => console.log(`[+] Central connected: ${address}`));
bleno.on('disconnect', (address, handle) => {
  subscribers.delete(handle);
  console.log(`[-] Central disconnected: ${address}`);
});

let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping peripheral...');
  try {
    await bleno.stopAdvertisingAsync();
  } catch {
    // Advertising may not have started; nothing else to undo.
  }
  bleno.stop();
  process.exit(code);
}

async function main() {
  try {
    await bleno.waitForPoweredOnAsync(POWER_ON_TIMEOUT_MS);
  } catch {
    console.error(`Bluetooth is not powered on (state: ${bleno.state}).`);
    console.error('macOS: turn Bluetooth on and allow it for this terminal app in System Settings > Privacy & Security > Bluetooth.');
    console.error('Linux: stop bluetoothd and give Node raw-socket access; see README.md.');
    process.exit(1);
  }

  await bleno.startAdvertisingAsync(DEVICE_NAME, [SERVICE_UUID]);
  await bleno.setServicesAsync([new PrimaryService({ uuid: SERVICE_UUID, characteristics: [led] })]);

  console.log(`Peripheral "${DEVICE_NAME}" is advertising.`);
  console.log(`  Service:        ${SERVICE_UUID}`);
  console.log(`  Characteristic: ${CHARACTERISTIC_UUID} (value ${value.toString('hex').toUpperCase()})`);
  console.log('Keep this running while you test from Safari on iPhone. Press Ctrl+C to stop.');

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error) => {
  console.error('Could not start the peripheral:', error);
  void shutdown(1);
});

#!/usr/bin/env node
import { Adapter } from 'simplejsble';

const SERVICE_UUID = '0000FFF0-0000-1000-8000-00805F9B34FB';
const CHAR_UUID = '0000FFF1-0000-1000-8000-00805F9B34FB';
const DEVICE_NAME = 'EmulatedPeripheral';

async function main() {
  const adapters = await Adapter.getAdapters();
  if (!adapters.length) {
    console.error('No Bluetooth adapters available.');
    process.exit(1);
  }

  const adapter = adapters[0];
  console.log(`Using Bluetooth adapter: ${adapter.identifier()}`);

  const peripheral = adapter.createLocalPeripheral();
  peripheral.setAdvertisementLocalName(DEVICE_NAME);
  peripheral.addAdvertisedService(SERVICE_UUID);

  const service = peripheral.addService(SERVICE_UUID);
  const characteristic = service.addCharacteristic(CHAR_UUID, [
    'read',
    'writeRequest',
    'writeCommand',
    'notify',
  ]);

  // Initial fixture value: 0xBE, 0xAC ("Unknown" in the web UI)
  await characteristic.setValue(Buffer.from([0xbe, 0xac]));

  peripheral.on('clientConnected', (client) => {
    console.log(`[+] Central connected: ${client}`);
  });

  peripheral.on('clientDisconnected', (client) => {
    console.log(`[-] Central disconnected: ${client}`);
  });

  characteristic.on('write', async (value) => {
    const hex = value.toString('hex').toUpperCase();
    const state = value.equals(Buffer.from([0x01]))
      ? 'ON (01)'
      : value.equals(Buffer.from([0x00]))
      ? 'OFF (00)'
      : `CUSTOM (${hex})`;

    console.log(`[WRITE] State updated to ${state}`);
    // Update local value and publish notification to subscribed centrals
    await characteristic.setValue(value);
  });

  characteristic.on('subscribed', () => {
    console.log('[*] Central subscribed to characteristic notifications');
  });

  characteristic.on('unsubscribed', () => {
    console.log('[*] Central unsubscribed from notifications');
  });

  await peripheral.start();

  console.log('\n======================================================');
  console.log(` Peripheral "${DEVICE_NAME}" is active and advertising `);
  console.log(` Service:        ${SERVICE_UUID}`);
  console.log(` Characteristic: ${CHAR_UUID}`);
  console.log('======================================================');
  console.log('Keep this process running while testing from Safari on iOS.');
  console.log('Press Ctrl+C to stop.\n');

  const shutdown = async () => {
    console.log('\nStopping peripheral...');
    try {
      await peripheral.stop();
      await adapter.close();
    } catch {
      // Ignore teardown errors during exit
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error starting peripheral:', err);
  process.exit(1);
});

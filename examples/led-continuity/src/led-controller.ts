import { Beacio, BeacioError, type BeacioDevice } from '@beacio/core';
import { backgroundSync, startNativeProgram, type ConnectionRegistration } from './native-program';

export const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
export const CHARACTERISTIC = '0000fff1-0000-1000-8000-00805f9b34fb';
export type Mode = 'browser' | 'native';
export type Led = 'On' | 'Off' | 'Unknown';

export interface State {
  connected: boolean;
  name: string;
  run: Mode | 'stopped';
  recovered: boolean;
  led: Led;
  observedAt: string;
  writes: number;
  notifications: number;
}

export function describeError(error: unknown): string {
  if (error instanceof BeacioError) {
    return `${error.message}${error.suggestion ? ` ${error.suggestion}` : ''}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export class LedController {
  readonly state: State = {
    connected: false, name: '', run: 'stopped', recovered: false,
    led: 'Unknown', observedAt: '', writes: 0, notifications: 0
  };
  private device: BeacioDevice | undefined;
  private characteristicId: string | undefined;
  private registration: ConnectionRegistration | undefined;
  private registrationLookupFailed = false;
  private unsubscribe: (() => void) | undefined;
  private unlisten: (() => void) | undefined;
  private timer: number | undefined;
  private pendingWrite: Promise<void> | undefined;

  constructor(
    private readonly update: () => void,
    private readonly log: (message: string) => void,
    private readonly report: (error: unknown) => void
  ) {}

  async connect(saved = false): Promise<void> {
    // Construct on the click: Safari's extension may mount after the page loads.
    const ble = new Beacio();
    // The chooser must be reached before any awaited availability/cleanup call.
    const device = saved
      ? (await ble.getDevices()).find((entry) => entry.id === localStorage.getItem('peripheral-device'))
      : await ble.requestDevice({ filters: [{ services: [SERVICE] }] });
    if (!device) throw new Error('No saved emulated peripheral is available. Use Connect emulated peripheral first.');

    this.unsubscribe?.();
    this.unlisten?.();
    this.device = device;
    this.unlisten = device.on('disconnected', () => {
      this.clearTimer();
      this.state.connected = false;
      this.state.led = 'Unknown';
      this.state.run = this.registration || this.registrationLookupFailed ? 'native' : 'stopped';
      this.log('gattserverdisconnected');
      this.update();
    });
    try {
      await device.connect();
      const services = await device.getPrimaryServices();
      const service = services.find((entry) => entry.uuid.toLowerCase() === SERVICE);
      if (!service) throw new Error('The selected device does not expose peripheral service FFF0.');
      const characteristic = await service.getCharacteristic(CHARACTERISTIC);
      const native = characteristic as BluetoothRemoteGATTCharacteristic & { readonly id?: string };
      this.characteristicId = native.id;
      this.unsubscribe = await device.subscribeAsync(SERVICE, CHARACTERISTIC, (value) => {
        this.state.notifications += 1;
        this.observe(value);
      }, { autoRecover: false });
      this.state.connected = true;
      this.state.name = device.name ?? 'Emulated peripheral';
      localStorage.setItem('peripheral-device', device.id);
      this.log(`Connected ${this.state.name}; notifications subscribed`);
      await this.refresh();

      // Reloading the page must not make an existing app-owned writer un-stoppable.
      // Its registration alone cannot establish whether a program is still running.
      if (!this.registration) {
        const api = backgroundSync();
        if (api) {
          try {
            this.registration = (await api.getRegistrations()).find((entry) => entry.type === 'connection');
            this.registrationLookupFailed = false;
            if (this.registration) {
              this.state.run = 'native';
              this.state.recovered = true;
              this.log('Recovered saved native registration; stop it before starting another writer');
            }
          } catch (error) {
            // Failure to read ownership is not evidence that no native writer exists.
            this.registrationLookupFailed = true;
            this.state.run = 'native';
            this.state.recovered = true;
            this.report(error);
            this.log('Native registration status unknown; Stop will retry inspection before allowing page writes');
          }
        }
      }
      this.update();
    } catch (error) {
      this.unsubscribe?.();
      device.disconnect();
      throw error;
    }
  }

  async start(mode: Mode): Promise<void> {
    const device = this.requireDevice();
    if (this.state.run !== 'stopped') throw new Error('Stop the current sequence first.');
    if (mode === 'native') {
      if (!this.characteristicId) throw new Error('The extension did not expose a characteristic instance ID.');
      this.registration = await startNativeProgram(device.id, this.characteristicId);
      this.state.run = 'native';
      this.state.recovered = false;
      this.log(`Native sequence registered: ${this.registration.id}; 2000 ms per step`);
    } else {
      this.state.run = 'browser';
      let nextOn = true;
      let lastTick = performance.now();
      this.timer = window.setInterval(() => {
        const now = performance.now();
        const gap = Math.round(now - lastTick);
        lastTick = now;
        // Do not accumulate GATT writes when a tick takes longer than 500 ms.
        if (this.pendingWrite) { this.log(`Tick gap ${gap} ms; previous write still pending`); return; }
        const pending = this.write(nextOn ? 1 : 0);
        this.pendingWrite = pending;
        void pending.then(() => {
          nextOn = !nextOn;
          this.log(`Browser tick gap ${gap} ms`);
        }).catch((error: unknown) => {
          this.clearTimer();
          this.state.run = 'stopped';
          this.report(error);
        }).finally(() => {
          if (this.pendingWrite === pending) this.pendingWrite = undefined;
          this.update();
        });
      }, 500);
      this.log('Browser setInterval started: 500 ms; Safari may throttle or pause it');
    }
    this.update();
  }

  async stop(): Promise<void> {
    this.clearTimer();
    if (this.registrationLookupFailed) {
      const api = backgroundSync();
      if (!api) throw new Error('The native API is unavailable; registration status is still unknown.');
      this.registration = (await api.getRegistrations()).find((entry) => entry.type === 'connection');
      this.registrationLookupFailed = false;
    }
    // Preserve the handle and run state if unregister fails: let Stop retry,
    // and never start a second writer while the app may still be writing.
    if (this.registration) {
      await this.registration.unregister();
      this.registration = undefined;
      this.log('Native registration removed');
    }
    await this.pendingWrite?.catch(() => undefined);
    this.state.run = 'stopped';
    this.state.recovered = false;
    // Unregister only stops future writes; explicitly send OFF for this peripheral.
    if (this.state.connected) await this.write(0);
    this.log('Stopped');
    this.update();
  }

  async manual(on: boolean): Promise<void> {
    if (this.state.run !== 'stopped') throw new Error('Stop blinking before a manual write.');
    await this.write(on ? 1 : 0);
  }

  async disconnect(): Promise<void> {
    await this.stop();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.device?.disconnect();
  }

  async refresh(): Promise<void> {
    if (!this.state.connected) return;
    const value = await this.requireDevice().read(SERVICE, CHARACTERISTIC, { timeoutMs: 3000 });
    this.observe(value);
    this.log(`Read peripheral: ${Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
      .map((byte) => byte.toString(16).padStart(2, '0')).join(' ')}`);
  }

  private requireDevice(): BeacioDevice {
    if (!this.device || !this.state.connected) throw new Error('Connect the emulated peripheral first.');
    return this.device;
  }

  private async write(value: number): Promise<void> {
    const device = this.requireDevice();
    const start = performance.now();
    await device.write(SERVICE, CHARACTERISTIC, new Uint8Array([value]), { mode: 'with-response', timeoutMs: 4000 });
    this.state.writes += 1;
    this.log(`Write ${value.toString(16).padStart(2, '0')} acknowledged in ${Math.round(performance.now() - start)} ms`);
    this.update();
  }

  private observe(value: DataView): void {
    const byte = value.byteLength === 1 ? value.getUint8(0) : undefined;
    this.state.led = byte === 1 ? 'On' : byte === 0 ? 'Off' : 'Unknown';
    this.state.observedAt = new Date().toLocaleTimeString();
    this.update();
  }

  private clearTimer(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }
}

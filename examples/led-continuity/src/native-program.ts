// The background program API is newer than the published @beacio/core types.
// Keep this small boundary local; ordinary BLE operations still use the SDK.
export interface ConnectionRegistration {
  readonly id: string;
  readonly type: string;
  unregister(): Promise<void>;
}

interface ProgramOptions {
  deviceId: string;
  program: {
    deviceId: string;
    characteristicId: string;
    activeWhen: 'always';
    cycle: {
      frames: number[][];
      timer: { cadence: 'uniform'; everyMs: number };
    };
  };
}

export interface NativeBackgroundSync {
  declareProgram?: unknown;
  requestBackgroundConnection(options: ProgramOptions): Promise<ConnectionRegistration>;
  getRegistrations(): Promise<ConnectionRegistration[]>;
}

export function backgroundSync(): NativeBackgroundSync | undefined {
  const nav = navigator as Navigator & {
    beacio?: { backgroundSync?: NativeBackgroundSync };
    bluetooth?: Bluetooth & { backgroundSync?: NativeBackgroundSync };
  };
  return nav.beacio?.backgroundSync ?? nav.bluetooth?.backgroundSync;
}

export function supportsNativeProgram(): boolean {
  return typeof backgroundSync()?.declareProgram === 'function';
}

export async function startNativeProgram(
  deviceId: string,
  characteristicId: string
): Promise<ConnectionRegistration> {
  const api = backgroundSync();
  if (!api || !supportsNativeProgram()) {
    throw new Error('Background continuity requires a beacio build with background program support.');
  }

  // FFF1 in the peripheral's normal profile stores and echoes these bytes.
  // These are emulated-peripheral commands; real devices may need different payloads.
  return api.requestBackgroundConnection({
    deviceId,
    program: {
      deviceId,
      // This is the discovered instance ID; passing the FFF1 UUID is incorrect.
      characteristicId,
      // The app executes this while Safari is visible or hidden.
      activeWhen: 'always',
      cycle: {
        frames: [[0x01], [0x00]],
        // beacio's current policy minimum, rather than an iOS platform limit.
        // Each frame lasts a target 2 s, giving a target 4 s full cycle.
        timer: { cadence: 'uniform', everyMs: 2000 }
      }
    }
  });
}

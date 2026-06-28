import { readUint8 } from '@beacio/core';
import { BaseProfile } from './base';

/**
 * BLE Battery Service profile (UUID 0x180F).
 *
 * Reads and subscribes to the Battery Level characteristic (0x2A19),
 * which reports the current charge level as a percentage (0--100).
 *
 * @example
 * ```ts
 * import { BatteryProfile } from '@beacio/profiles';
 *
 * const battery = new BatteryProfile(device);
 * await battery.connect();
 *
 * // One-shot read
 * const level = await battery.readLevel();
 * console.log(`Battery: ${level}%`);
 *
 * // Subscribe to level changes
 * const unsubscribe = battery.onLevelChange((level) => {
 *   console.log(`Battery changed: ${level}%`);
 * });
 *
 * // Clean up
 * unsubscribe();
 * battery.stop();
 * ```
 */
export class BatteryProfile extends BaseProfile {
  protected readonly service = 'battery_service';

  /** Read current battery level (0-100). */
  async readLevel(): Promise<number> {
    const dv = await this.read('battery_level');
    return readUint8(dv);
  }

  /** Subscribe to battery level changes. Returns unsubscribe function. */
  onLevelChange(callback: (level: number) => void): () => void {
    return this.subscribe('battery_level', (dv) => {
      callback(readUint8(dv));
    });
  }
}

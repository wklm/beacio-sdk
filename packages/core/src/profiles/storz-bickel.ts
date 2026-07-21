import { readUint8, readUint16LE, clampPercent, type Percentage, type NativeOverflowEvent } from '../index';
import { BaseProfile } from './base';
import { deriveOptionalServices } from './services';

/**
 * Storz & Bickel Crafty / Crafty+ / Mighty / Mighty+ vaporizer profile.
 *
 * @experimental UUIDs from PUBLIC reverse-engineering — standard-validated,
 * on-device deferred to operator. Storz & Bickel publishes no official GATT
 * specification; every UUID and decode below is derived from the vendor's own
 * (minified) Web Bluetooth bundle plus independent community re-implementations,
 * then cross-checked. The accessors exposed here cover only the HIGH-confidence
 * characteristics (corroborated by the official bundle AND >= 1 independent
 * source).
 *
 * Standard-grounded validation (the present trust basis): conformance to the
 * Web Bluetooth Living Standard (https://webbluetoothcg.github.io/web-bluetooth/)
 * is the authority for the runtime GATT contracts each accessor exercises —
 *   - §4 Device Discovery — `requestDevice({ filters, optionalServices })`
 *     (GAP-1 fix: optionalServices must be declared so iOS discover resolves),
 *   - §6 GATT Interaction — `getPrimaryService(uuid)` / `getCharacteristic(uuid)`
 *     (BluetoothRemoteGATTService uuid per §6.3),
 *   - §6.4 — `characteristic.readValue()` returns `Promise<DataView>`; the
 *     profile's `decodeTemperatureDeciCelsius` consumes `DataView.getInt16`
 *     little-endian and `decodeBatteryPercent` consumes `DataView.getUint8` —
 *     spec-conformant reads,
 *   - §6.4 — `characteristic.writeValue(value: BufferSource)` /
 *     `writeValueWithResponse` / `writeValueWithoutResponse` (BufferSource input;
 *     the profile's `encodeTemperatureDeciCelsius` produces a `DataView` — a
 *     valid BufferSource),
 *   - §6.4 — `characteristic.startNotifications()` => `characteristicvaluechanged`
 *     event with `event.target.value: DataView`; the profile subscribes
 *     exclusively via `BaseProfile.subscribe` (per the "Notifications" note above)
 *     and never writes a CCCD/SCCD descriptor itself — strictly W3C GATT,
 *   - §7.1 Standardized UUIDs — `BluetoothUUID.canonicalUUID` resolves to the
 *     lowercase 128-bit form (e.g. `00001818-0000-1000-8000-00805f9b34fb`);
 *     this profile stores UUIDs uppercase internally (beacio convention — see
 *     `NormalizedUUID`) and emits them lowercase to web-facing payloads (matches
 *     the spec's external canonical form).
 * The S&B-derived UUID/opcode VALUES themselves are interface-only
 * interoperability facts (see the 5+ source corroboration block immediately
 * below) and have NOT been exercised on physical hardware through this library.
 * On-device confirmation against a real Volcano/Crafty/Venty is an
 * operator-supplied gate, tracked separately at
 * `outreach/storz-bickel/onboarding/reviews/PR178-fixes/IP-02.md`. Treat
 * reads/writes as standard-conformant in SHAPE but provisional in VALUE until
 * device-confirmed.
 *
 * Device family & encoding
 * -------------------------
 * The Crafty/Mighty line shares a single GATT tree. The 96-bit vendor base is
 * ASCII `STORZ&BICKEL` written **byte-reversed** (`…-4c45-4b43-4942-265a524f5453`,
 * which decodes to `LEKCIB&ZROTS`). The sibling Volcano Hybrid line uses the
 * *big-endian* form of the same base (`…-5354-4f52-5a26-4249434b454c`) and a
 * different characteristic map; it is intentionally out of scope for this
 * profile. Mighty/Mighty+ reuse the identical Crafty tree and are
 * disambiguated at runtime via the model characteristic (`0x22`).
 *
 * Temperatures are little-endian uint16 in tenths of a degree Celsius
 * (deciCelsius): raw `1822` == `182.2 °C`. Battery level is a little-endian
 * uint16 percentage (0–100; only the low byte is used).
 *
 * Notifications (current temperature, battery) are enabled exclusively through
 * {@link BaseProfile.subscribe} (`startNotifications()`); this profile never
 * reads or writes a CCCD/SCCD descriptor itself — strictly W3C
 * `navigator.bluetooth` GATT.
 *
 * Sources (verified 2026-06-14):
 * - Official S&B Web Bluetooth app bundle (app.storz-bickel.com, js/main.js +
 *   crafty.js): `serviceUuidCrafty1`, `charactersiticCurrTemperatureChanged`,
 *   `characteristicWriteTemp`, `characteristicWriteBoostTemp`,
 *   `characteristicPowerChanged`.
 * - J-Cat/crafty-control craftyUuids.ts — https://github.com/J-Cat/crafty-control
 *   (ServiceUuid, TemperatureUuid 0x11, SetPointUuid 0x21, BoostUuid 0x31,
 *   BatteryUuid 0x41; verified from source).
 * - ligi/VaporizerControl CRAFTY_UUIDS.java — https://github.com/ligi/VaporizerControl
 *   (DATA_SERVICE craft(1), TEMPERATURE craft(0x11), SETPOINT craft(0x21),
 *   BOOST craft(0x31), BATTERY craft(0x41); verified from source).
 * - gsasouza/sb-crafty-watch-os — https://github.com/gsasouza/sb-crafty-watch-os
 *   (battery + current-temperature handling; verified from source).
 * - firsttris/reactive-volcano-app — https://github.com/firsttris/reactive-volcano-app
 *   (currTemperatureChanged, writeTemp, writeBoostTemp).
 * - 0022111/sbtracker — https://github.com/0022111/sbtracker
 *   (BleConstants.kt: "// Crafty/Mighty+ (older or traditional protocol)").
 *
 * @example
 * ```ts
 * import { StorzBickelProfile } from '@beacio/core/profiles/storz-bickel';
 *
 * // requestDevice({ filters: [{ namePrefix: 'S&B' }], optionalServices: [
 * //   '00000001-4c45-4b43-4942-265a524f5453',
 * // ] })
 * const vape = new StorzBickelProfile(device);
 * await vape.connect();
 *
 * await vape.setTargetTemperature(182.2);
 *
 * const off = vape.onCurrentTemperature((c) => console.log(`now ${c} °C`));
 * console.log('battery', await vape.batteryLevel(), '%');
 *
 * off();
 * vape.stop();
 * ```
 */

/** Crafty/Mighty PRIMARY DATA SERVICE (live temp, setpoint, boost, battery). HIGH confidence. */
export const STORZ_BICKEL_SERVICE = '00000001-4c45-4b43-4942-265a524f5453';

/**
 * HIGH-confidence Crafty/Mighty characteristic UUIDs surfaced by this profile.
 *
 * Only characteristics rated HIGH in the consolidated reverse-engineering data
 * (official bundle + >= 1 independent corroborator) are included. Lower-
 * confidence and diagnostic characteristics are intentionally omitted until
 * device-confirmed.
 */
export const STORZ_BICKEL_CHARACTERISTICS = {
  /** Current/live temperature. read/notify; deciCelsius LE. HIGH. */
  currentTemperature: '00000011-4c45-4b43-4942-265a524f5453',
  /** Target/setpoint temperature. read/write; deciCelsius LE (e.g. 1822 = 182.2 °C). HIGH. */
  targetTemperature: '00000021-4c45-4b43-4942-265a524f5453',
  /** Boost temperature offset. read/write; deciCelsius LE. (NOT heater on/off.) HIGH. */
  boostTemperature: '00000031-4c45-4b43-4942-265a524f5453',
  /** Battery level percent. read/notify; uint16 LE (low byte used). HIGH. */
  batteryLevel: '00000041-4c45-4b43-4942-265a524f5453',
} as const;

/**
 * Crafty/Mighty SECONDARY service (device-info: serial number, model/firmware).
 * The official bundle opens this via `getPrimaryService(serviceUuidCrafty2)`
 * (`main.js:119`, `crafty.js`). Read-only metadata — not surfaced by the
 * temperature/battery accessors. MEDIUM confidence (official bundle only).
 */
export const STORZ_BICKEL_SERVICE_2 = '00000002-4c45-4b43-4942-265a524f5453';

/**
 * Crafty/Mighty TERTIARY service (project/status registers, model, hour-meter).
 * Opened via `getPrimaryService(serviceUuidCrafty3)` (`main.js:120`, `crafty.js`).
 * MEDIUM confidence (official bundle only).
 */
export const STORZ_BICKEL_SERVICE_3 = '00000003-4c45-4b43-4942-265a524f5453';

/**
 * Read-only metadata characteristics on {@link STORZ_BICKEL_SERVICE_2}, pinned
 * with provenance (`crafty.js` `primaryServiceCraftyUuid2.getCharacteristic`).
 * Surfaced for callers that want device-info; not used by this profile's
 * temperature/battery accessors. MEDIUM confidence.
 */
export const STORZ_BICKEL_SERVICE_2_CHARACTERISTICS = {
  /** Serial number. read; UTF-8 (first 8 chars). crafty.js:224. */
  serialNumber: '00000052-4c45-4b43-4942-265a524f5453',
  /** Model identifier. read. crafty.js:261. */
  model: '00000032-4c45-4b43-4942-265a524f5453',
} as const;

/**
 * Read-only metadata characteristics on {@link STORZ_BICKEL_SERVICE_3}, pinned
 * with provenance (`crafty.js` `primaryServiceCraftyUuid3.getCharacteristic`).
 * MEDIUM confidence.
 */
export const STORZ_BICKEL_SERVICE_3_CHARACTERISTICS = {
  /** Firmware/BLE version string. read. crafty.js:323. */
  firmwareVersion: '000001c3-4c45-4b43-4942-265a524f5453',
  /** Project-status register (model/state flags). read/notify. crafty.js:338. */
  projectStatus: '00000023-4c45-4b43-4942-265a524f5453',
} as const;

/**
 * The S&B Crafty/Mighty GATT is NOT auth-gated: every documented characteristic
 * is reachable after a plain `getPrimaryService` + `getCharacteristic` with no
 * pairing/bonding or write-to-unlock handshake (confirmed across the official
 * bundle and the independent community re-implementations). This sentinel
 * records that fact for integrators / @beacio/detect rather than leaving the
 * absence of an auth gate implicit — there is no characteristic to write first.
 */
export const STORZ_BICKEL_AUTH_GATE = null;

/**
 * Crafty/Mighty (Family A) data services, in `getPrimaryService` order: the
 * primary data service ({@link STORZ_BICKEL_SERVICE}) plus the device-info and
 * project-register services. Canonical lowercase. This is the per-profile
 * `services` array read by {@link deriveOptionalServices} (and exposed as the
 * static `StorzBickelProfile.services`).
 *
 * Provenance: `captured/beautified/main.js:118-120` (serviceUuidCrafty1/2/3).
 */
export const STORZ_BICKEL_SERVICES = [
  STORZ_BICKEL_SERVICE,
  STORZ_BICKEL_SERVICE_2,
  STORZ_BICKEL_SERVICE_3,
] as const;

/**
 * Volcano HYBRID (Family B) services actually opened by the vendor bundle, in
 * `getPrimaryService` order (`volcano.js:550/554/558/562`). This family is out
 * of scope for {@link StorzBickelProfile}'s accessors but is included in the
 * connect-time `optionalServices` bundle so the picker can reach a Volcano.
 *
 * NOTE — these four UUIDs do NOT share a single base; the bundle mixes two:
 * - volcano1/volcano2 use a generic-vendor base `…-1989-0108-1234-123456789abc`
 *   (NOT an S&B base at all).
 * - volcano3/volcano4 use the *big-endian* S&B base `…-5354-4f52-5a26-4249434b454c`
 *   (ASCII `STORZ&BICKEL`), the same form used by the Veazy/Venty (QVAP) family,
 *   and the byte-reverse of Crafty's `…-4c45-4b43-4942-265a524f5453` base.
 * Each line is individually source-cited to the vendor bundle; the values are
 * pinned by the SB-SDK-02 regression below. PENDING on-device confirmation.
 *
 * `serviceUuidVolcano5` (`10130000-…`, `main.js:125`) is DELIBERATELY excluded:
 * it is declared in the bundle but never `getPrimaryService`'d.
 */
export const STORZ_BICKEL_VOLCANO_SERVICES = [
  '00000001-1989-0108-1234-123456789abc', // volcano.js:550 serviceUuidVolcano1 — generic-vendor base (1989-0108)
  '01000002-1989-0108-1234-123456789abc', // volcano.js:554 serviceUuidVolcano2 — generic-vendor base (1989-0108)
  '10100000-5354-4f52-5a26-4249434b454c', // volcano.js:558 serviceUuidVolcano3 — big-endian S&B base
  '10110000-5354-4f52-5a26-4249434b454c', // volcano.js:562 serviceUuidVolcano4 — big-endian S&B base
] as const;

/**
 * Veazy / Venty (Family C, the "QVAP" bundle) services opened by the vendor
 * bundle (`qvap.js:556/582`): the vendor data service plus SIG `generic_access`.
 * Out of scope for {@link StorzBickelProfile}'s accessors; included in the
 * connect-time `optionalServices` bundle.
 */
export const STORZ_BICKEL_VEAZY_VENTY_SERVICES = [
  '00000000-5354-4f52-5a26-4249434b454c', // qvap.js:556 serviceUuidQvap
  '00001800-0000-1000-8000-00805f9b34fb', // qvap.js:582 serviceUuidQvap1 (generic_access)
] as const;

/**
 * The three S&B device families' service arrays, keyed by family. Consumed by
 * {@link StorzBickel.allServices} to build the de-duped multi-family
 * `optionalServices` bundle for a picker that should reach ANY S&B device.
 */
export const STORZ_BICKEL_FAMILY_SERVICES = {
  crafty: STORZ_BICKEL_SERVICES,
  volcano: STORZ_BICKEL_VOLCANO_SERVICES,
  veazyVenty: STORZ_BICKEL_VEAZY_VENTY_SERVICES,
} as const;

/**
 * Decode a Storz & Bickel temperature characteristic value.
 *
 * Wire format: little-endian uint16 in tenths of a degree Celsius
 * (deciCelsius). Raw `1822` decodes to `182.2`.
 *
 * @param dv - Raw characteristic value (current, target, or boost temperature).
 * @returns Temperature in degrees Celsius.
 * @throws {BeacioError} INVALID_PARAMETER if the value is shorter than 2 bytes.
 */
export function decodeTemperatureDeciCelsius(dv: DataView): number {
  return readUint16LE(dv) / 10;
}

/**
 * Encode a degrees-Celsius temperature into the Storz & Bickel wire format:
 * little-endian uint16 deciCelsius, rounded to the nearest 0.1 °C.
 *
 * @param celsius - Temperature in degrees Celsius (e.g. `182.2`).
 * @returns A 2-byte little-endian payload (raw deciCelsius).
 */
export function encodeTemperatureDeciCelsius(celsius: number): Uint8Array<ArrayBuffer> {
  const raw = Math.round(celsius * 10);
  const buffer = new ArrayBuffer(2);
  new DataView(buffer).setUint16(0, raw, true);
  return new Uint8Array(buffer);
}

/**
 * Decode the Storz & Bickel battery-level characteristic value.
 *
 * Wire format: little-endian uint16 percentage (0–100); only the low byte is
 * populated in practice. The official bundle labels this `power`; community
 * sources label it `battery` — both are the same battery-level read path.
 *
 * @param dv - Raw battery characteristic value.
 * @returns {Percentage} Battery level as an integer percentage (0–100).
 * @throws {BeacioError} INVALID_PARAMETER if the value is shorter than 1 byte.
 */
export function decodeBatteryPercent(dv: DataView): Percentage {
  // Wire format documents a uint16 LE where ONLY the low byte carries 0..100;
  // the high byte is unused/garbage. For a little-endian uint16 the byte at
  // offset 0 IS the low byte, so readUint8(dv) returns exactly the documented
  // payload and structurally discards the high byte (strictly better than
  // `readUint16LE(dv) & 0xff`). clampPercent saturates any malformed frame into
  // 0..100 so a notification decode is total and never throws on bad data.
  return clampPercent(readUint8(dv));
}

export class StorzBickelProfile extends BaseProfile {
  /**
   * Crafty/Mighty (Family A) services this profile's device may reach after
   * connection. Read by {@link deriveOptionalServices} so a caller can pass the
   * profile class itself instead of hand-copying {@link STORZ_BICKEL_SERVICES}.
   */
  static readonly services = STORZ_BICKEL_SERVICES;

  protected readonly service = STORZ_BICKEL_SERVICE;

  /**
   * Read the current/live heater temperature (°C).
   * Characteristic `00000011-…` (read/notify), deciCelsius LE.
   */
  async currentTemperature(): Promise<number> {
    return decodeTemperatureDeciCelsius(await this.read(STORZ_BICKEL_CHARACTERISTICS.currentTemperature));
  }

  /**
   * Subscribe to live temperature updates (°C). Returns an unsubscribe
   * function. Notifications are enabled via {@link BaseProfile.subscribe}
   * only — no CCCD write.
   */
  onCurrentTemperature(callback: (celsius: number) => void): () => void {
    return this.subscribe(STORZ_BICKEL_CHARACTERISTICS.currentTemperature, (dv) => {
      callback(decodeTemperatureDeciCelsius(dv));
    });
  }

  /**
   * Observe NATIVE notification-queue overflows on the live-temperature stream.
   * Returns an unsubscribe function (also cleaned up by {@link BaseProfile.stop}).
   *
   * Under sustained high-frequency notifications Safari's bounded Swift
   * `EventQueue` evicts samples rather than dropping them silently, and the
   * polyfill surfaces each eviction as `beacio:overflow`. When this fires, the
   * temperature shown from the last notified value is potentially stale: the
   * recommended response is to issue a fresh {@link currentTemperature} read and
   * repaint the gauge from that value rather than trusting the last
   * `onCurrentTemperature` sample.
   *
   * Thin-JS: this only surfaces the existing native signal; it changes no flow
   * control. The `event` carries the eviction metadata
   * ({@link NativeOverflowEvent}: `evictedCount`, `queueCapacity`, `seq`,
   * `timestamp`).
   *
   * @example
   * ```ts
   * vape.onCurrentTemperatureStale(async () => {
   *   // notifications were evicted — resync the gauge from a fresh read
   *   updateGauge(await vape.currentTemperature());
   * });
   * ```
   */
  onCurrentTemperatureStale(callback: (event: NativeOverflowEvent) => void): () => void {
    return this.onOverflow(STORZ_BICKEL_CHARACTERISTICS.currentTemperature, callback);
  }

  /**
   * Read the target/setpoint temperature (°C).
   * Characteristic `00000021-…` (read/write), deciCelsius LE.
   */
  async targetTemperature(): Promise<number> {
    return decodeTemperatureDeciCelsius(await this.read(STORZ_BICKEL_CHARACTERISTICS.targetTemperature));
  }

  /**
   * Write the target/setpoint temperature (°C) using write-with-response.
   * Characteristic `00000021-…`, deciCelsius LE.
   *
   * @param celsius - Desired setpoint in degrees Celsius (e.g. `182.2`).
   */
  async setTargetTemperature(celsius: number): Promise<void> {
    await this.write(STORZ_BICKEL_CHARACTERISTICS.targetTemperature, encodeTemperatureDeciCelsius(celsius));
  }

  /**
   * Read the boost temperature **offset** (°C). This is added on top of the
   * setpoint while boost is engaged — it is NOT a heater on/off control.
   * Characteristic `00000031-…` (read/write), deciCelsius LE.
   */
  async boost(): Promise<number> {
    return decodeTemperatureDeciCelsius(await this.read(STORZ_BICKEL_CHARACTERISTICS.boostTemperature));
  }

  /**
   * Write the boost temperature **offset** (°C) using write-with-response.
   * Characteristic `00000031-…`, deciCelsius LE.
   *
   * @param celsius - Boost offset in degrees Celsius (e.g. `15`).
   */
  async setBoost(celsius: number): Promise<void> {
    await this.write(STORZ_BICKEL_CHARACTERISTICS.boostTemperature, encodeTemperatureDeciCelsius(celsius));
  }

  /**
   * Read the battery level (0–100 %).
   * Characteristic `00000041-…` (read/notify), uint16 LE.
   */
  async batteryLevel(): Promise<Percentage> {
    return decodeBatteryPercent(await this.read(STORZ_BICKEL_CHARACTERISTICS.batteryLevel));
  }

  /**
   * Subscribe to battery-level updates (0–100 %). Returns an unsubscribe
   * function. Notifications are enabled via {@link BaseProfile.subscribe}
   * only — no CCCD write.
   */
  onBatteryLevel(callback: (percent: Percentage) => void): () => void {
    return this.subscribe(STORZ_BICKEL_CHARACTERISTICS.batteryLevel, (dv) => {
      callback(decodeBatteryPercent(dv));
    });
  }
}

/**
 * Storz & Bickel vendor-level helpers spanning ALL device families (Crafty/
 * Mighty, Volcano HYBRID, Veazy/Venty), as distinct from the single-family
 * {@link StorzBickelProfile}.
 */
export const StorzBickel = {
  /**
   * The de-duped, canonical-lowercase union of every `getPrimaryService`-opened
   * service across all three S&B families ({@link STORZ_BICKEL_FAMILY_SERVICES}).
   * Pass this as `optionalServices` to a single `requestDevice` so the picker can
   * reach ANY Storz & Bickel device regardless of family.
   *
   * @returns De-duped canonical service UUIDs (first-seen order).
   *
   * @example
   * ```ts
   * const device = await ble.requestDevice({
   *   filters: [{ namePrefix: 'S&B' }, { namePrefix: 'STORZ' }],
   *   optionalServices: StorzBickel.allServices(),
   * });
   * ```
   */
  allServices(): string[] {
    return deriveOptionalServices(
      STORZ_BICKEL_FAMILY_SERVICES.crafty,
      STORZ_BICKEL_FAMILY_SERVICES.volcano,
      STORZ_BICKEL_FAMILY_SERVICES.veazyVenty,
    );
  },
} as const;

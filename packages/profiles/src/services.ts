import { resolveUUID } from '@beacio/core';

/**
 * A profile class that declares the GATT services it (and its device family) may
 * reach after connection, as a static `services` array. {@link deriveOptionalServices}
 * reads this so a caller can pass the profile itself instead of hand-copying its
 * service UUIDs into `optionalServices`.
 */
export interface ProfileWithServices {
  readonly services: readonly string[];
}

/**
 * A source of service UUIDs accepted by {@link deriveOptionalServices}: either a
 * profile class carrying a static `services` array, or a raw list of service
 * names / 4-8-hex / full 128-bit UUID strings.
 */
export type OptionalServicesSource = ProfileWithServices | readonly string[];

function isProfileWithServices(source: OptionalServicesSource): source is ProfileWithServices {
  return !Array.isArray(source) && Array.isArray((source as ProfileWithServices).services);
}

/**
 * Flatten one or more profiles / service-UUID arrays into a single canonical,
 * de-duped, lowercase 128-bit `string[]` suitable for `optionalServices` (or
 * {@link Beacio.registerServices}). Every entry is resolved via the core
 * {@link resolveUUID} (names like `'battery_service'`, 4/8-hex, and full UUIDs
 * are all accepted) and de-duped while preserving first-seen order.
 *
 * This retires the hand-maintained parallel `optionalServices` lists a multi-
 * device integration would otherwise keep in sync: declare the profiles (or a
 * vendor bundle such as `StorzBickel.allServices()`) once and derive the list.
 *
 * Pure and idempotent: `deriveOptionalServices(deriveOptionalServices(x))` equals
 * `deriveOptionalServices(x)`, because the output is already canonical UUIDs that
 * {@link resolveUUID} passes through unchanged.
 *
 * @param sources - Profile classes (with a static `services` array) and/or raw
 *   service-UUID arrays (names, 4/8-hex, or full 128-bit UUID strings).
 * @returns De-duped canonical lowercase 128-bit service UUIDs, first-seen order.
 * @throws {TypeError} If any value is not a resolvable UUID or known SIG name.
 *
 * @example
 * ```ts
 * import { deriveOptionalServices, NordicUARTProfile, HeartRateProfile } from '@beacio/profiles';
 *
 * const optionalServices = deriveOptionalServices(NordicUARTProfile, HeartRateProfile);
 * const device = await ble.requestDevice({ acceptAllDevices: true, optionalServices });
 * ```
 */
export function deriveOptionalServices(...sources: OptionalServicesSource[]): string[] {
  const merged = new Set<string>();
  for (const source of sources) {
    const services = isProfileWithServices(source) ? source.services : source;
    for (const service of services) {
      merged.add(resolveUUID(service));
    }
  }
  return [...merged];
}

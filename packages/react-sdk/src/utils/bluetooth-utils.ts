/**
 * Bluetooth utility functions for the React SDK
 */

import {
  resolveUUID,
  getServiceName as coreGetServiceName,
  getCharacteristicName as coreGetCharacteristicName,
  getDisplayName,
} from '@beacio/core';

/**
 * Canonicalize a UUID for name lookup by delegating to `@beacio/core`'s
 * `resolveUUID` (the single source of truth), after stripping a leading
 * `0x`/`0X` short-form prefix that core's resolver does not accept directly.
 *
 * Returns the canonical 128-bit UUID, or `undefined` if the input is not a
 * recognizable UUID / hex short form / SIG name (core throws; we swallow so
 * callers can fall back to the raw string for unknown input).
 */
function canonicalize(uuid: string): string | undefined {
  const stripped = /^0x/i.test(uuid) ? uuid.slice(2) : uuid;
  try {
    return resolveUUID(stripped);
  } catch {
    return undefined;
  }
}

/**
 * Get the human-readable name for a service UUID.
 * Accepts short-form (0X1800), hex (1800), canonical UUIDs, or SIG names.
 *
 * Delegates name resolution to `@beacio/core` (single source of
 * truth) and formats the snake_case SIG name as Title Case for display. Falls
 * back to the raw UUID for unknown services.
 */
export function getServiceDisplayName(uuid: string): string {
  const canonical = canonicalize(uuid);
  const name = canonical ? coreGetServiceName(canonical) : undefined;
  return name ? getDisplayName(name) : uuid;
}

/**
 * Get the human-readable name for a characteristic UUID.
 * Accepts short-form (0X2A37), hex (2a37), canonical UUIDs, or SIG names.
 *
 * Delegates name resolution to `@beacio/core` (single source of
 * truth) and formats the snake_case SIG name as Title Case for display. Falls
 * back to the raw UUID for unknown characteristics.
 */
export function getCharacteristicDisplayName(uuid: string): string {
  const canonical = canonicalize(uuid);
  const name = canonical ? coreGetCharacteristicName(canonical) : undefined;
  return name ? getDisplayName(name) : uuid;
}

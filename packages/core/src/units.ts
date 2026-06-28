import { BeacioError } from './errors';

declare const percentageBrand: unique symbol;

/**
 * A validated integer percentage in [0, 100].
 *
 * Nominal/branded: a raw `number` can never be passed where a percentage is
 * required — the brand is attachable only by {@link percent} (strict) or
 * {@link clampPercent} (lenient), both of which guarantee `0 <= value <= 100`
 * and that the value is an integer. Typing a decoded battery level as
 * `Percentage` makes an out-of-range value (e.g. a stray 356% from an
 * unmasked uint16) unrepresentable at the type level — not just by a runtime
 * check at the call site.
 *
 * `units.ts` is the home for unit-of-measure invariants (percentage today;
 * future Celsius/decibel brands can co-locate here), keeping them distinct
 * from write/chunk concerns in {@link ./write-chunker}.
 */
export type Percentage = number & { readonly [percentageBrand]: true };

/**
 * Strict smart-constructor for {@link Percentage}. Throws `INVALID_PARAMETER`
 * unless `n` is an integer in `0..100`. Use when the caller supplied an
 * explicit value that must be rejected (not silently corrected) if invalid.
 */
export function percent(n: number): Percentage {
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw new BeacioError('INVALID_PARAMETER', `Invalid percent: ${n}. Must be an integer in 0..100.`);
  }
  return n as Percentage;
}

/**
 * Lenient smart-constructor for {@link Percentage}. Saturates any
 * number/`NaN`/non-integer input into `0..100` (`NaN` -> `0`). Never throws.
 *
 * Takes a plain `number` (not `number | null | undefined` like
 * {@link clampChunkSize}) because its inputs are concrete decoded bytes, never
 * a nullable platform-reported limit — honoring the repo's "required fields,
 * no optional arguments" convention. `Math.trunc` (not a saturating-only
 * clamp) guards against a fractional sneaking through from any non-byte caller;
 * for an integer byte it is a no-op.
 */
export function clampPercent(n: number): Percentage {
  if (!Number.isFinite(n)) return 0 as Percentage;
  return Math.min(100, Math.max(0, Math.trunc(n))) as Percentage;
}

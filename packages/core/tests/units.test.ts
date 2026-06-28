import { describe, expect, it } from '@jest/globals';
import { percent, clampPercent } from '../src/units';
import { BeacioError } from '../src/errors';

describe('percent (strict smart-constructor)', () => {
  it('accepts in-range integer boundaries and a mid value', () => {
    expect(percent(0)).toBe(0);
    expect(percent(50)).toBe(50);
    expect(percent(100)).toBe(100);
  });

  it('throws a typed BeacioError (INVALID_PARAMETER) below 0', () => {
    let thrown: unknown;
    try {
      percent(-1);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BeacioError);
    expect((thrown as BeacioError).code).toBe('INVALID_PARAMETER');
  });

  it('throws above 100', () => {
    expect(() => percent(101)).toThrow(BeacioError);
    expect(() => percent(101)).toThrow(/0\.\.100/);
  });

  it('throws on a non-integer', () => {
    expect(() => percent(1.5)).toThrow(BeacioError);
  });

  it('throws on NaN', () => {
    expect(() => percent(Number.NaN)).toThrow(BeacioError);
  });
});

describe('clampPercent (lenient smart-constructor)', () => {
  it('passes an in-range value through unchanged', () => {
    expect(clampPercent(50)).toBe(50);
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(100)).toBe(100);
  });

  it('saturates a negative value to 0', () => {
    expect(clampPercent(-5)).toBe(0);
  });

  it('saturates a value above 100 down to 100', () => {
    expect(clampPercent(150)).toBe(100);
  });

  it('maps NaN to 0', () => {
    expect(clampPercent(Number.NaN)).toBe(0);
  });

  it('maps non-finite inputs to 0', () => {
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampPercent(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('truncates a fractional input toward zero before clamping', () => {
    expect(clampPercent(50.9)).toBe(50);
  });

  it('never throws', () => {
    expect(() => clampPercent(-1)).not.toThrow();
    expect(() => clampPercent(99999)).not.toThrow();
    expect(() => clampPercent(Number.NaN)).not.toThrow();
  });
});

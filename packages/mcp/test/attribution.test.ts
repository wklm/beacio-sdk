import { describe, expect, it } from 'vitest';
import { ATTRIBUTION_REGEX, generateAttributionToken } from '../src/attribution.js';
import { ATTRIBUTION_TOKEN_REGEX } from '../../../cloudflare/shared/attribution.ts';
// PR-REVIEW.md §3 M3: import the REAL deployed Worker validator instead of a
// hardcoded local copy. The previous `const WORKER_REGEX = /^beacio_.../` was a
// false green — it was the author's *assumption* of what the Worker validates,
// not the Worker's actual regex (which used to be `webble_`-only and dropped
// every `beacio_` token). Asserting against the genuine shared validator means
// any future producer/validator drift fails this test instead of silently
// losing 100% of MCP attribution in production.
const WORKER_REGEX = ATTRIBUTION_TOKEN_REGEX;

describe('generateAttributionToken', () => {
  it('matches the MCP regex and the Worker regex', () => {
    const token = generateAttributionToken({
      now: new Date(Date.UTC(2026, 3, 1)),
      random: () => 0.5,
    });
    expect(token).toMatch(ATTRIBUTION_REGEX);
    expect(token).toMatch(WORKER_REGEX);
    expect(token.length).toBeLessThanOrEqual(80);
  });

  it('encodes UTC year-month with zero-padding', () => {
    const token = generateAttributionToken({
      now: new Date(Date.UTC(2026, 0, 15)), // January 2026 → 202601
      random: () => 0,
    });
    expect(token.startsWith('beacio_202601_mcp_')).toBe(true);
  });

  it('rejects out-of-range suffix length', () => {
    expect(() => generateAttributionToken({ suffixLength: 7 })).toThrow(RangeError);
    expect(() => generateAttributionToken({ suffixLength: 17 })).toThrow(RangeError);
  });

  it('emits a custom channel (hn) within both the MCP and Worker regexes', () => {
    const token = generateAttributionToken({
      channel: 'hn',
      now: new Date(Date.UTC(2026, 3, 1)),
      random: () => 0.5,
    });
    expect(token.startsWith('beacio_202604_hn_')).toBe(true);
    expect(token).toMatch(ATTRIBUTION_REGEX);
    expect(token).toMatch(WORKER_REGEX);
  });

  it('defaults to the mcp channel when none is given', () => {
    const token = generateAttributionToken({ now: new Date(Date.UTC(2026, 3, 1)), random: () => 0 });
    expect(token.startsWith('beacio_202604_mcp_')).toBe(true);
  });

  it('rejects an unknown channel', () => {
    // @ts-expect-error — deliberately invalid channel
    expect(() => generateAttributionToken({ channel: 'twitter' })).toThrow();
  });
});

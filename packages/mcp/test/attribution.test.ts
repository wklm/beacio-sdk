import { describe, expect, it } from 'vitest';
import { ATTRIBUTION_REGEX, generateAttributionToken } from '../src/attribution.js';

// The SAME regex the Wave I.2 beacon Worker uses when accepting attribution. If this
// assertion ever starts failing, the beacon Worker will reject every MCP-minted token.
const WORKER_REGEX = /^webble_\d{6}_(mcp|cdn|direct|github|npm|hn)_[a-z0-9]{1,40}$/;

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
    expect(token.startsWith('webble_202601_mcp_')).toBe(true);
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
    expect(token.startsWith('webble_202604_hn_')).toBe(true);
    expect(token).toMatch(ATTRIBUTION_REGEX);
    expect(token).toMatch(WORKER_REGEX);
  });

  it('defaults to the mcp channel when none is given', () => {
    const token = generateAttributionToken({ now: new Date(Date.UTC(2026, 3, 1)), random: () => 0 });
    expect(token.startsWith('webble_202604_mcp_')).toBe(true);
  });

  it('rejects an unknown channel', () => {
    // @ts-expect-error — deliberately invalid channel
    expect(() => generateAttributionToken({ channel: 'twitter' })).toThrow();
  });
});

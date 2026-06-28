/**
 * Attribution token — SHARED CONTRACT with the beacon + stats Workers.
 *
 * Worker regex: /^beacio_\d{6}_(mcp|cdn|direct|github|npm|hn)_[a-z0-9]{1,40}$/
 * MCP defaults to the `mcp` channel; pass `channel` to attribute another acquisition
 * surface — e.g. `hn` (Show HN / forum outreach) or `direct` (website/SEO funnel).
 * Example: beacio_202604_hn_3p9xq2k8m4r
 *
 * Format: `beacio_YYYYMM_<channel>_<random>`
 *   - YYYYMM: current UTC year-month, zero-padded.
 *   - <channel>: one of CHANNELS.
 *   - <random>: 8–16 chars from [a-z0-9]. Total length ≤ 80.
 */
export const CHANNELS = ['mcp', 'cdn', 'direct', 'github', 'npm', 'hn'] as const;
export type Channel = (typeof CHANNELS)[number];

export const ATTRIBUTION_REGEX = /^beacio_\d{6}_(mcp|cdn|direct|github|npm|hn)_[a-z0-9]{8,16}$/;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomSuffix(length: number, rand: () => number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return out;
}

export interface TokenOptions {
  /** UTC date source — defaults to `new Date()`. Injected for deterministic tests. */
  now?: Date;
  /** PRNG in [0, 1) — defaults to Math.random. Injected for deterministic tests. */
  random?: () => number;
  /** Random-suffix length (8–16 inclusive). Defaults to 11. */
  suffixLength?: number;
  /** Acquisition channel. Defaults to `mcp`. Must be one of CHANNELS. */
  channel?: Channel;
}

export function generateAttributionToken(opts: TokenOptions = {}): string {
  const now = opts.now ?? new Date();
  const rand = opts.random ?? Math.random;
  const suffixLength = opts.suffixLength ?? 11;
  const channel = opts.channel ?? 'mcp';
  if (suffixLength < 8 || suffixLength > 16) {
    throw new RangeError(`suffixLength must be 8..16 (got ${suffixLength})`);
  }
  if (!CHANNELS.includes(channel)) {
    throw new RangeError(`channel must be one of ${CHANNELS.join(', ')} (got ${String(channel)})`);
  }
  const yyyy = now.getUTCFullYear().toString().padStart(4, '0');
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const token = `beacio_${yyyy}${mm}_${channel}_${randomSuffix(suffixLength, rand)}`;
  // Defensive: max total length 80 chars — `beacio_` (7) + 6 + `_<channel>_` (≤8) + 16 = ~37, well under.
  if (token.length > 80) {
    throw new Error(`attribution token exceeds 80 chars: ${token}`);
  }
  return token;
}

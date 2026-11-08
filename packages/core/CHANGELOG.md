# Changelog

All notable changes to `@beacio/core` will be documented in this file.

## 2.1.0 — 2026-08-25

- Version aligned with App Store / Safari extension **2.1.0**. Every published `@beacio/*` package now moves in **lockstep** with the app release; the previous "packages version independently" policy is retired.
- The jump **1.2.0 → 2.1.0 skips 2.0.0 deliberately**: `@beacio/mcp` was already published at 2.0.0, so the shared lockstep version had to clear it. There is no `@beacio/core@2.0.0` and there never will be.
- No breaking API change relative to 1.2.0 — the major bump is the lockstep alignment, not a source change. Fielded `@beacio/core@1.x` CDN pins remain supported via the extension skew cell (U-SKEW-01).
- CDN / install pins move to `@beacio/core@2.1.0` (see `onboarding-manifest.json`).

## 1.2.0 — 2026-07-27

- Version aligned with App Store / Safari extension **1.2.0**.
- Stability freeze surfaces (internal slots, error matrix, batch GATT wire protocol).
- CDN / install pins move to `@beacio/core@1.2.0` (see `onboarding-manifest.json`). Fielded `@beacio/core@1.0.0` CDN pins remain supported via the extension skew cell (U-SKEW-01).

## 1.0.0 — 2026-06-21

- First externally-consumed stable release. The
  "breaking changes are free" zero-consumers assumption is **retired** for the consumed
  `navigator.bluetooth` polyfill behaviour and `optionalServices` surfaces: from 1.0.0 these
  follow semver — additive-only across minor/patch, with a behavioural breaking change only in a
  major release. Consumers pin the exact
  immutable `@beacio/core@1.2.0/dist/auto.mjs` rather than a floating tag.

## 2.0.0-beta.2 — 2026-06-03

- Pre-release docs and packaging polish for the `2.0.0-beta` line.
- Documented the `import '@beacio/core/auto'` setup path in the README so installation guidance does not depend on a noisy `postinstall` message.
- Added dedicated power-management guidance covering user-gesture requirements, notification async iterator usage, queue sizing, and conservative cleanup patterns for Safari iOS BLE sessions.
- Prepared lightweight CI bundle-size tracking to watch for accidental package growth without changing runtime behavior.

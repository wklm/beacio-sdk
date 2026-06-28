# Changelog

All notable changes to `@beacio/core` will be documented in this file.

## 1.0.0 — 2026-06-21

- First externally-consumed stable release (Storz & Bickel is the first real consumer). The
  "breaking changes are free" zero-consumers assumption is **retired** for the consumed
  `navigator.bluetooth` polyfill behaviour and `optionalServices` surfaces: from 1.0.0 these
  follow semver — additive-only across minor/patch, with a behavioural breaking change only in a
  major release. See the backward-compatibility + pinned-version contract in
  [`outreach/storz-bickel/07-support-scope.md`](../../outreach/storz-bickel/07-support-scope.md)
  (§7), which also defines the pre-publish change-notification path. Consumers pin the exact
  immutable `@beacio/core@1.0.0/dist/auto.mjs` rather than a floating tag.

## 2.0.0-beta.2 — 2026-06-03

- Pre-release docs and packaging polish for the `2.0.0-beta` line.
- Documented the `import '@beacio/core/auto'` setup path in the README so installation guidance does not depend on a noisy `postinstall` message.
- Added dedicated power-management guidance covering user-gesture requirements, notification async iterator usage, queue sizing, and conservative cleanup patterns for Safari iOS BLE sessions.
- Prepared lightweight CI bundle-size tracking to watch for accidental package growth without changing runtime behavior.

import { defineConfig } from 'tsup';
import path from 'node:path';

// SB-SDK-02 (Part A): the consolidated CLASSIC auto-installing browser bundle.
//
// Unlike tsup.browser.config.ts (browser.global.js — a non-auto LIBRARY global
// `BeacioCore` that surfaces the SDK classes but neither installs the polyfill
// nor surfaces detect/banner), this entry is the drop-in for a vanilla
// script-tag site: it runs the polyfill on load AND attaches
// window.beacioDetect.{showInstallBanner,initBeacio,…} AND auto-shows the banner
// on DOMContentLoaded.
//
// `@beacio/detect` is BUNDLED IN (noExternal) so the output is a single
// self-contained file servable as a classic <script src=...> with no bare
// specifiers left to resolve. This is safe ONLY because SB-SDK-02 Part B removed
// detect's STATIC `@beacio/core` imports — detect now reaches core solely via a
// lazy `await import('@beacio/core')`, so bundling no longer trips the
// detect↔core cycle the main tsup.config.ts guards against. The lazy
// `import('@beacio/core')` inside the bundled detect is aliased to a MINIMAL
// internal core entry (src/_auto-core.ts) so it resolves into THIS bundle
// instead of emitting an unresolvable bare module specifier into a classic
// script — see the alias note below for why it is the minimal entry, not the
// full barrel.
export default defineConfig({
  entry: { 'browser-auto': 'src/browser-auto.ts' },
  format: ['iife'],
  globalName: 'beacioDetect',
  outExtension: () => ({ js: '.global.js' }),
  clean: false,
  minify: true,
  sourcemap: true,
  treeshake: true,
  dts: false,
  splitting: false,
  noExternal: ['@beacio/detect'],
  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      // Resolve the bundled detect's lazy `import('@beacio/core')` to a MINIMAL
      // internal core entry (NOT the full src/index.ts barrel), folding only the
      // surface this classic auto path actually touches into the self-contained
      // IIFE. detect's lazy core import is used solely for detectPlatform()
      // (getExtensionInstallState fast-path) plus a few fully-erased type pins;
      // pointing it at the whole barrel used to drag the entire unused BLE
      // wrapper machinery (device / notification-manager / beacio / write-chunker
      // / dataview-helpers / errors) into a vanilla <script> drop-in that never
      // instantiates a Beacio wrapper. _auto-core.ts exposes exactly that
      // surface, dropping ~9 KiB gzip of dead code while preserving every feature
      // for real `@beacio/core` consumers (the published barrel is unchanged).
      '@beacio/core': path.resolve(__dirname, 'src/_auto-core.ts'),
    };
  },
});

import { defineConfig } from 'tsup';

// SB-SDK-02 (Part A): the consolidated CLASSIC auto-installing browser bundle.
//
// Unlike tsup.browser.config.ts (browser.global.js — a non-auto LIBRARY global
// `BeacioCore` that surfaces the SDK classes but neither installs the polyfill
// nor surfaces detect/banner), this entry is the drop-in for a vanilla
// script-tag site: it runs the polyfill on load AND attaches
// window.beacioDetect.{showInstallBanner,initBeacio,…} AND auto-shows the banner
// on DOMContentLoaded.
//
// The detect surface (install banner / initBeacio / presentError) now lives
// INSIDE @beacio/core (src/detect/), so browser-auto.ts imports it with a plain
// intra-package `./detect` specifier and it bundles straight into this single
// self-contained IIFE — no bare module specifiers left to resolve, so no
// external/noExternal juggling and no `@beacio/core` self-alias. The detect
// modules reach only core's minimal platform/events/urls modules (never the full
// BLE wrapper graph), so the classic drop-in stays lean without the former
// `_auto-core.ts` alias trick (deleted in B10-d).
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
});

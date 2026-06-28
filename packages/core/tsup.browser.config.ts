import { defineConfig } from 'tsup';

export default defineConfig({
  // AIDEV-NOTE: The browser-global bundle is separate from ./global because
  // that subpath is reserved for Navigator type augmentation imports.
  entry: { browser: 'src/index.ts' },
  format: ['iife'],
  globalName: 'BeacioCore',
  clean: false,
  minify: true,
  sourcemap: true,
  treeshake: true,
  dts: false,
  splitting: false,
});

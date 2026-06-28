import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'heart-rate': 'src/heart-rate.ts',
    battery: 'src/battery.ts',
    'device-info': 'src/device-info.ts',
    'nordic-uart': 'src/nordic-uart.ts',
    'serial-ffe0': 'src/serial-ffe0.ts',
    'storz-bickel': 'src/storz-bickel.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  external: ['@beacio/core'],
});

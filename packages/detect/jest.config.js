/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  // Resolve @beacio/core to its SOURCE (not the pre-built, possibly-stale dist)
  // so detect's tests see the live shared constants (BEACIO_EVENTS, SETUP_URL).
  // Mirrors packages/react-sdk/jest.config.js.
  moduleNameMapper: {
    '^@beacio/core$': '<rootDir>/../core/src/index.ts',
  },
  transform: {
    // Pulling @beacio/core SOURCE into the compile drags in core modules that
    // rely on @types/web-bluetooth's global interfaces (BluetoothLEScan,
    // BluetoothDevice, …). detect's build tsconfig leaves `types` unset, so
    // declare the ambient type packages ts-jest needs for the test compile
    // here (mirrors react-sdk's tsconfig.test `types`).
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: { types: ['web-bluetooth', 'node', 'jest'] } },
    ],
  },
};

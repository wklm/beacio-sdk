/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  // AIDEV-NOTE: Keep workspace source resolution test-only so package typecheck
  // still reflects published package boundaries instead of local monorepo wiring.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  moduleNameMapper: {
    '^@ios-web-bluetooth/core$': '<rootDir>/../core/src/index.ts',
  },
};

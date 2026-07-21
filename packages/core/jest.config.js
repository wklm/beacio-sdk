/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  transform: {
    // Tests get their own tsconfig: same strictness as src, plus @types/node
    // (require/__dirname/process) and @types/jest globals — src ships to the
    // browser and must keep its node-free types list.
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tests/tsconfig.json' }],
  },
};

// AIDEV-NOTE: jsdom test env may lack TextEncoder/TextDecoder (used by the
// readUtf8 DataView helper). Polyfill from Node's util before any test runs.
//
// Unlike the profiles package, @beacio/core's tsconfig does NOT pull in
// '@types/node', so a bare `import { TextEncoder } from 'util'` fails ts-jest
// type-checking (TS2591). ts-jest emits CommonJS, so we reach Node's util via a
// locally-declared `require` instead — no '@types/node' dependency, no tsconfig
// change. Cast through `unknown`: Node's util types and the DOM lib types differ
// structurally (ArrayBuffer vs SharedArrayBuffer generics).
declare const require: (id: string) => { TextEncoder: unknown; TextDecoder: unknown };

const nodeUtil = require('util');

const globalRef = globalThis as unknown as {
  TextEncoder?: unknown;
  TextDecoder?: unknown;
};

globalRef.TextEncoder ??= nodeUtil.TextEncoder;
globalRef.TextDecoder ??= nodeUtil.TextDecoder;

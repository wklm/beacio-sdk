// AIDEV-NOTE: jsdom test env may lack TextEncoder/TextDecoder (used by the
// readUtf8 DataView helper). Polyfill from Node's util before any test runs.
// Node types come from tests/tsconfig.json (ts-jest), so a plain import works.
// Cast the global through `unknown`: Node's util types and the DOM lib types
// differ structurally (ArrayBuffer vs SharedArrayBuffer generics).
import { TextDecoder, TextEncoder } from 'util';

const globalRef = globalThis as unknown as {
  TextEncoder?: unknown;
  TextDecoder?: unknown;
};

globalRef.TextEncoder ??= TextEncoder;
globalRef.TextDecoder ??= TextDecoder;

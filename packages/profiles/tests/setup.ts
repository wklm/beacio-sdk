// AIDEV-NOTE: jsdom test env may lack TextEncoder/TextDecoder (used by the
// device-info string parsers). Polyfill from Node's util before any test runs.
// Cast through `any`: Node's util types and the DOM lib types for these
// classes differ structurally (ArrayBuffer vs SharedArrayBuffer generics),
// so a direct assignment trips TS2322 despite being runtime-compatible.
import { TextEncoder, TextDecoder } from 'util';

const globalRef = globalThis as unknown as {
  TextEncoder?: unknown;
  TextDecoder?: unknown;
};

globalRef.TextEncoder ??= TextEncoder;
globalRef.TextDecoder ??= TextDecoder;

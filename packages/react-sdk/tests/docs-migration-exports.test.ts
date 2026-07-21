import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import * as ts from 'typescript';
import * as ReactSdk from '../src/index';

// AIDEV-NOTE: Regression guard (SB-SDK-24, retargeted by T1-F1) for the
// docs-drift bug where the react-sdk docs documented a phantom `beacio.*`
// namespace object (`import { beacio } from '@beacio/react'`,
// `beacio.useBluetooth()`, `<beacio.Provider>`) that the mechanical
// WebBLE->beacio rebrand carried over. `@beacio/react` (src/index.ts) exports
// ONLY named symbols (BeacioProvider, useBluetooth, ...). The standalone
// docs/MIGRATION.md + docs/API.md + PUBLISHING.md were folded into README.md
// (T1-F1, 2026-07-02 — see git history), so this guard now targets README.md:
// it asserts the shipped doc stays aligned with the actual export surface so
// the namespace (or any other example drift) cannot silently return.

const DOC_PATH = join(__dirname, '..', 'README.md');
const DOC = readFileSync(DOC_PATH, 'utf8');

// All fenced code blocks (any language). Prose legitimately contains
// `beacio.com` links, so the namespace-deref check is scoped to code.
function codeBlocks(doc: string): string[] {
  return [...doc.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
}
const CODE = codeBlocks(DOC).join('\n');

// The real public export surface of @beacio/react.
const EXPORTED_NAMES = new Set(Object.keys(ReactSdk));

// Named specifiers pulled from each `import { ... } from '@beacio/react'`
// block in the doc. Type-only re-exports (BluetoothDevice, BeacioDevice, etc.)
// are not runtime keys on the module object, so the allow-list below covers
// the type names the examples legitimately reference.
const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"]@beacio\/react['"]/g;
const TYPE_ONLY_ALLOW = new Set([
  // core type re-exports surfaced via `export type { ... } from '@beacio/core'`
  'BeacioDevice',
  'BeacioError',
  'BeacioConfig',
  'RequestDeviceOptions',
  // local type exports surfaced via `export type { ... } from './types'`
  'ConnectionState',
  'UseDeviceReturn',
]);

function documentedReactImports(): string[] {
  const names = new Set<string>();
  for (const m of DOC.matchAll(IMPORT_RE)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (name) names.add(name);
    }
  }
  return [...names];
}

describe('README.md aligns with the @beacio/react export surface (SB-SDK-24)', () => {
  it('sanity: the real export surface has the named React API symbols (no `beacio` aggregate)', () => {
    expect(EXPORTED_NAMES.has('BeacioProvider')).toBe(true);
    expect(EXPORTED_NAMES.has('useBluetooth')).toBe(true);
    // The phantom namespace object must NOT be a real export.
    expect(EXPORTED_NAMES.has('beacio')).toBe(false);
  });

  it('code blocks do not dereference a non-existent `beacio.*` namespace object', () => {
    const hits = CODE.match(/\bbeacio\.[A-Za-z]/g) ?? [];
    expect(hits).toEqual([]);
  });

  it('does not import a `beacio` aggregate from @beacio/react', () => {
    expect(DOC).not.toMatch(/import\s*\{\s*beacio\s*\}\s*from\s*['"]@beacio\/react['"]/);
  });

  it('does not mock a phantom `beacio` key in jest.mock("@beacio/react", ...)', () => {
    const mockFactory = DOC.match(/jest\.mock\(\s*['"]@beacio\/react['"][\s\S]*?\n\}\)\);/);
    if (mockFactory) {
      expect(mockFactory[0]).not.toMatch(/\bbeacio\s*:/);
    }
  });

  it('every symbol imported from @beacio/react in the doc is a real named export', () => {
    const documented = documentedReactImports();
    expect(documented.length).toBeGreaterThan(0);
    const unknown = documented.filter(
      (name) => !EXPORTED_NAMES.has(name) && !TYPE_ONLY_ALLOW.has(name),
    );
    expect(unknown).toEqual([]);
  });
});

// AIDEV-NOTE: SB-SDK-24 acceptance criterion 1 — "Every example code block
// compiles against the actual @beacio/react export surface." The import-level
// guard above is necessary but not sufficient: the mechanical WebBLE->beacio
// rebrand also left example BODIES calling hooks with the OLD shape
// (`useScan({...})`, `useCharacteristic('uuid').readValue/writeValue/isWriting`,
// `useNotifications('uuid').startNotifications`, `useDevice(deviceId: string)`)
// that never matched the real hook signatures/return types. This guard pulls
// every `const { ... } = useHook(args)` site out of the README and TYPE-CHECKS
// it against the real hooks via the TypeScript compiler API, so the
// return-member names and call arity are validated against the live types (not
// a hardcoded list) and the drift cannot silently return.

const REACT_INDEX = join(__dirname, '..', 'src', 'index.ts');
const PKG_DIR = dirname(join(__dirname, '..', 'src')); // packages/react-sdk

// Pull each fenced ```tsx block. Vanilla examples are ```javascript and are
// intentionally excluded.
function tsxBlocks(doc: string): string[] {
  return [...doc.matchAll(/```tsx\n([\s\S]*?)```/g)].map((m) => m[1]);
}

// Each `const { a, b } = useHook(args);` destructure site in a tsx block.
const DESTRUCTURE_RE =
  /const\s*\{([^}]*)\}\s*=\s*(use[A-Z]\w*)\s*\(([\s\S]*?)\)\s*;/g;

interface HookSite {
  hook: string;
  members: string[];
  args: string;
}

function hookSites(doc: string): HookSite[] {
  const sites: HookSite[] = [];
  for (const rawBlock of tsxBlocks(doc)) {
    // README examples annotate destructured members with `// ...` line
    // comments; strip them so the destructure/args parse cleanly.
    const block = rawBlock.replace(/\/\/[^\n]*/g, '');
    for (const m of block.matchAll(DESTRUCTURE_RE)) {
      const members = m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      sites.push({ hook: m[2], members, args: m[3].trim() });
    }
  }
  return sites;
}

// Build a single self-contained tsx probe for one destructure site. Free
// identifiers referenced in the call args (deviceId, options, ...) are declared
// as `any` so the ONLY diagnostics that can surface are genuine mismatches
// against the real @beacio/react surface: an unknown return member
// ("Property 'x' does not exist on type 'UseXReturn'") or a bad call arity
// ("Expected N arguments, but got M").
function probeFor(site: HookSite, idx: number): { name: string; text: string } {
  const ID_RE = /[A-Za-z_$][\w$]*/g;
  const known = new Set([
    site.hook,
    'true',
    'false',
    'null',
    'undefined',
    'filters',
    'optionalServices',
    'services',
    'namePrefix',
    'keepRepeatedDevices',
    'duration',
    'acceptAllDevices',
    'autoReconnect',
  ]);
  const free = new Set<string>();
  for (const m of site.args.matchAll(ID_RE)) {
    const name = m[0];
    // skip object-literal keys (followed by ':') — they are not value refs
    if (!known.has(name)) free.add(name);
  }
  const decls = [...free].map((n) => `declare const ${n}: any;`).join('\n');
  const text = `import { ${site.hook} } from '@beacio/react';
${decls}
export function Probe${idx}() {
  const { ${site.members.join(', ')} } = ${site.hook}(${site.args});
  return { ${site.members.join(', ')} };
}
`;
  return { name: join(PKG_DIR, `__sb24_probe_${idx}.tsx`), text };
}

function compileProbes(probes: { name: string; text: string }[]): ts.Diagnostic[] {
  const probeMap = new Map(probes.map((p) => [p.name, p.text]));
  const options: ts.CompilerOptions = {
    jsx: ts.JsxEmit.React,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2020,
    lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'],
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    // Doc snippets legitimately destructure members they then ignore.
    noUnusedLocals: false,
    noUnusedParameters: false,
    esModuleInterop: true,
    types: ['web-bluetooth', 'react', 'node'],
    baseUrl: PKG_DIR,
    paths: {
      '@beacio/react': [REACT_INDEX],
      '@beacio/core': [join(PKG_DIR, '..', 'core', 'src', 'index.ts')],
    },
    typeRoots: [
      join(PKG_DIR, 'node_modules', '@types'),
      join(PKG_DIR, '..', '..', 'node_modules', '@types'),
    ],
  };
  const host = ts.createCompilerHost(options);
  const origGet = host.getSourceFile.bind(host);
  host.getSourceFile = (fn, lang, onErr, shouldCreate) => {
    const virtual = probeMap.get(fn);
    if (virtual !== undefined) {
      return ts.createSourceFile(fn, virtual, lang, true, ts.ScriptKind.TSX);
    }
    return origGet(fn, lang, onErr, shouldCreate);
  };
  const origExists = host.fileExists.bind(host);
  host.fileExists = (fn) => (probeMap.has(fn) ? true : origExists(fn));
  const origRead = host.readFile.bind(host);
  host.readFile = (fn) => (probeMap.has(fn) ? probeMap.get(fn)! : origRead(fn));

  const program = ts.createProgram([...probeMap.keys()], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file != null && probeMap.has(d.file.fileName));
}

describe('README.md examples compile against the real hooks (SB-SDK-24)', () => {
  const sites = hookSites(DOC);

  it('sanity: the doc contains @beacio/react hook destructure sites to check', () => {
    expect(sites.length).toBeGreaterThan(0);
  });

  it('every hook destructure site type-checks against the live @beacio/react types', () => {
    const probes = sites.map((s, i) => probeFor(s, i));
    const diags = compileProbes(probes);
    const messages = diags.map((d) => {
      const where =
        d.file != null && d.start != null
          ? d.file.fileName.replace(/^.*\//, '') +
            ':' +
            (d.file.getLineAndCharacterOfPosition(d.start).line + 1)
          : '?';
      return `${where} — ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
    });
    expect(messages).toEqual([]);
  });
});

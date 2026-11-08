import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// Originally RED: the brownfield MCP action does not exist yet. This import is
// the failing seam — `packages/mcp/src/tools/patch-existing-app.ts` and its
// `runPatchExistingApp` export must be created. Until then the suite fails to
// resolve the module, which is the intended RED signal for AC#1/#4/#6.
import {
  runPatchExistingApp,
  patchExistingAppTool,
  THIRD_PARTY_BROWSER_REPLACEMENT,
  type PatchExistingAppOutput,
} from '../src/tools/patch-existing-app.js';
import { ALL_TOOLS } from '../src/tool-registry.js';
import { CONNECT_GATE_ALERT, UNPATCHED_HTML, UNPATCHED_JS, writeUnpatchedApp } from './fixtures/brownfield-app.js';

const PACKAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANONICAL_SKILL = join(PACKAGES_DIR, 'skill', 'SKILL.md');

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

/** The canonical classic bootstrap snippet from the published skill — the ONE the AC#6 "no fourth variant" rule pins. */
function canonicalBootstrapUrl(): string {
  const text = read(CANONICAL_SKILL);
  const m = text.match(/https:\/\/cdn\.beacio\.com\/@beacio\/core@[0-9.]+\/dist\/browser-auto\.global\.js/);
  if (!m) throw new Error('canonical browser-auto.global.js snippet not found in SKILL.md');
  return m[0];
}

/** Run the action against the synthetic UNPATCHED brownfield app. */
function patchUnpatched(): PatchExistingAppOutput {
  return runPatchExistingApp({
    entry_html: UNPATCHED_HTML,
    entry_js: UNPATCHED_JS,
    html_path: 'index.html',
    js_path: 'js/main.js',
  });
}

describe('beacio_patch_existing_app — brownfield FileEdits (AC#1)', () => {
  it('is registered in ALL_TOOLS as a consumer tool', () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(names).toContain('beacio_patch_existing_app');
  });

  it('exposes the tool definition with the canonical name', () => {
    expect(patchExistingAppTool.name).toBe('beacio_patch_existing_app');
  });

  it('emits a bootstrap edit positioned in <head> BEFORE the first navigator.bluetooth read', () => {
    const out = patchUnpatched();
    const bootstrap = out.files_to_edit.find(
      (e) => e.path === 'index.html' && /beacio/i.test(e.insert) && /script/i.test(e.insert),
    );
    expect(bootstrap, 'a bootstrap edit for index.html').toBeTruthy();
    // For a static HTML app the bootstrap must land in <head> (parse-time safe),
    // NOT body-end — the app reads navigator.bluetooth synchronously in
    // js/main.js, so a deferred/body-end insert would lose the gate race.
    expect(bootstrap!.position).toBe('head');
  });

  it('reuses the canonical browser-auto.global.js bootstrap (no fourth variant) (AC#6)', () => {
    const out = patchUnpatched();
    const joined = out.files_to_edit.map((e) => e.insert).join('\n');
    // The emitted bootstrap must reference the SAME canonical classic artifact the
    // quickstart documents — a self-hosted vendored copy of it is acceptable, but
    // its provenance string must be the canonical one, never a new literal.
    expect(joined).toMatch(/browser-auto\.global\.js/);
    expect(out.canonical_bootstrap_url).toBe(canonicalBootstrapUrl());
  });

  it('adds optionalServices into the iOS requestDevice() branch (AC#1b)', () => {
    const out = patchUnpatched();
    const jsEdit = out.files_to_edit.find((e) => e.path === 'js/main.js');
    expect(jsEdit, 'an edit for js/main.js').toBeTruthy();
    // The unpatched iOS branch is `if (isIOS()) { options.filters = filters;
    // options.acceptAllDevices = false; }` with NO optionalServices. The edit must
    // introduce optionalServices onto that iOS branch.
    expect(jsEdit!.insert).toMatch(/optionalServices/);
  });

  it("swaps the active-path 'Bluefy / Web BLE browser' message for a beacio install/enable affordance (AC#1c)", () => {
    const out = patchUnpatched();
    const jsEdit = out.files_to_edit.find((e) => e.path === 'js/main.js');
    expect(jsEdit, 'an edit for js/main.js').toBeTruthy();
    // After applying the edit there must be NO active-path third-party-browser
    // alert, and the replacement must route to beacio onboarding.
    expect(jsEdit!.insert).not.toMatch(/alert\([^)]*Bluefy/);
    expect(jsEdit!.insert).toMatch(/beacio/i);
  });
});

describe('beacio_patch_existing_app — round-trip on a synthetic app (AC#4)', () => {
  it('applies the emitted edits (bootstrap before main.js + iOS optionalServices) on a tmp app', () => {
    const out = patchUnpatched();

    // Write the unpatched app into os.tmpdir(), apply the emitted edits, and assert
    // the load order + iOS optionalServices of the result.
    const work = writeUnpatchedApp('brownfield-');
    try {
      // Apply every emitted edit to the app.
      applyEdits(work, out);

      const patchedHtml = read(join(work, 'index.html'));
      const bootstrapIdx = patchedHtml.search(/beacio[\s\S]*?<script/i);
      const mainIdx = patchedHtml.indexOf('js/main.js');
      expect(bootstrapIdx).toBeGreaterThanOrEqual(0);
      expect(mainIdx).toBeGreaterThanOrEqual(0);
      // The crux of AC#4: bootstrap loads BEFORE main.js.
      expect(bootstrapIdx).toBeLessThan(mainIdx);

      const patchedJs = read(join(work, 'js', 'main.js'));
      // iOS branch now carries optionalServices (the headline edit).
      expect(patchedJs).toMatch(/isIOS\(\)[\s\S]{0,400}optionalServices/);
      // No active-path third-party-browser alert survives.
      expect(patchedJs).not.toMatch(/alert\([^)]*Bluefy/);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

describe('beacio_patch_existing_app — generic iOS branch and connect-gate swap', () => {
  const HTML = '<!DOCTYPE html>\n<html>\n<head><title>app</title></head>\n<body><script src="js/main.js"></script></body>\n</html>\n';
  const patch = (js: string) =>
    runPatchExistingApp({ entry_html: HTML, entry_js: js, html_path: 'index.html', js_path: 'js/main.js' });

  it('adds optionalServices to an `if (isIOS()) { options.filters = … }` branch', () => {
    const branch = 'if (isIOS()) { options.filters = filters; options.acceptAllDevices = false; }';
    const out = patch(`function isIOS(){return /iPhone/.test(navigator.userAgent);}\nvar options = {};\n${branch}\n`);
    const edit = out.files_to_edit.find((e) => e.op === 'replace' && e.find === branch);
    expect(edit).toBeDefined();
    expect(edit!.insert.startsWith('if (isIOS()) { options.filters = filters;')).toBe(true);
    expect(edit!.insert).toMatch(/options\.optionalServices=\(options\.optionalServices\|\|\[\]\)\.concat\(/);
    expect(edit!.insert.endsWith('}')).toBe(true);
  });

  it('swaps only the alert and keeps a guard in front of it', () => {
    const alertCall = CONNECT_GATE_ALERT;
    const out = patch(`if (bluetoothUnavailable()) ${alertCall}\n`);
    const edit = out.files_to_edit.find((e) => e.op === 'replace' && e.insert === THIRD_PARTY_BROWSER_REPLACEMENT);
    expect(edit).toBeDefined();
    expect(edit!.find).toBe(alertCall);
  });

  it.each([
    'if (!isIOS())',
    'if (!(isIOS()))',
    'if (!/iPhone|iPad/.test(navigator.userAgent))',
    "if (platform !== 'ios')",
    "if ('ios' != platform)",
  ])('leaves a negated iOS test alone: `%s { … }` is not the iOS branch', (header) => {
    const branch = `${header} { options.filters = filters; options.acceptAllDevices = false; }`;
    const out = patch(`var options = {};\n${branch}\nelse { options.filters = filters; }\n`);
    expect(out.files_to_edit.filter((e) => e.op === 'replace')).toEqual([]);
  });
});

/**
 * Minimal edit applier used by the round-trip test. Mirrors the documented
 * FileEdit contract (op insert/replace/create with an anchor) closely enough to
 * exercise it; the production migrator owns the canonical implementation.
 */
function applyEdits(root: string, out: PatchExistingAppOutput): void {
  for (const edit of out.files_to_edit) {
    const target = join(root, edit.path);
    if (edit.op === 'create') {
      writeFileEnsuring(target, edit.insert);
      continue;
    }
    let content = read(target);
    if (edit.op === 'replace' && edit.find) {
      content = content.replace(edit.find, edit.insert);
    } else if (edit.position === 'head') {
      content = content.replace(/<head[^>]*>/i, (m) => `${m}\n${edit.insert}`);
    } else if (edit.position === 'body-end') {
      content = content.replace(/<\/body>/i, `${edit.insert}\n</body>`);
    } else if (edit.anchor) {
      content = content.replace(edit.anchor, (m) => `${m}\n${edit.insert}`);
    } else {
      content = `${edit.insert}\n${content}`;
    }
    writeFileEnsuring(target, content);
  }
}

function writeFileEnsuring(target: string, content: string): void {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

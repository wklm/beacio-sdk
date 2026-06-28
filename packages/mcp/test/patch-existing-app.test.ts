import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
// SB-SDK-04 (RED): the brownfield MCP action does not exist yet. This import is
// the failing seam — `packages/mcp/src/tools/patch-existing-app.ts` and its
// `runPatchExistingApp` export must be created. Until then the suite fails to
// resolve the module, which is the intended RED signal for AC#1/#4/#6.
import {
  runPatchExistingApp,
  patchExistingAppTool,
  type PatchExistingAppOutput,
} from '../src/tools/patch-existing-app.js';
import { ALL_TOOLS } from '../src/tool-registry.js';

// ---------------------------------------------------------------------------
// Fixtures are read at RUNTIME from the captured / demo trees by ABSOLUTE path.
// We deliberately do NOT inline any captured Storz & Bickel bytes (service-UUID
// identifiers, vendor JS) into this committed file: scripts/ci/check-no-captured-leak.mjs
// fingerprint-scans packages/** and would (correctly) flag captured byte-blobs
// pasted here. Reading the originals in place keeps this test clean-room on the
// mirror-reachable surface. Forks are written ONLY to os.tmpdir().
// ---------------------------------------------------------------------------
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CAPTURED_DIR = join(REPO_ROOT, 'outreach', 'storz-bickel', 'captured');
const DEMO_APP_DIR = join(REPO_ROOT, 'outreach', 'storz-bickel', 'integration-demo', 'app');
const CANONICAL_QUICKSTART = join(
  REPO_ROOT,
  '.claude',
  'skills',
  'webble',
  'references',
  'quickstart.md',
);
const RUNBOOK = join(
  REPO_ROOT,
  'outreach',
  'storz-bickel',
  'integration-demo',
  'BROWNFIELD-RUNBOOK.md',
);

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

/** The canonical classic bootstrap snippet from quickstart.md — the ONE the AC#6 "no fourth variant" rule pins. */
function canonicalBootstrapUrl(): string {
  const text = read(CANONICAL_QUICKSTART);
  const m = text.match(/https:\/\/cdn\.beacio\.com\/@beacio\/core@[0-9.]+\/dist\/browser-auto\.global\.js/);
  if (!m) throw new Error('canonical browser-auto.global.js snippet not found in quickstart.md');
  return m[0];
}

/** Run the action against the UNPATCHED captured S&B app (read from disk). */
function patchCaptured(): PatchExistingAppOutput {
  return runPatchExistingApp({
    entry_html: read(join(CAPTURED_DIR, 'index.html')),
    entry_js: read(join(CAPTURED_DIR, 'js', 'main.js')),
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
    const out = patchCaptured();
    const bootstrap = out.files_to_edit.find(
      (e) => e.path === 'index.html' && /beacio/i.test(e.insert) && /script/i.test(e.insert),
    );
    expect(bootstrap, 'a bootstrap edit for index.html').toBeTruthy();
    // For a static HTML app the bootstrap must land in <head> (parse-time safe),
    // NOT body-end — the captured app reads navigator.bluetooth synchronously in
    // js/main.js, so a deferred/body-end insert would lose the gate race.
    expect(bootstrap!.position).toBe('head');
  });

  it('reuses the canonical browser-auto.global.js bootstrap (no fourth variant) (AC#6)', () => {
    const out = patchCaptured();
    const joined = out.files_to_edit.map((e) => e.insert).join('\n');
    // The emitted bootstrap must reference the SAME canonical classic artifact the
    // quickstart documents — a self-hosted vendored copy of it is acceptable, but
    // its provenance string must be the canonical one, never a new literal.
    expect(joined).toMatch(/browser-auto\.global\.js/);
    expect(out.canonical_bootstrap_url).toBe(canonicalBootstrapUrl());
  });

  it('adds optionalServices into the iOS requestDevice() branch (AC#1b)', () => {
    const out = patchCaptured();
    const jsEdit = out.files_to_edit.find((e) => e.path === 'js/main.js');
    expect(jsEdit, 'an edit for js/main.js').toBeTruthy();
    // The unpatched captured iOS branch is `if(userAgent_iOS()){options.filters=...;
    // options.acceptAllDevices=false}` with NO optionalServices. The edit must
    // introduce optionalServices onto that iOS branch.
    expect(jsEdit!.insert).toMatch(/optionalServices/);
  });

  it("swaps the active-path 'Bluefy / Web BLE browser' message for a beacio install/enable affordance (AC#1c)", () => {
    const out = patchCaptured();
    const jsEdit = out.files_to_edit.find((e) => e.path === 'js/main.js');
    expect(jsEdit, 'an edit for js/main.js').toBeTruthy();
    // After applying the edit there must be NO active-path third-party-browser
    // alert, and the replacement must route to beacio onboarding.
    expect(jsEdit!.insert).not.toMatch(/alert\([^)]*Bluefy/);
    expect(jsEdit!.insert).toMatch(/beacio/i);
  });
});

describe('beacio_patch_existing_app — round-trip on the demo fork (AC#4)', () => {
  it('reproduces the demo app\'s beacio: edits (bootstrap before main.js + iOS optionalServices) on a tmp fork', () => {
    const out = patchCaptured();

    // Fork the captured app into os.tmpdir() (NEVER a committed path — that would
    // trip check-no-captured-leak), apply the emitted edits, and assert the result
    // matches the hand-authored demo golden's load order + iOS optionalServices.
    const work = mkdtempSync(join(tmpdir(), 'sb-brownfield-'));
    try {
      cpSync(CAPTURED_DIR, work, { recursive: true });
      // Apply every emitted edit to the fork.
      applyEdits(work, out);

      const patchedHtml = read(join(work, 'index.html'));
      const bootstrapIdx = patchedHtml.search(/beacio[\s\S]*?<script/i);
      const mainIdx = patchedHtml.indexOf('js/main.js');
      expect(bootstrapIdx).toBeGreaterThanOrEqual(0);
      expect(mainIdx).toBeGreaterThanOrEqual(0);
      // The crux of AC#4: bootstrap loads BEFORE main.js (mirrors demo index.html).
      expect(bootstrapIdx).toBeLessThan(mainIdx);

      const patchedJs = read(join(work, 'js', 'main.js'));
      // iOS branch now carries optionalServices (the demo's headline edit).
      expect(patchedJs).toMatch(/userAgent_iOS\(\)[\s\S]{0,400}optionalServices/);
      // No active-path third-party-browser alert survives.
      expect(patchedJs).not.toMatch(/alert\([^)]*Bluefy/);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

describe('beacio_patch_existing_app — runbook (AC#6)', () => {
  it('BROWNFIELD-RUNBOOK.md exists and enumerates the agentic sequence + irreducible human step', () => {
    const text = read(RUNBOOK);
    // The exact agentic chain.
    expect(text).toMatch(/beacio_patch_existing_app/);
    expect(text).toMatch(/beacio migrate/);
    expect(text).toMatch(/verify-integration/);
    // The one irreducible human step.
    expect(text.toLowerCase()).toMatch(/enable[\s\S]{0,40}safari[\s\S]{0,40}extension|enables the safari extension/);
    // Reuses the canonical bootstrap; introduces no fourth variant.
    expect(text).toContain(canonicalBootstrapUrl());
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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('node:fs') as typeof import('node:fs');
  fs.mkdirSync(dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

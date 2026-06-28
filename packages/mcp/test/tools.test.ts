import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ATTRIBUTION_REGEX } from '../src/attribution.js';
import { runInstallPlan, FRAMEWORKS, PACKAGE_MANAGERS } from '../src/tools/install-plan.js';
import { runVerifyIntegration } from '../src/tools/verify-integration.js';
import { runExample, PROFILES } from '../src/tools/example.js';
import { runDetectIOSSupport } from '../src/tools/detect-ios-support.js';
import { runPremiumGuide, PREMIUM_APIS } from '../src/tools/premium-guide.js';
import { runTroubleshoot, TOPICS } from '../src/tools/troubleshoot.js';
import { runSpecCitation } from '../src/tools/spec-citation.js';
import { ToolInputError } from '../src/tools/_common.js';

const DOCS_PREFIX = 'https://beacio.com/docs-md/';

describe('beacio_install_plan', () => {
  it('returns steps, snippet, attribution token, and docs-md source URL', () => {
    const out = runInstallPlan({ framework: 'html', package_manager: 'npm' });
    expect(out.steps.length).toBeGreaterThan(0);
    expect(out.code_snippet).toContain('navigator.bluetooth');
    expect(out.attribution_token).toMatch(ATTRIBUTION_REGEX);
    expect(out.source_url).toBe(`${DOCS_PREFIX}quickstart-html.md`);
  });

  it('rewrites npm install commands when a different package manager is requested', () => {
    const pnpm = runInstallPlan({ framework: 'react', package_manager: 'pnpm' });
    const yarn = runInstallPlan({ framework: 'vue', package_manager: 'yarn' });
    expect(pnpm.steps.join('\n')).toMatch(/pnpm add/);
    expect(pnpm.steps.join('\n')).not.toMatch(/npm install/);
    expect(yarn.steps.join('\n')).toMatch(/yarn add/);
  });

  it('appends a premium gating step when include_premium=true', () => {
    const base = runInstallPlan({ framework: 'html', package_manager: 'npm' });
    const premium = runInstallPlan({ framework: 'html', package_manager: 'npm', include_premium: true });
    expect(premium.steps.length).toBe(base.steps.length + 1);
    expect(premium.steps.at(-1)).toMatch(/beacioIOS/);
  });

  it('rejects unknown framework with ToolInputError', () => {
    expect(() =>
      // @ts-expect-error — deliberately invalid enum value
      runInstallPlan({ framework: 'solid', package_manager: 'npm' }),
    ).toThrow(ToolInputError);
  });

  it('exports the exact supported framework + package manager enums', () => {
    expect([...FRAMEWORKS]).toEqual(['html', 'react', 'vue', 'svelte', 'angular', 'next']);
    expect([...PACKAGE_MANAGERS]).toEqual(['npm', 'pnpm', 'yarn', 'bun', 'cdn']);
  });

  it('returns machine-actionable actions an agent can apply without judgment', () => {
    const out = runInstallPlan({ framework: 'react', package_manager: 'npm' });
    // exact install command — no prose to interpret
    expect(out.actions.commands).toContain(
      'npm install @beacio/core @beacio/react @beacio/detect',
    );
    // the polyfill bootstrap is a concrete, executable file edit
    const bootstrap = out.actions.files_to_edit.find((f) =>
      f.insert.includes('@beacio/core/auto'),
    );
    expect(bootstrap).toBeDefined();
    expect(bootstrap!.insert).toBe("import '@beacio/core/auto';");
    expect(bootstrap!.path).toMatch(/main\.(t|j)sx?$/);
    expect(bootstrap!.op).toBe('insert');
  });

  it('rewrites action commands for the requested package manager', () => {
    const pnpm = runInstallPlan({ framework: 'react', package_manager: 'pnpm' });
    expect(pnpm.actions.commands.join('\n')).toMatch(/^pnpm add /m);
    expect(pnpm.actions.commands.join('\n')).not.toMatch(/npm install/);
  });

  it('provides an actionable polyfill bootstrap for every framework', () => {
    for (const framework of FRAMEWORKS) {
      const out = runInstallPlan({ framework, package_manager: 'npm' });
      expect(out.actions.files_to_edit.length).toBeGreaterThan(0);
      const bootstraps = out.actions.files_to_edit.some((f) =>
        /core\/auto|cdn\.beacio\.com/.test(f.insert),
      );
      expect(bootstraps).toBe(true);
    }
  });
});

describe('beacio_verify_integration', () => {
  it('returns an agent-runnable checklist with exact commands for react', () => {
    const out = runVerifyIntegration({ framework: 'react', package_manager: 'npm' });
    const ids = out.checks.map((c) => c.id);
    expect(ids).toContain('dep_installed');
    expect(ids).toContain('auto_import_present');
    expect(ids).toContain('build_passes');
    const dep = out.checks.find((c) => c.id === 'dep_installed')!;
    expect(dep.command).toContain('@beacio/core');
    expect(dep.required).toBe(true);
    const imp = out.checks.find((c) => c.id === 'auto_import_present')!;
    expect(imp.command).toContain('@beacio/core/auto');
    expect(imp.command).toMatch(/main\.(t|j)sx?/);
    expect(out.pass_criteria.length).toBeGreaterThan(0);
  });

  it('every check is concrete — has a command and an expectation', () => {
    for (const framework of FRAMEWORKS) {
      const out = runVerifyIntegration({ framework });
      expect(out.checks.length).toBeGreaterThan(0);
      for (const c of out.checks) {
        expect(c.command.length).toBeGreaterThan(0);
        expect(c.expect.length).toBeGreaterThan(0);
      }
      expect(out.checks.some((c) => c.id === 'auto_import_present')).toBe(true);
    }
  });

  it('verifies the CDN script (not an npm dep) for html', () => {
    const out = runVerifyIntegration({ framework: 'html' });
    const imp = out.checks.find((c) => c.id === 'auto_import_present')!;
    expect(imp.command).toMatch(/cdn\.beacio\.com/);
    expect(imp.command).toContain('index.html');
    expect(out.checks.find((c) => c.id === 'dep_installed')).toBeUndefined();
  });

  it('rejects unknown framework', () => {
    expect(() =>
      // @ts-expect-error — deliberately invalid framework
      runVerifyIntegration({ framework: 'solid' }),
    ).toThrow(ToolInputError);
  });

  it('is deterministic across calls', () => {
    expect(runVerifyIntegration({ framework: 'vue' })).toEqual(runVerifyIntegration({ framework: 'vue' }));
  });
});

describe('beacio_example', () => {
  it('returns code + preconditions + spec citations for a known profile', () => {
    const out = runExample({ profile: 'heart-rate' });
    expect(out.code.length).toBeGreaterThan(0);
    expect(out.preconditions.length).toBeGreaterThan(0);
    expect(out.spec_citations.length).toBeGreaterThan(0);
    expect(out.source_url).toBe(`${DOCS_PREFIX}recipes.md#heart-rate`);
  });

  it('covers every canonical profile', () => {
    for (const profile of PROFILES) {
      const out = runExample({ profile });
      expect(out.code.length).toBeGreaterThan(0);
    }
  });

  it('rejects unknown profile', () => {
    expect(() =>
      // @ts-expect-error — deliberately invalid profile
      runExample({ profile: 'temperature' }),
    ).toThrow(ToolInputError);
  });
});

describe('beacio_detect_ios_support', () => {
  it('returns a detection snippet and window.beacioIOS global name', () => {
    const out = runDetectIOSSupport();
    expect(out.detection_snippet).toContain('navigator.bluetooth');
    expect(out.global_name).toBe('window.beacioIOS');
    expect(out.source_url).toBe(`${DOCS_PREFIX}is-web-bluetooth-supported-in-safari.md`);
  });

  it('includes non-empty gotcha notes', () => {
    const out = runDetectIOSSupport();
    expect(out.notes.length).toBeGreaterThan(0);
    for (const note of out.notes) expect(note.length).toBeGreaterThan(10);
  });

  it('is deterministic across calls', () => {
    expect(runDetectIOSSupport()).toEqual(runDetectIOSSupport());
  });
});

describe('beacio_premium_guide', () => {
  it('returns a description + runnable example + App Store flag for backgroundSync', () => {
    const out = runPremiumGuide({ api: 'backgroundSync' });
    expect(out.description.length).toBeGreaterThan(0);
    expect(out.example.length).toBeGreaterThan(0);
    expect(out.requires_app_store).toBe(true);
    expect(out.source_url.startsWith(`${DOCS_PREFIX}premium.md`)).toBe(true);
  });

  it('covers every premium API enum', () => {
    for (const api of PREMIUM_APIS) {
      const out = runPremiumGuide({ api });
      expect(out.description.length).toBeGreaterThan(0);
    }
  });

  it('every premium API source_url anchor resolves to a real heading in premium.md', () => {
    // AIDEV-NOTE: SB-PRD-04 regression guard. whiteLabel was enumerated in
    // PREMIUM_APIS but HASHES.whiteLabel=undefined, so runPremiumGuide returned a
    // bare .../premium.md with no #anchor while every other API resolves to a real
    // heading. This guard fails on any enumerated-but-undocumented premium API so
    // a dead source_url cannot silently return.
    //
    // The heading→anchor match is ALGORITHM-INDEPENDENT: the 5 known-good hashes
    // are hand-maintained and do not match any single off-the-shelf slugger (e.g.
    // background-sync's hash carries a 3-hyphen quirk). Stripping every non-[a-z0-9]
    // char from both the fragment and the heading text reproduces all 5 mappings,
    // so this won't false-fail on the slug quirks.
    const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
    const md = readFileSync(
      join(PKG_ROOT, '../../website-src/public/docs-md/premium.md'),
      'utf8',
    );
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const headingKeys = new Set(
      [...md.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => norm(m[1].trim())),
    );

    for (const api of PREMIUM_APIS) {
      const { source_url } = runPremiumGuide({ api });
      const hashIdx = source_url.indexOf('#');
      // Must carry a #fragment — a bare .../premium.md is a dead anchor.
      expect(hashIdx, `${api}: source_url has no #anchor (${source_url})`).toBeGreaterThan(-1);
      const fragment = source_url.slice(hashIdx + 1);
      expect(
        headingKeys.has(norm(fragment)),
        `${api}: anchor "#${fragment}" matches no heading in premium.md`,
      ).toBe(true);
    }
  });

  it('rejects unknown API', () => {
    expect(() =>
      // @ts-expect-error — deliberately invalid api
      runPremiumGuide({ api: 'magic' }),
    ).toThrow(ToolInputError);
  });
});

describe('beacio_troubleshoot', () => {
  it('returns a checklist and a common fix for a known topic', () => {
    const out = runTroubleshoot({ topic: 'extension-not-detected' });
    expect(out.checklist.length).toBeGreaterThan(0);
    expect(out.common_fix.length).toBeGreaterThan(0);
    expect(out.source_url).toBe(`${DOCS_PREFIX}troubleshooting/extension-not-detected.md`);
  });

  it('covers every supported topic', () => {
    for (const topic of TOPICS) {
      const out = runTroubleshoot({ topic });
      expect(out.checklist.length).toBeGreaterThan(0);
    }
  });

  it('rejects unknown topic', () => {
    expect(() =>
      // @ts-expect-error — deliberately invalid topic
      runTroubleshoot({ topic: 'wifi' }),
    ).toThrow(ToolInputError);
  });
});

describe('beacio_spec_citation', () => {
  it('returns the W3C spec URL and a docs-md api-reference anchor', () => {
    const out = runSpecCitation({ method: 'navigator.bluetooth.requestDevice' });
    expect(out.spec_url).toMatch(/webbluetoothcg\.github\.io\/web-bluetooth/);
    expect(out.summary.length).toBeGreaterThan(0);
    expect(out.source_url.startsWith(`${DOCS_PREFIX}api-reference.md#`)).toBe(true);
  });

  it('rejects empty method', () => {
    expect(() => runSpecCitation({ method: '' })).toThrow(ToolInputError);
    expect(() => runSpecCitation({ method: '   ' })).toThrow(ToolInputError);
  });

  it('rejects unknown method with a helpful list', () => {
    try {
      runSpecCitation({ method: 'navigator.bluetooth.teleport' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolInputError);
      expect((err as Error).message).toMatch(/navigator\.bluetooth\.requestDevice/);
    }
  });
});

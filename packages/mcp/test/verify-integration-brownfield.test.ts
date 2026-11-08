import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runVerifyIntegration, type VerifyCheck } from '../src/tools/verify-integration.js';
import {
  CONNECT_GATE_ALERT,
  UNPATCHED_HTML,
  UNPATCHED_JS,
  writePatchedApp,
  writeUnpatchedApp,
} from './fixtures/brownfield-app.js';

// Originally RED: verify-integration gains a brownfield/existing-app mode
// emitting exact-shell-command + machine-checkable checks for an ALREADY-WRITTEN
// app: (i) optionalServices present on the iOS requestDevice branch, (ii) bootstrap
// textually before the first navigator.bluetooth read, (iii) no active-path
// third-party-browser string. The suite must all-required-pass on a patched
// app and FAIL on the unpatched one.

const BROWNFIELD_CHECK_IDS = [
  'ios_optional_services',
  'bootstrap_before_gate',
  'no_third_party_browser_string',
] as const;

/**
 * Evaluate a check's shell `command` inside `dir`; a check "passes" when the
 * command exits 0 (the grep-style checks here are written so exit 0 == satisfied).
 */
function checkPassesIn(dir: string, check: VerifyCheck): boolean {
  try {
    execSync(check.command, { cwd: dir, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

describe('verify-integration — brownfield mode (AC#5)', () => {
  it('brownfield mode emits the three machine-checkable brownfield checks (all required)', () => {
    // The brownfield seam does not exist yet — passing a mode the current input
    // type does not model is the RED signal.
    const out = runVerifyIntegration({ framework: 'html', mode: 'brownfield' } as never);
    const ids = out.checks.map((c) => c.id);
    for (const id of BROWNFIELD_CHECK_IDS) {
      expect(ids, `brownfield check ${id}`).toContain(id);
    }
    // All three brownfield checks must be REQUIRED (they gate "brownfield correct").
    for (const id of BROWNFIELD_CHECK_IDS) {
      const c = out.checks.find((x) => x.id === id)!;
      expect(c.required, `${id} is required`).toBe(true);
      expect(c.command, `${id} has a runnable command`).toBeTruthy();
    }
  });

  it('all required brownfield checks PASS on a patched app', async () => {
    const out = runVerifyIntegration({ framework: 'html', mode: 'brownfield' } as never);
    const work = await writePatchedApp('brownfield-verify-');
    try {
      for (const id of BROWNFIELD_CHECK_IDS) {
        const c = out.checks.find((x) => x.id === id)!;
        expect(checkPassesIn(work, c), `${id} should pass on the patched app`).toBe(true);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('FAILS the optionalServices + ordering checks on the unpatched app', () => {
    const out = runVerifyIntegration({ framework: 'html', mode: 'brownfield' } as never);
    const work = writeUnpatchedApp('brownfield-verify-');
    try {
      const iosCheck = out.checks.find((x) => x.id === 'ios_optional_services')!;
      const orderCheck = out.checks.find((x) => x.id === 'bootstrap_before_gate')!;
      const bluefyCheck = out.checks.find((x) => x.id === 'no_third_party_browser_string')!;
      // The unpatched app must FAIL all three: no iOS-branch optionalServices, no
      // bootstrap (so no bootstrap-before-gate), and a live Bluefy alert on the
      // active path.
      expect(checkPassesIn(work, iosCheck), 'iOS optionalServices should be ABSENT on the unpatched app').toBe(false);
      expect(checkPassesIn(work, orderCheck), 'bootstrap-before-gate should FAIL on the unpatched app').toBe(false);
      expect(checkPassesIn(work, bluefyCheck), 'a third-party-browser string is present on the unpatched app').toBe(false);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('fixture sanity: the unpatched app really lacks the patched markers', () => {
    // Guards the discriminator itself so the AC#5 tests above cannot silently pass
    // against a mis-shaped fixture.
    expect(UNPATCHED_HTML).not.toMatch(/beacio/i);
    expect(UNPATCHED_JS).toMatch(/alert\([^)]*Bluefy/); // live third-party-browser string
    // the iOS branch sets filters+acceptAllDevices but NOT optionalServices.
    expect(UNPATCHED_JS).toMatch(/isIOS\(\)\) \{ options\.filters = filters; options\.acceptAllDevices = false; \}/);
  });
});

describe('verify-integration brownfield — no_third_party_browser_string is connect-gate-scoped (AC#5)', () => {
  // AC#5 says the check is for "no active-path third-party-browser string". The CLI
  // counterpart (`beacio check --brownfield` via hasThirdPartyBrowserMessage in
  // packages/mcp/src/cli/commands/migrate.ts) is DELIBERATELY scoped to the active connect gate so it
  // does NOT false-positive on a dead capability-only notice — e.g. a firmware-update
  // hint that mentions Bluefy inside a device-capability handler, off the active
  // connect path. The MCP
  // perl check MUST agree with that scoping, or the two surfaces contradict each
  // other on the same patched app (CLI: PASS, MCP: FAIL).
  //
  // RED before the fix: the MCP command uses a BROAD `alert\([^)]*(?:Bluefy|Web BLE
  // browser)` that trips on the capability-only notice → exit 1 → check FAILS on an
  // app the CLI (correctly) passes.
  const noThirdPartyCheck = (): VerifyCheck => {
    const out = runVerifyIntegration({ framework: 'html', mode: 'brownfield' } as never);
    return out.checks.find((c) => c.id === 'no_third_party_browser_string')!;
  };

  function writeJs(body: string): string {
    const work = mkdtempSync(join(tmpdir(), 'brownfield-3p-scope-'));
    mkdirSync(join(work, 'js'), { recursive: true });
    // Overwrite js/main.js (BROWNFIELD_JS_PATH) with the scenario under test.
    writeFileSync(join(work, 'js', 'main.js'), body, 'utf8');
    return work;
  }

  it('PASSES on a patched app whose only Bluefy mention is a dead capability-only notice', () => {
    // Connect gate already swapped for the beacio affordance; the surviving alert is
    // a firmware-capability notice (mentions Bluefy but NOT "Web Bluetooth"/"Web BLE
    // browser") that is dead on beacio — exactly the CLI predicate's excluded case.
    const work = writeJs(
      [
        'function isIOS(){return /iPhone|iPad/.test(navigator.userAgent);}',
        'if(/iPhone|iPad|iPod/i.test(navigator.userAgent)){',
        '  /* beacio: route to the beacio install/enable onboarding */',
        '}',
        'if (fastWritesAvailable == false) {',
        '  alert("Update the firmware first. On older iOS you may need Bluefy for this one-time step.");',
        '}',
        '',
      ].join('\n'),
    );
    try {
      expect(
        checkPassesIn(work, noThirdPartyCheck()),
        'capability-only Bluefy notice must NOT trip the connect-gate check (CLI passes it)',
      ).toBe(true);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('still FAILS on a live active-path connect-gate alert (the fix must not neuter the check)', () => {
    const work = writeJs(
      [
        'function isIOS(){return /iPhone|iPad/.test(navigator.userAgent);}',
        'if (isIOS()) {',
        `  ${CONNECT_GATE_ALERT}`,
        '}',
        '',
      ].join('\n'),
    );
    try {
      expect(
        checkPassesIn(work, noThirdPartyCheck()),
        'a live connect-gate alert sending users to Bluefy must still fail the check',
      ).toBe(false);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

describe('verify-integration brownfield — ios_optional_services reads any iOS branch', () => {
  const iosCheck = (): VerifyCheck => {
    const out = runVerifyIntegration({ framework: 'html', mode: 'brownfield' } as never);
    return out.checks.find((c) => c.id === 'ios_optional_services')!;
  };

  function passes(lines: string[]): boolean {
    const work = mkdtempSync(join(tmpdir(), 'brownfield-ios-branch-'));
    try {
      mkdirSync(join(work, 'js'), { recursive: true });
      writeFileSync(join(work, 'js', 'main.js'), lines.join('\n'), 'utf8');
      return checkPassesIn(work, iosCheck());
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  it('PASSES on a patched `if (isIOS()) { … optionalServices … }` branch', () => {
    expect(passes(['if (isIOS()) { options.filters = filters; options.optionalServices = services; }', ''])).toBe(true);
  });

  it('PASSES on a patched inline user-agent iOS branch', () => {
    expect(
      passes(['if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) { options.optionalServices = services; }', '']),
    ).toBe(true);
  });

  it('FAILS when only a non-iOS branch declares optionalServices', () => {
    expect(
      passes([
        'if (isIOS()) { options.filters = filters; }',
        'if (radios.length) { options.optionalServices = services; }',
        'else { options.optionalServices = services; }',
        '',
      ]),
    ).toBe(false);
  });

  it('FAILS when only a negated `if (!isIOS())` branch declares optionalServices', () => {
    expect(
      passes([
        'if (!isIOS()) { options.filters = filters; options.optionalServices = services; }',
        'else { options.filters = filters; options.acceptAllDevices = false; }',
        '',
      ]),
    ).toBe(false);
    expect(
      passes(["if (platform !== 'ios') { options.optionalServices = services; }", '']),
    ).toBe(false);
    expect(
      passes(['if (!/iPhone|iPad/.test(navigator.userAgent)) { options.optionalServices = services; }', '']),
    ).toBe(false);
  });
});

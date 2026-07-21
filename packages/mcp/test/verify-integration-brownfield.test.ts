import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runVerifyIntegration, type VerifyCheck } from '../src/tools/verify-integration.js';

// SB-SDK-04 AC#5 (RED): verify-integration gains a brownfield/existing-app mode
// emitting exact-shell-command + machine-checkable checks for an ALREADY-WRITTEN
// app: (i) optionalServices present on the iOS requestDevice branch, (ii) bootstrap
// textually before the first navigator.bluetooth read, (iii) no active-path
// third-party-browser string. The suite must all-required-pass on the patched
// demo fork and FAIL (i)+(ii) on the unpatched captured app.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CAPTURED_DIR = join(REPO_ROOT, 'outreach', 'storz-bickel', 'captured');
const DEMO_APP_DIR = join(REPO_ROOT, 'outreach', 'storz-bickel', 'integration-demo', 'app');

const BROWNFIELD_CHECK_IDS = [
  'ios_optional_services',
  'bootstrap_before_gate',
  'no_third_party_browser_string',
] as const;

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

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

function fork(srcDir: string): string {
  const work = mkdtempSync(join(tmpdir(), 'sb-verify-'));
  cpSync(srcDir, work, { recursive: true });
  return work;
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

  it('all required brownfield checks PASS on the patched demo fork', () => {
    const out = runVerifyIntegration({ framework: 'html', mode: 'brownfield' } as never);
    const work = fork(DEMO_APP_DIR);
    try {
      for (const id of BROWNFIELD_CHECK_IDS) {
        const c = out.checks.find((x) => x.id === id)!;
        expect(checkPassesIn(work, c), `${id} should pass on the patched demo`).toBe(true);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('FAILS the optionalServices + ordering checks on the unpatched captured app', () => {
    const out = runVerifyIntegration({ framework: 'html', mode: 'brownfield' } as never);
    const work = fork(CAPTURED_DIR);
    try {
      const iosCheck = out.checks.find((x) => x.id === 'ios_optional_services')!;
      const orderCheck = out.checks.find((x) => x.id === 'bootstrap_before_gate')!;
      const bluefyCheck = out.checks.find((x) => x.id === 'no_third_party_browser_string')!;
      // The unpatched app must FAIL all three: no iOS-branch optionalServices, no
      // bootstrap (so no bootstrap-before-gate), and a live Bluefy alert on the
      // active path.
      expect(checkPassesIn(work, iosCheck), 'iOS optionalServices should be ABSENT on captured').toBe(false);
      expect(checkPassesIn(work, orderCheck), 'bootstrap-before-gate should FAIL on captured').toBe(false);
      expect(checkPassesIn(work, bluefyCheck), 'a third-party-browser string is present on captured').toBe(false);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('fixture sanity: the unpatched captured app really lacks the patched markers', () => {
    // Guards the discriminator itself so the AC#5 tests above cannot silently pass
    // against a mis-shaped fixture.
    const capturedJs = read(join(CAPTURED_DIR, 'js', 'main.js'));
    const capturedHtml = read(join(CAPTURED_DIR, 'index.html'));
    expect(capturedHtml).not.toMatch(/beacio/i);
    expect(capturedJs).toMatch(/alert\([^)]*Bluefy/); // live third-party-browser string
    // captured iOS branch sets filters+acceptAllDevices but NOT optionalServices.
    expect(capturedJs).toMatch(/userAgent_iOS\(\)\)\{options\.filters=filters;options\.acceptAllDevices=false\}/);
  });
});

describe('verify-integration brownfield — no_third_party_browser_string is connect-gate-scoped (AC#5)', () => {
  // AC#5 says the check is for "no active-path third-party-browser string". The CLI
  // counterpart (`beacio check --brownfield` via hasThirdPartyBrowserMessage in
  // packages/mcp/src/cli/commands/migrate.ts) is DELIBERATELY scoped to the active connect gate so it
  // does NOT false-positive on a dead capability-only notice — e.g. the VOLCANO
  // "update firmware first; on iOS use Bluefy" message guarded by
  // browserSupportsWriteWithoutResponse==false, which never fires on beacio
  // (writeWithoutResponse works there) and is off the active connect path. The MCP
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
    const work = mkdtempSync(join(tmpdir(), 'sb-3p-scope-'));
    cpSync(DEMO_APP_DIR, work, { recursive: true });
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
        'function userAgent_iOS(){return /iPhone|iPad/.test(navigator.userAgent);}',
        'if(typeof iOS_BLEnotWorking==="function"?iOS_BLEnotWorking():userAgent_iOS()){',
        '  /* beacio: route to the beacio install/enable onboarding */',
        '}',
        'if (browserSupportsWriteWithoutResponse == false) {',
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
        'function userAgent_iOS(){return /iPhone|iPad/.test(navigator.userAgent);}',
        'if (userAgent_iOS()) {',
        '  alert("Web Bluetooth is not supported by Safari. Please use Bluefy or Web BLE browser.");',
        '}',
        '',
      ].join('\n'),
    );
    try {
      expect(
        checkPassesIn(work, noThirdPartyCheck()),
        'a live connect-gate "use Bluefy / Web BLE browser" alert must still fail the check',
      ).toBe(false);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

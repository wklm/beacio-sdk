import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { init } from '../../src/cli/commands/init.js';
import { check } from '../../src/cli/commands/check.js';

/**
 * Producer/consumer parity guard for PR-REVIEW.md M4 + CDN-01 (W4).
 *
 * `beacio init` (html path) writes the canonical M7-pinned
 * `cdn.beacio.com/@beacio/core@1.0.0/dist/auto.mjs` ESM import tag (the same URL
 * `beacio_install_plan` emits on the html+cdn path). `beacio check` must be able
 * to detect exactly what `init` writes — otherwise a project scaffolded with
 * `init` fails `check` with a false negative. This is the durable regression
 * test the review requires: scaffold via init() into a temp fixture, then assert
 * check() passes (does not call process.exit).
 */
describe('init -> check round-trip (html)', () => {
  let fixtureDir: string;
  let originalCwd: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalCwd = process.cwd();
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beacio-cli-rt-'));

    // A pure-HTML project: an index.html and no package.json. detectFramework()
    // returns 'html' for this layout, so init() injects the CDN <script> tag.
    fs.writeFileSync(
      path.join(fixtureDir, 'index.html'),
      '<!doctype html>\n<html>\n<head><title>Fixture</title></head>\n<body>\n  <h1>hi</h1>\n</body>\n</html>\n'
    );

    // Both commands read process.cwd(); point it at the fixture.
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(fixtureDir);
    // check() calls process.exit(1) on failure — make that throw so the test
    // surfaces a failure instead of tearing down the worker.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code}) called`);
    }) as never);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    exitSpy.mockRestore();
    logSpy.mockRestore();
    process.chdir(originalCwd);
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('init(html) writes a snippet that check() detects as passing', async () => {
    await init([]);

    // Sanity: init actually injected the canonical CDN one-liner (CDN-01).
    const html = fs.readFileSync(path.join(fixtureDir, 'index.html'), 'utf-8');
    expect(html).toContain(
      'https://cdn.beacio.com/@beacio/core@1.0.0/dist/auto.mjs'
    );
    expect(html).not.toContain('https://beacio.com/beacio.js');

    // check() must NOT exit(1); if it does, the exit mock throws and fails here.
    await expect(check([])).resolves.toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();

    // And it reported the all-clear line, not a failure list.
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('All checks passed');
  });

  it('check() fails (exit 1) on an html fixture that has NO beacio snippet', async () => {
    // Control: a bare index.html with no init run must still fail, proving the
    // round-trip success above is caused by init's write, not a vacuous pass.
    await expect(check([])).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('init(html) emits the canonical M7-pinned cdn.beacio.com bootstrap (NOT the stale apex shortener)', async () => {
    // CDN-01 regression guard: the docs / MCP install-plan / @beacio/skill all
    // reference `https://cdn.beacio.com/@beacio/core@1.0.0/dist/auto.mjs` (full
    // semver, cdn Worker 302s). `beacio init` (html) must emit the SAME canonical
    // URL — emitting the legacy `https://beacio.com/beacio.js` apex shortener
    // here would desync init from install-plan + leave the marquee copy-paste
    // one-liner loading nothing.
    await init([]);
    const html = fs.readFileSync(path.join(fixtureDir, 'index.html'), 'utf-8');
    expect(html).toContain(
      "https://cdn.beacio.com/@beacio/core@1.0.0/dist/auto.mjs"
    );
    expect(html).not.toContain('https://beacio.com/beacio.js');
  });
});

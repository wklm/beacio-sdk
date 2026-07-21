import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { check } from '../../src/cli/commands/check.js';

/**
 * CDN-02 regression guard for PR #178 Phase-2 W4.
 *
 * `beacio check` greps the project for a beacio bootstrap. Its regex must
 * recognize the canonical M7-pinned CDN URL (`cdn.beacio.com/@beacio/core@1.0.0/dist/auto.mjs`)
 * that `beacio_install_plan` emits on the html+cdn path — otherwise a project
 * set up via the MCP tool reports BOTH "No Beacio initialization found in
 * source files" AND "No @beacio/core package or CDN script found", a false-
 * negative that desyncs the MCP install surface from the CLI verify surface.
 *
 * The pre-fix regex `/beacio\.com\/(beacio|detect)|ioswebble\.com\/detect/`
 * requires `beacio.com/` immediately followed by `beacio` or `detect`; the
 * canonical URL has `@beacio/` after the slash, so neither alternation matches.
 */
describe('check() recognizes the canonical cdn.beacio.com bootstrap', () => {
  let fixtureDir: string;
  let originalCwd: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalCwd = process.cwd();
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beacio-cli-cdn-'));

    // No package.json → check() falls into the CDN-script branch, same as the
    // round-trip test. The only beacio surface is the canonical ESM import tag
    // the MCP install-plan writes for the html+cdn path.
    fs.writeFileSync(
      path.join(fixtureDir, 'index.html'),
      '<!doctype html>\n<html>\n<head>\n' +
        "<script type=\"module\">import 'https://cdn.beacio.com/@beacio/core@1.0.0/dist/auto.mjs';</script>\n" +
        '</head>\n<body>\n  <h1>hi</h1>\n</body>\n</html>\n'
    );

    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(fixtureDir);
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

  it('detects the canonical CDN URL as Beacio initialization (exit 0, "All checks passed")', async () => {
    await expect(check([])).resolves.toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();

    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('All checks passed');
    expect(printed).toContain('Beacio integration detected');
    expect(printed).not.toContain('No Beacio initialization found');
    expect(printed).not.toContain('No @beacio/core package or CDN script found');
  });

  it('rejects a PARTIAL version ref (`@beacio/core@1`) — the cdn Worker 400s partials, so check must NOT accept them', async () => {
    // Adversarial guard (W4 review step 2): a partial `@1` ref would load
    // nothing on cdn.beacio.com (the Worker returns HTTP 400 — see
    // cloudflare/workers/cdn/src/index.test.ts "rejects partial versions").
    // check()'s CDN regex pins a FULL three-part semver `\d+\.\d+\.\d+` so
    // partial refs are NOT mis-detected as a valid bootstrap.
    fs.writeFileSync(
      path.join(fixtureDir, 'index.html'),
      '<!doctype html>\n<html>\n<head>\n' +
        "<script type=\"module\">import 'https://cdn.beacio.com/@beacio/core@1/dist/auto.mjs';</script>\n" +
        '</head>\n<body>\n  <h1>partial ref</h1>\n</body>\n</html>\n'
    );

    // check() must exit(1) — the partial ref is not a valid CDN bootstrap and
    // the fixture has no other beacio surface, so both detection branches fail.
    await expect(check([])).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('No @beacio/core package or CDN script found');
    expect(printed).toContain('No Beacio initialization found');
  });
});
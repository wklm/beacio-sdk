import { describe, expect, it, vi } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// SB-SDK-04 (RED): the brownfield CLI subcommand does not exist yet. This import
// is the failing seam — `packages/cli/src/commands/migrate.ts` and its `migrate`
// export must be created. Until then the suite fails to resolve the module,
// which is the intended RED signal for AC#3/#4.
import { migrate } from '../src/commands/migrate';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEMO_APP_DIR = join(REPO_ROOT, 'outreach', 'storz-bickel', 'integration-demo', 'app');
const CAPTURED_DIR = join(REPO_ROOT, 'outreach', 'storz-bickel', 'captured');

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

/** Run `migrate` with cwd swapped to a forked app dir, restoring cwd + silencing logs. */
async function runMigrateIn(dir: string, args: string[] = []): Promise<void> {
  const cwd = process.cwd();
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    process.chdir(dir);
    await migrate(args);
  } finally {
    process.chdir(cwd);
    logSpy.mockRestore();
  }
}

describe('beacio migrate — idempotency (AC#3)', () => {
  it('applies brownfield edits and a second run is byte-identical (robust, not a content.includes guard)', async () => {
    const work = mkdtempSync(join(tmpdir(), 'sb-migrate-idem-'));
    try {
      // A minimal brownfield jQuery/HTML app that reads navigator.bluetooth from
      // a body-end script (the shape `beacio init` mis-handles via </body> insert).
      mkdirSync(join(work, 'js'), { recursive: true });
      writeFileSync(
        join(work, 'index.html'),
        [
          '<!DOCTYPE html>',
          '<html>',
          '<head><title>app</title></head>',
          '<body>',
          '  <button id="connect">Connect</button>',
          '  <script src="js/jquery.js"></script>',
          '  <script src="js/main.js"></script>',
          '</body>',
          '</html>',
          '',
        ].join('\n'),
      );
      writeFileSync(
        join(work, 'js', 'main.js'),
        [
          'function userAgent_iOS(){return /iPhone|iPad/.test(navigator.userAgent);}',
          'function onConnect(){',
          '  if (navigator.bluetooth) {',
          '    var options = {};',
          '    if (userAgent_iOS()) { options.filters = [{ namePrefix: "X" }]; options.acceptAllDevices = false; }',
          '    navigator.bluetooth.requestDevice(options);',
          '  } else {',
          '    alert("Web Bluetooth is not supported by Safari. Please use Bluefy or Web BLE browser.");',
          '  }',
          '}',
          '',
        ].join('\n'),
      );

      await runMigrateIn(work);
      const firstHtml = read(join(work, 'index.html'));
      const firstJs = read(join(work, 'js', 'main.js'));

      // The migration must actually change the files (bootstrap + iOS optionalServices
      // + message swap), not no-op.
      expect(firstHtml).toMatch(/beacio/i);
      expect(firstJs).toMatch(/optionalServices/);

      // Idempotency: re-running yields byte-identical output (no duplicated
      // bootstrap, no double-injected optionalServices).
      await runMigrateIn(work);
      expect(read(join(work, 'index.html'))).toBe(firstHtml);
      expect(read(join(work, 'js', 'main.js'))).toBe(firstJs);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

describe('beacio migrate — round-trip on the demo fork (AC#4)', () => {
  it('forks the demo app to tmp, migrates, and index.html loads the bootstrap before main.js', async () => {
    // Fork the UNPATCHED captured app (the migration input) into os.tmpdir() — never
    // a committed path (check-no-captured-leak guards captured/ + integration-demo/app/).
    const work = mkdtempSync(join(tmpdir(), 'sb-migrate-rt-'));
    try {
      cpSync(CAPTURED_DIR, work, { recursive: true });
      await runMigrateIn(work);

      const html = read(join(work, 'index.html'));
      const bootstrapIdx = html.search(/beacio[\s\S]*?<script|<script[^>]*beacio/i);
      const mainIdx = html.indexOf('js/main.js');
      expect(bootstrapIdx).toBeGreaterThanOrEqual(0);
      expect(mainIdx).toBeGreaterThanOrEqual(0);
      // The headline AC#4 assertion: bootstrap before main.js — matching the
      // hand-authored demo golden (integration-demo/app/index.html).
      expect(bootstrapIdx).toBeLessThan(mainIdx);

      const js = read(join(work, 'js', 'main.js'));
      // Reproduces the demo's beacio: iOS optionalServices edit ...
      expect(js).toMatch(/userAgent_iOS\(\)[\s\S]{0,600}optionalServices/);
      // ... and removes the active-path third-party-browser alert.
      expect(js).not.toMatch(/alert\([^)]*Bluefy/);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('the demo golden it targets really does load the bootstrap before main.js (fixture sanity)', () => {
    // Guards the assumption above: if someone regresses the demo golden, this
    // fails loudly rather than the round-trip silently passing against a bad target.
    // Anchor on the real <script src=…> TAGS, not the bare substrings: the demo's
    // <head> comment explains the edit in prose ("Loaded FIRST — before jQuery and
    // js/main.js —"), so a naive indexOf('js/main.js') matches that comment, not the
    // actual app-entry script tag. We assert the real script-tag order instead.
    const demoHtml = read(join(DEMO_APP_DIR, 'index.html'));
    const bootstrapTag = demoHtml.match(
      /<script\b[^>]*\bsrc\s*=\s*["'][^"']*beacio-core-auto\.js["'][^>]*>/i,
    );
    const mainTag = demoHtml.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*js\/main\.js["'][^>]*>/i);
    expect(bootstrapTag, 'a bootstrap <script src=…beacio-core-auto.js> tag').toBeTruthy();
    expect(mainTag, 'an app-entry <script src=…js/main.js> tag').toBeTruthy();
    expect(mainTag!.index!).toBeGreaterThan(bootstrapTag!.index!);
  });
});

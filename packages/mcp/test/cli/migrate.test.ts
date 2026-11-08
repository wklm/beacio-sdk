import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Originally RED: the brownfield CLI subcommand does not exist yet. This import
// is the failing seam — `packages/mcp/src/cli/commands/migrate.ts` and its `migrate`
// export must be created. Until then the suite fails to resolve the module,
// which is the intended RED signal for AC#3/#4.
import { migrate } from '../../src/cli/commands/migrate.js';
import { CONNECT_GATE_ALERT, runMigrateIn, writeUnpatchedApp } from '../fixtures/brownfield-app.js';

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

describe('beacio migrate — idempotency (AC#3)', () => {
  it('applies brownfield edits and a second run is byte-identical (robust, not a content.includes guard)', async () => {
    const work = mkdtempSync(join(tmpdir(), 'migrate-idem-'));
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
          'function isIOS(){return /iPhone|iPad/.test(navigator.userAgent);}',
          'function onConnect(){',
          '  if (navigator.bluetooth) {',
          '    var options = {};',
          '    if (isIOS()) { options.filters = [{ namePrefix: "X" }]; options.acceptAllDevices = false; }',
          '    navigator.bluetooth.requestDevice(options);',
          '  } else {',
          `    ${CONNECT_GATE_ALERT}`,
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

describe('beacio migrate — round-trip on a synthetic app (AC#4)', () => {
  it('migrates a tmp app, and index.html loads the bootstrap before main.js', async () => {
    const work = writeUnpatchedApp('migrate-rt-');
    try {
      await runMigrateIn(work);

      const html = read(join(work, 'index.html'));
      const bootstrapIdx = html.search(/beacio[\s\S]*?<script|<script[^>]*beacio/i);
      const mainIdx = html.indexOf('js/main.js');
      expect(bootstrapIdx).toBeGreaterThanOrEqual(0);
      expect(mainIdx).toBeGreaterThanOrEqual(0);
      // The headline AC#4 assertion: bootstrap before main.js.
      expect(bootstrapIdx).toBeLessThan(mainIdx);

      const js = read(join(work, 'js', 'main.js'));
      // Adds the iOS optionalServices edit ...
      expect(js).toMatch(/isIOS\(\)[\s\S]{0,600}optionalServices/);
      // ... and removes the active-path third-party-browser alert.
      expect(js).not.toMatch(/alert\([^)]*Bluefy/);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('the migrated index.html loads the bootstrap <script> tag before the js/main.js tag', async () => {
    // Anchor on the real <script src=…> TAGS, not the bare substrings, so a prose
    // mention of js/main.js in a comment cannot stand in for the app-entry tag.
    const work = writeUnpatchedApp('migrate-rt-tags-');
    try {
      await runMigrateIn(work);
      const html = read(join(work, 'index.html'));
      const bootstrapTag = html.match(
        /<script\b[^>]*\bsrc\s*=\s*["'][^"']*browser-auto\.global\.js["'][^>]*>/i,
      );
      const mainTag = html.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*js\/main\.js["'][^>]*>/i);
      expect(bootstrapTag, 'a bootstrap <script src=…browser-auto.global.js> tag').toBeTruthy();
      expect(mainTag, 'an app-entry <script src=…js/main.js> tag').toBeTruthy();
      expect(mainTag!.index!).toBeGreaterThan(bootstrapTag!.index!);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

describe('beacio migrate — any iOS requestDevice branch', () => {
  /** Write a minimal static app whose js/main.js is `js`, migrate it, and return the migrated JS. */
  async function migrateJs(js: string[]): Promise<string> {
    const work = mkdtempSync(join(tmpdir(), 'migrate-ios-branch-'));
    try {
      mkdirSync(join(work, 'js'), { recursive: true });
      writeFileSync(
        join(work, 'index.html'),
        '<!DOCTYPE html>\n<html>\n<head><title>app</title></head>\n<body>\n  <script src="js/main.js"></script>\n</body>\n</html>\n',
      );
      writeFileSync(join(work, 'js', 'main.js'), js.join('\n'));
      await runMigrateIn(work);
      return read(join(work, 'js', 'main.js'));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  it('adds optionalServices to an inline user-agent iOS branch', async () => {
    const out = await migrateJs([
      'function onConnect(){',
      '  var options = {};',
      '  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) { options.filters = [{ namePrefix: "X" }]; options.acceptAllDevices = false; }',
      '  navigator.bluetooth.requestDevice(options);',
      '}',
      '',
    ]);
    expect(out).toMatch(/options\.acceptAllDevices = false; ;\/\* beacio: [^*]*\*\/options\.optionalServices=/);
  });

  it('leaves non-iOS branches alone (scenarios / radios / bios are not iOS tests)', async () => {
    const js = [
      'function onConnect(){',
      '  var options = {};',
      '  if (scenarios.length > 0) { options.filters = [{ namePrefix: "X" }]; }',
      '  if (radios.length) { options.acceptAllDevices = true; }',
      '  if (bios) { options.filters = []; }',
      '  navigator.bluetooth.requestDevice(options);',
      '}',
      '',
    ];
    expect(await migrateJs(js)).toBe(js.join('\n'));
  });

  it('leaves a negated `if (!isIOS())` branch alone (it is the non-iOS branch)', async () => {
    const js = [
      'function onConnect(){',
      '  var options = {};',
      '  if (!isIOS()) { options.filters = filters; }',
      '  else { options.filters = filters; options.acceptAllDevices = false; }',
      '  navigator.bluetooth.requestDevice(options);',
      '}',
      '',
    ];
    expect(await migrateJs(js)).toBe(js.join('\n'));
  });
});

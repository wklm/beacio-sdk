import { vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../../src/cli/commands/migrate.js';

/**
 * A synthetic UNPATCHED brownfield static app shared by the brownfield tests: a
 * jQuery-style page that loads js/main.js at body end, an `if (isIOS())` requestDevice
 * branch that sets filters + acceptAllDevices but no optionalServices, and a live
 * connect-gate alert that sends the user to a third-party browser. Running
 * `beacio migrate` on it gives the patched shape.
 */
export const CONNECT_GATE_ALERT =
  'alert("No Web Bluetooth in this browser. Open this page in Bluefy or another Web BLE browser to connect.");';

export const UNPATCHED_HTML = [
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
].join('\n');

export const UNPATCHED_JS = [
  'function isIOS(){return /iPhone|iPad/.test(navigator.userAgent);}',
  'var filters = [{ namePrefix: "X" }];',
  'function onConnect(){',
  '  if (navigator.bluetooth) {',
  '    var options = {};',
  '    if (isIOS()) { options.filters = filters; options.acceptAllDevices = false; }',
  '    navigator.bluetooth.requestDevice(options);',
  '  } else {',
  `    ${CONNECT_GATE_ALERT}`,
  '  }',
  '}',
  '',
].join('\n');

/** Write the unpatched app (index.html, js/jquery.js, js/main.js) into a fresh os.tmpdir() dir. */
export function writeUnpatchedApp(prefix: string): string {
  const work = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(work, 'js'), { recursive: true });
  writeFileSync(join(work, 'index.html'), UNPATCHED_HTML);
  writeFileSync(join(work, 'js', 'jquery.js'), '/* jQuery stand-in */\n');
  writeFileSync(join(work, 'js', 'main.js'), UNPATCHED_JS);
  return work;
}

/** Run `migrate` with cwd swapped to an app dir, restoring cwd + silencing logs. */
export async function runMigrateIn(dir: string, args: string[] = []): Promise<void> {
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

/** Write the unpatched app and migrate it in place: the patched shape. */
export async function writePatchedApp(prefix: string): Promise<string> {
  const work = writeUnpatchedApp(prefix);
  await runMigrateIn(work);
  return work;
}

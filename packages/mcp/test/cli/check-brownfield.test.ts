import { describe, expect, it, vi } from 'vitest';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from '../../src/cli/commands/check.js';

// SB-SDK-04 AC#5 (CLI side, RED): `beacio check` gains a brownfield/existing-app
// mode. On a patched app it all-passes; on the unpatched captured app it must
// fail the optionalServices + ordering checks (non-zero exit).

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const CAPTURED_DIR = join(REPO_ROOT, 'outreach', 'storz-bickel', 'captured');
const DEMO_APP_DIR = join(REPO_ROOT, 'outreach', 'storz-bickel', 'integration-demo', 'app');

/**
 * Run `check` with cwd swapped to `dir`, capturing the process.exit code (the CLI
 * signals failure via process.exit(1)) and silencing stdout. Returns the exit code
 * (0 when check never called process.exit).
 */
async function runCheckIn(dir: string, args: string[]): Promise<number> {
  const cwd = process.cwd();
  let exitCode = 0;
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`__exit_${exitCode}__`);
  }) as never);
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    process.chdir(dir);
    await check(args);
  } catch (e) {
    if (!(e instanceof Error) || !/^__exit_/.test(e.message)) throw e;
  } finally {
    process.chdir(cwd);
    exitSpy.mockRestore();
    logSpy.mockRestore();
  }
  return exitCode;
}

function fork(srcDir: string): string {
  const work = mkdtempSync(join(tmpdir(), 'sb-check-'));
  cpSync(srcDir, work, { recursive: true });
  return work;
}

describe('beacio check --brownfield (AC#5)', () => {
  it('passes (exit 0) on the patched demo fork', async () => {
    const work = fork(DEMO_APP_DIR);
    try {
      const code = await runCheckIn(work, ['--brownfield']);
      expect(code).toBe(0);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('fails (exit 1) on the unpatched captured app — missing iOS optionalServices + ordering', async () => {
    const work = fork(CAPTURED_DIR);
    try {
      const code = await runCheckIn(work, ['--brownfield']);
      expect(code).toBe(1);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

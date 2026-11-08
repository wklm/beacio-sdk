import { describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { check } from '../../src/cli/commands/check.js';
import { writePatchedApp, writeUnpatchedApp } from '../fixtures/brownfield-app.js';

// AC#5 (CLI side): `beacio check` has a brownfield/existing-app mode. On a patched
// app it all-passes; on the unpatched app it must fail the optionalServices +
// ordering checks (non-zero exit).

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

describe('beacio check --brownfield (AC#5)', () => {
  it('passes (exit 0) on a patched app', async () => {
    const work = await writePatchedApp('check-');
    try {
      const code = await runCheckIn(work, ['--brownfield']);
      expect(code).toBe(0);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('fails (exit 1) on the unpatched app — missing iOS optionalServices + ordering', async () => {
    const work = writeUnpatchedApp('check-');
    try {
      const code = await runCheckIn(work, ['--brownfield']);
      expect(code).toBe(1);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

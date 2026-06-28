import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { runInstallPlan, FRAMEWORKS } from '../src/tools/install-plan.js';
import { runVerifyIntegration } from '../src/tools/verify-integration.js';

/**
 * B#5 — agent-onboarding acceptance test.
 *
 * Proves the "fully agentic onboarding" contract deterministically and OFFLINE:
 * for every framework, the machine-actionable `install_plan.actions` an agent would
 * apply is mutually consistent with the `verify_integration` checklist the agent then
 * runs — i.e. applying the plan's polyfill bootstrap makes the verify check pass.
 *
 * Deliberately does NOT run real `npm install` / framework builds (network-flaky,
 * heavy) — that belongs in a separate integration job. Here we apply the file edits
 * to a temp fixture and execute the one offline-evaluable check (the bootstrap grep).
 */

const BOOTSTRAP_NEEDLE = /core\/auto|cdn\.beacio\.com/;

type FileEdit = { op: string; path: string; insert: string; position?: string };

function applyFileEdit(root: string, edit: FileEdit): void {
  const full = join(root, edit.path);
  mkdirSync(dirname(full), { recursive: true });
  // 'create' writes the file verbatim; 'insert' simulates an agent inserting the
  // snippet into an entry file (at the top, or inside <head> for HTML).
  const body =
    edit.op === 'create'
      ? edit.insert
      : edit.position === 'head'
        ? `<!doctype html>\n<html><head>\n${edit.insert}\n</head><body></body></html>\n`
        : `${edit.insert}\n/* existing entry code */\n`;
  writeFileSync(full, body, 'utf8');
}

function checkPasses(root: string, command: string): boolean {
  try {
    execSync(command, { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('agent-onboarding acceptance (install_plan ↔ verify_integration)', () => {
  it('every framework: plan emits a polyfill bootstrap the verify step checks for the same file', () => {
    for (const framework of FRAMEWORKS) {
      const plan = runInstallPlan({ framework, package_manager: 'npm' });
      const verify = runVerifyIntegration({ framework, package_manager: 'npm' });

      const bootstrap = plan.actions.files_to_edit.find((f) => BOOTSTRAP_NEEDLE.test(f.insert));
      expect(bootstrap, `${framework}: plan must include a polyfill bootstrap edit`).toBeDefined();

      const importCheck = verify.checks.find((c) => c.id === 'auto_import_present');
      expect(importCheck, `${framework}: verify must include auto_import_present`).toBeDefined();
      // Cross-consistency: the verify grep targets the exact file the plan bootstraps.
      expect(importCheck!.command).toContain(bootstrap!.path);
    }
  });

  it('every npm framework: install commands install the core package', () => {
    for (const framework of FRAMEWORKS) {
      if (framework === 'html') continue; // html loads the polyfill via the CDN <script>, no npm dep
      const plan = runInstallPlan({ framework, package_manager: 'npm' });
      expect(plan.actions.commands.join('\n')).toContain('@beacio/core');
    }
  });

  it('applying the plan bootstrap makes the verify auto_import_present check pass (offline e2e)', () => {
    for (const framework of FRAMEWORKS) {
      const root = mkdtempSync(join(tmpdir(), `beacio-${framework}-`));
      try {
        const plan = runInstallPlan({ framework, package_manager: 'npm' });
        for (const edit of plan.actions.files_to_edit as FileEdit[]) applyFileEdit(root, edit);

        const verify = runVerifyIntegration({ framework, package_manager: 'npm' });
        const importCheck = verify.checks.find((c) => c.id === 'auto_import_present')!;
        expect(
          checkPasses(root, importCheck.command),
          `${framework}: bootstrap grep should pass after applying the plan's file edits`,
        ).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });
});

/**
 * `npx beacio check` command
 * Verifies that Beacio is correctly integrated in the project
 */

import * as fs from 'fs';
import * as path from 'path';
import { detectFramework } from '../utils/framework-detect';
import {
  bootstrapBeforeGate,
  hasThirdPartyBrowserMessage,
  iosBranchHasOptionalServices,
  resolveRequestDeviceScripts,
} from './migrate';

async function grepProject(projectPath: string, pattern: RegExp): Promise<boolean> {
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.html'];
  const dirs = ['src', 'app', 'pages', 'components', 'lib', '.'];

  for (const dir of dirs) {
    const dirPath = path.join(projectPath, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = walkDir(dirPath, extensions);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      if (pattern.test(content)) return true;
    }
  }
  return false;
}

function walkDir(dir: string, extensions: string[], maxDepth = 4, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkDir(fullPath, extensions, maxDepth, depth + 1));
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  } catch {
    // Skip inaccessible directories
  }
  return files;
}

/**
 * SB-SDK-04 AC#5 — `beacio check --brownfield`: verify an ALREADY-WRITTEN Web Bluetooth app
 * was patched correctly for iOS Safari. Asserts the three brownfield invariants and exits 1 on
 * any failure (so an agent can gate on it). Passes on the patched demo fork; fails on the
 * unpatched captured app (missing iOS optionalServices + bootstrap-before-gate ordering).
 */
async function checkBrownfield(projectPath: string): Promise<void> {
  const issues: string[] = [];
  console.log('Checking Beacio brownfield integration...\n');

  const detection = detectFramework(projectPath);
  if (!detection.entryFile) {
    console.log('  [fail] No entry HTML found to verify (run from the app root).');
    process.exit(1);
    return;
  }
  const htmlPath = path.join(projectPath, detection.entryFile);
  const htmlDir = path.dirname(htmlPath);
  const html = fs.readFileSync(htmlPath, 'utf-8');

  // (ii) bootstrap textually before the first navigator.bluetooth gate.
  if (bootstrapBeforeGate(html)) {
    console.log('  [pass] beacio bootstrap loads before the app entry (parse-time gate safe)');
  } else {
    issues.push('Bootstrap not found before the first app-entry script in ' + detection.entryFile);
  }

  // (i) optionalServices on the iOS branch + (iii) no third-party-browser message, across the
  // requestDevice script(s) the entry HTML references.
  const scripts = resolveRequestDeviceScripts(projectPath, htmlDir, html);
  const js = scripts.map((p) => fs.readFileSync(p, 'utf-8')).join('\n');

  if (iosBranchHasOptionalServices(js)) {
    console.log('  [pass] iOS requestDevice branch declares optionalServices');
  } else {
    issues.push('iOS requestDevice branch is missing optionalServices');
  }

  if (!hasThirdPartyBrowserMessage(js)) {
    console.log('  [pass] no active-path third-party-browser ("Bluefy / Web BLE browser") message');
  } else {
    issues.push('An active-path "Bluefy / Web BLE browser" message is still present');
  }

  console.log();
  if (issues.length === 0) {
    console.log('All brownfield checks passed. Ready for device smoke on a real iPhone.');
  } else {
    console.log(`Found ${issues.length} issue(s):`);
    issues.forEach((i) => console.log(`  [fail] ${i}`));
    process.exit(1);
  }
}

export async function check(args: string[]): Promise<void> {
  const projectPath = process.cwd();
  const issues: string[] = [];

  if (args.includes('--brownfield')) {
    await checkBrownfield(projectPath);
    return;
  }

  console.log('Checking Beacio integration...\n');

  // 1. Check if @beacio/detect is in dependencies
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (!allDeps['@beacio/detect']) {
      issues.push('Package @beacio/detect not found in dependencies');
    } else {
      console.log('  [pass] @beacio/detect found in dependencies');
    }
  } else {
    // Check for CDN usage in HTML files. `beacio init` (html) writes the
    // canonical M7-pinned `cdn.beacio.com/@beacio/core@1.0.0/dist/auto.mjs`
    // ESM import tag (CDN-01 fix — matches `beacio_install_plan`'s
    // CANONICAL_CDN_BOOTSTRAP_URL + SB-INF-06). The cdn Worker 400s partial
    // versions (`@1`, `@1.0`), so this regex requires a FULL three-part
    // semver — partial refs must NOT be accepted here. `beacio.com/beacio.js`
    // (the pre-rebrand apex shortener) and `ioswebble.com/detect` are kept
    // as explicit LEGACY alternatives (the latter is a deliberately-preserved
    // 301 host — do not remove).
    const hasCdn = await grepProject(
      projectPath,
      /cdn\.beacio\.com\/@beacio\/core@\d+\.\d+\.\d+\/dist\/(auto\.mjs|browser-auto\.global\.js)|beacio\.com\/(beacio|detect)|ioswebble\.com\/detect/
    );
    if (!hasCdn) {
      issues.push('No @beacio/detect package or CDN script found');
    } else {
      console.log('  [pass] CDN script tag found');
    }
  }

  // 2. Search for the initialization call in source files. The html path of
  // `beacio init` injects the canonical `cdn.beacio.com/@beacio/core@1.0.0/dist/auto.mjs`
  // ESM import (no package import / no dep), so that URL has to count as
  // initialization too (CDN-02 fix — the pre-fix regex required `beacio.com/`
  // immediately followed by `beacio` or `detect`; the canonical URL has
  // `@beacio/` after the slash, so neither alternation matched). Full-semver
  // required (partial `@1`/`@1.0` rejected). `beacio.com/beacio.js` (legacy
  // apex shortener) and `ioswebble.com/detect` (preserved 301 host) remain
  // explicit LEGACY alternatives — do not remove.
  const hasInit = await grepProject(
    projectPath,
    /@beacio\/detect|cdn\.beacio\.com\/@beacio\/core@\d+\.\d+\.\d+\/dist\/(auto\.mjs|browser-auto\.global\.js)|beacio\.com\/(beacio|detect)|ioswebble\.com\/detect|BeacioProvider|initBeacio/
  );
  if (!hasInit) {
    issues.push('No Beacio initialization found in source files');
  } else {
    console.log('  [pass] Beacio initialization found in source files');
  }

  console.log();

  if (issues.length === 0) {
    console.log('All checks passed. Beacio integration detected. Ready.');
  } else {
    console.log(`Found ${issues.length} issue(s):`);
    issues.forEach((i) => console.log(`  [fail] ${i}`));
    process.exit(1);
  }
}

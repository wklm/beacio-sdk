#!/usr/bin/env node
// B1 recurrence pin (S5-CONDITIONS.md, blocker B1) — the CANONICAL fingerprint of the
// inputs `npm run build -w packages/core` compiles into dist/.
//
// WHY THIS EXISTS: earlier checks measured a bundle / SRI digest against a
// STALE dist — packages/core/src had changed with no rebuild — and recorded a
// born-stale allowlist adjudication from what they saw (the "esbuild inlines the
// factory" misreading). dist/integrity.json only hashed the OUTPUT bundles, so nothing
// could say "this dist was built from THAT src". This module hashes the build INPUTS;
// generate-integrity.mjs records the digest at build time, and
// scripts/ci/check-error-conditions.mjs recomputes it as a pre-flight, refusing to
// adjudicate generated artifacts when src has moved past the recorded build.
//
// HONEST LIMITS (recorded, not hidden): the fingerprint covers packages/core/src/**
// and the three tsup configs. It does NOT cover toolchain drift (an esbuild/tsup
// version bump that changes minified output without a src edit) — that direction is
// owned by the rebuild-and-diff guard (sri-integrity-table.test.ts),
// which the gate runs downstream of its build:packages DAG root.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The build-input files, beyond src/**, that shape the dist bundles. */
export const FINGERPRINT_CONFIG_FILES = Object.freeze([
  'tsup.config.ts',
  'tsup.browser.config.ts',
  'tsup.browser-auto.config.ts',
]);

/** Every file under `absDir`, as sorted forward-slash paths relative to `relPrefix`. */
function listFilesSorted(absDir, relPrefix) {
  const out = [];
  const walk = (abs, rel) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const entryAbs = join(abs, entry.name);
      const entryRel = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(entryAbs, entryRel);
      else if (entry.isFile()) out.push({ abs: entryAbs, rel: entryRel });
    }
  };
  walk(absDir, relPrefix);
  out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return out;
}

/**
 * sha384 over a deterministic serialization (sorted rel path + NUL + bytes + NUL) of
 * packages/core's build inputs. Pure: `coreRootAbs` is injectable so the guard's unit
 * tests drive synthetic trees.
 * @param {string} coreRootAbs absolute path of the packages/core directory
 * @returns {string} base64 sha384 digest
 */
export function computeCoreSourceFingerprint(coreRootAbs) {
  const hash = createHash('sha384');
  for (const file of listFilesSorted(join(coreRootAbs, 'src'), 'src')) {
    hash.update(file.rel);
    hash.update('\0');
    hash.update(readFileSync(file.abs));
    hash.update('\0');
  }
  for (const rel of FINGERPRINT_CONFIG_FILES) {
    const abs = join(coreRootAbs, rel);
    hash.update(rel);
    hash.update('\0');
    hash.update(existsSync(abs) ? readFileSync(abs) : '<absent>');
    hash.update('\0');
  }
  return hash.digest('base64');
}

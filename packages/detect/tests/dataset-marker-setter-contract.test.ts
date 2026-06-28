/**
 * Durable static guard for SB-SDK-25.
 *
 * SB-SDK-25 (a WF2/CONF-30 carry-over) asked us to EITHER wire an extension-side
 * setter for the @beacio/detect dataset handshake markers OR remove the dead
 * read-path. On the current tree the FIRST branch of that acceptance criterion is
 * already satisfied — the WF2 "dead read-path" premise is FALSE:
 *
 *   - src/extension/content-full.ts:598 sets
 *       document.documentElement.dataset.beacioInstalled = 'true'
 *     at document_start (the "installed" presence marker — see the AIDEV-NOTE at
 *     content-full.ts:595-597 documenting the deliberate two-marker convention so
 *     the CDN script + setup-verify can detect the extension even on
 *     non-alwaysAllow origins where BLE is not activated).
 *   - src/extension/content-full.ts:470 sets
 *       document.documentElement.dataset.beacioExtension = 'true'
 *     inside activateBLE() (the "active" marker).
 *
 * Both ship in the BUILT artifact (`Shared (Extension)/Resources/content.js`
 * carries exactly one `beacioInstalled="true"` and one `beacioExtension="true"`).
 * The setters predate the rebrand (they were webbleInstalled/webbleExtension and
 * commit 42fc370e merely renamed them to beacio*); the WF2 snapshot grepped the
 * wrong term and so missed them. The evidence line numbers in the fix-queue
 * (detect.ts:30-36, injected-full.ts) are likewise stale: the SB-SDK-12 refactor
 * moved the dataset READS out of detect.ts into install-state.ts's
 * hasInstallMarker()/hasActiveMarker(), and injected-full.ts sets
 * navigator.beacio/window.__beacio — a DIFFERENT handshake channel, not these
 * dataset markers.
 *
 * The read-path is therefore LIVE and depended-upon (website-src/{setup-verify,
 * demo,home}.js, examples/web-scanner/*, and the S&B vendored bundles all key off
 * this convention), so removing it would be wrong. The one obligation SB-SDK-25
 * left genuinely unmet is the DURABLE GUARD: nothing pinned the setter<->reader
 * pairing, so a future refactor that deletes a setter (or adds an unbacked dataset
 * read) could silently re-create the exact dead-read this issue warned about.
 *
 * This test is that guard. It derives the set of dataset handshake markers
 * install-state.ts READS, then asserts every one has a matching SETTER in the
 * content script. It does NOT change behavior — production already passes — and is
 * tracked as pre-existing dead-path cleanup, NOT a #178 blocker (AC2).
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const INSTALL_STATE_SRC = path.resolve(__dirname, '..', 'src', 'install-state.ts');
// The content script lives in the EXTENSION source tree (repo root src/extension),
// four levels up from packages/detect/tests.
const CONTENT_SCRIPT_SRC = path.resolve(__dirname, '..', '..', '..', 'src', 'extension', 'content-full.ts');

/**
 * A dataset handshake READ in install-state.ts:
 *   document.documentElement.dataset.<MARKER> === 'true'
 * Capture <MARKER>. This is the set of markers the SDK relies on the extension to
 * advertise; each one MUST have a corresponding setter.
 */
const DATASET_READ = /document\.documentElement\.dataset\.(\w+)\s*===\s*'true'/g;

/** Collect every distinct dataset marker name install-state.ts reads. */
function readMarkers(): string[] {
  const src = readFileSync(INSTALL_STATE_SRC, 'utf8');
  const names = new Set<string>();
  for (const m of src.matchAll(DATASET_READ)) {
    names.add(m[1]);
  }
  return [...names].sort();
}

/**
 * Strip `//` line comments so a setter that was DISABLED by commenting it out is
 * not mistaken for a live one. A commented-out setter never executes — it is
 * functionally the exact dead read SB-SDK-25 guards against — so the contract must
 * treat it as absent. (Block comments are not used around these one-line setters in
 * content-full.ts; line-comment stripping is sufficient and avoids a brittle full
 * JS tokenizer. We deliberately do NOT strip inside string literals because the
 * setters never embed a `//` before the assignment.)
 */
function stripLineComments(src: string): string {
  return src
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

/**
 * A dataset SETTER in the content script:
 *   <something>.dataset.<MARKER> = 'true'
 * (content-full.ts writes via document.documentElement.dataset.<MARKER>; matching
 * the `.dataset.<MARKER> = 'true'` tail keeps the assertion robust to the host
 * expression.) Returns true if a LIVE (non-commented) setter for `marker` is
 * present.
 */
function hasSetterFor(contentScript: string, marker: string): boolean {
  const setter = new RegExp(`\\.dataset\\.${marker}\\s*=\\s*'true'`);
  return setter.test(stripLineComments(contentScript));
}

describe('SB-SDK-25: every @beacio/detect dataset handshake read has an extension setter', () => {
  it('install-state.ts reads the documented two-marker handshake (read-path is not gutted)', () => {
    // Guards the OTHER direction: if a refactor silently drops BOTH reads, the
    // pairing assertion below would vacuously pass — so pin the meaning here.
    expect(readMarkers()).toEqual(['beacioExtension', 'beacioInstalled']);
  });

  it('every dataset marker install-state.ts reads is set by the content script', () => {
    const contentScript = readFileSync(CONTENT_SCRIPT_SRC, 'utf8');
    const unbacked = readMarkers().filter((marker) => !hasSetterFor(contentScript, marker));

    // RED if any setter is deleted (re-creating the dead read SB-SDK-25 warns
    // about) or a new unbacked dataset read is added to install-state.ts.
    expect(unbacked).toEqual([]);
  });

  it('treats a commented-out setter as absent (a disabled setter is the dead read)', () => {
    // A setter that is commented out never executes, so it is functionally the
    // same dead read-path SB-SDK-25 warns about. The first RED-proof pass for this
    // issue showed a naive text-match would be fooled by a `// …dataset.x = 'true'`
    // line; pin the stronger behavior so the guard cannot be defeated by disabling
    // (rather than deleting) a setter.
    const live = `document.documentElement.dataset.beacioInstalled = 'true';`;
    const commented = `// document.documentElement.dataset.beacioInstalled = 'true';`;
    expect(hasSetterFor(live, 'beacioInstalled')).toBe(true);
    expect(hasSetterFor(commented, 'beacioInstalled')).toBe(false);
  });
});

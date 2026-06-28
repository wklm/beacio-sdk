/**
 * `npx beacio migrate` command (SB-SDK-04)
 *
 * BROWNFIELD counterpart of `beacio init`. Where `init` scaffolds a greenfield app,
 * `migrate` performs the three concrete edits that make an ALREADY-WORKING Web Bluetooth
 * app (the Storz & Bickel shape: a vendored-jQuery static-HTML site) work on iOS Safari:
 *
 *   1. insert the canonical beacio bootstrap into <head> BEFORE the first navigator.bluetooth
 *      read (a static app reads it synchronously, so a body-end/deferred insert loses the
 *      parse-time gate race — this is exactly what `init`'s `</body>` insert gets wrong);
 *   2. add `optionalServices` onto the existing `if (userAgent_iOS())` requestDevice branch;
 *   3. swap the active-path "use Bluefy / Web BLE browser" message for the beacio
 *      install/enable affordance.
 *
 * It is IDEMPOTENT by construction (AC#3): each edit is gated on the SPECIFIC artifact it
 * introduces (the canonical bootstrap filename, an iOS-branch optionalServices, the absence
 * of a third-party-browser alert) — never the brittle `content.includes('beacio')` substring
 * `init` uses — so a second run is a byte-identical no-op. The transform mirrors the MCP
 * `beacio_patch_existing_app` action; the two emit the same edits. It reuses the ONE canonical
 * bootstrap artifact documented in the webble quickstart — no fourth bootstrap variant.
 */

import * as fs from 'fs';
import * as path from 'path';
import { detectFramework } from '../utils/framework-detect';

/** The ONE canonical classic bootstrap artifact (webble quickstart §2 / onboarding-manifest cdn). */
export const CANONICAL_BOOTSTRAP_URL =
  'https://cdn.beacio.com/@beacio/core@1.0.0/dist/browser-auto.global.js';

/** Stable marker used for idempotency — the canonical bootstrap artifact filename. */
const BOOTSTRAP_MARKER = 'browser-auto.global.js';

const BOOTSTRAP_TAG =
  `  <!-- beacio: @beacio/core polyfill (the canonical classic browser-auto.global.js build) loaded FIRST — ` +
  `before the app entry — so navigator.bluetooth is patched before any parse-time \`if (navigator.bluetooth)\` ` +
  `gate runs. Self-no-ops on Chrome/Android and on iOS with the extension active. Vendor (self-host) this file ` +
  `for a security-sensitive deploy. -->\n` +
  `  <script src="${CANONICAL_BOOTSTRAP_URL}" data-operator-name="this app"></script>`;

/** optionalServices spliced into the iOS branch — app-agnostic (derives from the app's own filters). */
const OPTIONAL_SERVICES_SPLICE =
  ';/* beacio: declare every service the app filters on as optional so iOS getPrimaryService() is permitted */' +
  'options.optionalServices=(options.optionalServices||[]).concat((options.filters||[]).flatMap(function(f){return f.services||[]}))';

/** The beacio onboarding affordance that replaces the third-party-browser message. */
const THIRD_PARTY_BROWSER_REPLACEMENT =
  'if(typeof iOS_BLEnotWorking==="function"?iOS_BLEnotWorking():/iPhone|iPad|iPod/i.test(navigator.userAgent)){' +
  '/* beacio: route to the beacio install/enable onboarding instead of a third-party browser */' +
  'try{window.beacioDetect&&window.beacioDetect.showInstallBanner&&window.beacioDetect.showInstallBanner({operatorName:document.title||"this app"});}catch(e){}}';

/** Match the active-path third-party-browser message (optionally guarded by iOS_BLEnotWorking()). */
const THIRD_PARTY_BROWSER_RE =
  /(?:if\s*\(\s*iOS_BLEnotWorking\(\)\s*\)\s*)?alert\(\s*["'][^"']*(?:Bluefy|Web BLE browser)[^"']*["']\s*\)\s*;?/;

// --- pure transforms (exported for unit reuse; the CLI just orchestrates them) ---------

/** Insert the canonical bootstrap into <head>; idempotent on the bootstrap artifact filename. */
export function injectBootstrap(html: string): string {
  if (html.includes(BOOTSTRAP_MARKER)) return html;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}\n${BOOTSTRAP_TAG}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}\n<head>\n${BOOTSTRAP_TAG}\n</head>`);
  return `${BOOTSTRAP_TAG}\n${html}`;
}

/**
 * Find the `if (userAgent_iOS()) { … }` branch that configures the requestDevice `options`
 * (not some other userAgent_iOS() block) by brace-matching — robust to nested filter object
 * literals and to both minified and pretty source.
 */
function findIosOptionsBranch(src: string): { full: string; body: string } | null {
  const re = /if\s*\(\s*userAgent_iOS\(\)\s*\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const openBrace = m.index + m[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = openBrace; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) continue;
    const body = src.slice(openBrace + 1, end);
    if (/options\.(?:filters|acceptAllDevices)/.test(body)) {
      return { full: src.slice(m.index, end + 1), body };
    }
  }
  return null;
}

/** Add optionalServices to the iOS requestDevice branch; idempotent (no-op if already present). */
export function injectOptionalServices(js: string): string {
  const branch = findIosOptionsBranch(js);
  if (!branch || /optionalServices/.test(branch.body)) return js;
  const open = branch.full.match(/if\s*\(\s*userAgent_iOS\(\)\s*\)\s*\{/)![0];
  const body = branch.full.slice(open.length, branch.full.length - 1);
  const replacement = `${open}${body}${OPTIONAL_SERVICES_SPLICE}}`;
  return js.replace(branch.full, replacement);
}

/** Swap the third-party-browser message for the beacio affordance; idempotent. */
export function swapThirdPartyBrowserMessage(js: string): string {
  if (!THIRD_PARTY_BROWSER_RE.test(js)) return js;
  return js.replace(THIRD_PARTY_BROWSER_RE, THIRD_PARTY_BROWSER_REPLACEMENT);
}

// --- brownfield verification predicates (shared with `beacio check --brownfield`) -------

/** True when the iOS requestDevice branch declares optionalServices inside its own braces. */
export function iosBranchHasOptionalServices(js: string): boolean {
  const branch = findIosOptionsBranch(js);
  return branch !== null && /optionalServices/.test(branch.body);
}

/**
 * True when a live active-path third-party-browser CONNECT-GATE alert remains — the message that
 * dead-ends the Web Bluetooth connect path on iOS ("Web Bluetooth is not supported … use Bluefy /
 * Web BLE browser"), optionally guarded by `iOS_BLEnotWorking()`. This is the message
 * `swapThirdPartyBrowserMessage` replaces.
 *
 * It is deliberately SCOPED to the connect gate (matching the MCP `no_third_party_browser_string`
 * perl check, which reads only the requestDevice module): a `namePrefix`-only `alert(… Bluefy …)`
 * inside an unrelated DEVICE-CAPABILITY handler — e.g. the VOLCANO firmware-update notice guarded by
 * `browserSupportsWriteWithoutResponse == false`, which is dead on beacio (writeWithoutResponse works
 * there) and never on the active connect path — is NOT the gate and must not trip this. A broad
 * `alert\(…Bluefy…\)` match would false-positive on those legitimate capability messages.
 */
export function hasThirdPartyBrowserMessage(js: string): boolean {
  return /(?:iOS_BLEnotWorking\(\)\s*\)\s*)?alert\(\s*["'][^"']*(?:Web BLE browser|Web Bluetooth[^"']*Bluefy|Bluefy[^"']*Web Bluetooth)[^"']*["']/.test(
    js,
  );
}

/**
 * True when a beacio bootstrap <script src> tag (the canonical browser-auto.global.js, or a
 * vendored beacio-core-auto.js) appears before the first app-entry <script src="js/…"> tag in
 * the entry HTML — i.e. navigator.bluetooth is patched before the parse-time gate runs.
 */
export function bootstrapBeforeGate(html: string): boolean {
  const bootMatch = html.match(
    /<script\b[^>]*\bsrc\s*=\s*["'][^"']*(?:browser-auto\.global\.js|beacio-core-auto\.js)["'][^>]*>/i,
  );
  if (!bootMatch) return false;
  const gateMatch = html.match(/<script\b[^>]*\bsrc\s*=\s*["']js\/(?!vendor\/beacio)[^"']*["']/i);
  const bootIdx = bootMatch.index ?? -1;
  const gateIdx = gateMatch?.index ?? -1;
  return bootIdx >= 0 && (gateIdx < 0 || bootIdx < gateIdx);
}

/** Apply all JS-side transforms. */
export function migrateJs(js: string): string {
  return swapThirdPartyBrowserMessage(injectOptionalServices(js));
}

// --- file resolution + CLI orchestration ----------------------------------------------

/** Local <script src="…"> JS files referenced by the entry HTML, in document order. */
function referencedLocalScripts(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const src = m[1];
    if (/^https?:\/\//i.test(src) || src.startsWith('//')) continue; // external
    if (src.includes(BOOTSTRAP_MARKER)) continue; // the bootstrap itself
    if (src.endsWith('.js')) out.push(src);
  }
  return out;
}

/**
 * Resolve the JS file(s) that run the requestDevice flow: any locally-referenced script whose
 * contents read navigator.bluetooth / userAgent_iOS() / a third-party-browser alert. Falls back
 * to a conventional js/main.js when the HTML references nothing patchable.
 */
export function resolveRequestDeviceScripts(projectPath: string, htmlDir: string, html: string): string[] {
  const hits: string[] = [];
  for (const rel of referencedLocalScripts(html)) {
    const abs = path.resolve(htmlDir, rel);
    if (!abs.startsWith(projectPath)) continue; // stay inside the project
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf-8');
    if (/navigator\.bluetooth|userAgent_iOS\(\)|Bluefy|Web BLE browser/.test(text)) {
      hits.push(abs);
    }
  }
  if (hits.length === 0) {
    const conventional = path.join(htmlDir, 'js', 'main.js');
    if (fs.existsSync(conventional)) hits.push(conventional);
  }
  return hits;
}

export async function migrate(_args: string[]): Promise<void> {
  const projectPath = process.cwd();

  console.log('Detecting framework...');
  const detection = detectFramework(projectPath);
  console.log(`  Framework: ${detection.framework}`);
  console.log(`  Entry file: ${detection.entryFile || '(not found)'}`);
  console.log();

  if (!detection.entryFile) {
    console.log('No entry HTML found — nothing to migrate. `beacio migrate` targets an existing');
    console.log('static/HTML Web Bluetooth app (run it from the app root).');
    return;
  }

  const htmlPath = path.join(projectPath, detection.entryFile);
  const htmlDir = path.dirname(htmlPath);

  // 1) Bootstrap into <head> of the entry HTML (idempotent).
  const htmlBefore = fs.readFileSync(htmlPath, 'utf-8');
  const htmlAfter = injectBootstrap(htmlBefore);
  if (htmlAfter !== htmlBefore) {
    fs.writeFileSync(htmlPath, htmlAfter);
    console.log(`Inserted the beacio bootstrap into <head> of ${detection.entryFile}.`);
  } else {
    console.log('Bootstrap already present — skipping (idempotent).');
  }

  // 2)+3) optionalServices + message swap in the requestDevice JS (idempotent).
  const scripts = resolveRequestDeviceScripts(projectPath, htmlDir, htmlAfter);
  if (scripts.length === 0) {
    console.log('No requestDevice() script found to patch (looked for navigator.bluetooth / userAgent_iOS()).');
  }
  for (const abs of scripts) {
    const before = fs.readFileSync(abs, 'utf-8');
    const after = migrateJs(before);
    const relName = path.relative(projectPath, abs);
    if (after !== before) {
      fs.writeFileSync(abs, after);
      console.log(`Patched ${relName}: iOS optionalServices + install/enable affordance.`);
    } else {
      console.log(`${relName} already migrated — skipping (idempotent).`);
    }
  }

  console.log();
  console.log('Migration complete. Next: `npx beacio check --brownfield`, then device-smoke on a');
  console.log('real iPhone with the beacio Safari extension enabled (the one irreducible human step).');
}

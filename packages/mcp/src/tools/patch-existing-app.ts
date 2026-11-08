import { generateAttributionToken } from '../attribution.js';
import { docsUrl, ToolInputError, type ToolDefinition } from './_common.js';

/**
 * `beacio_patch_existing_app`: the BROWNFIELD counterpart to
 * `beacio_install_plan`. Every other onboarding tool scaffolds a GREENFIELD app;
 * this one takes an app that ALREADY has a working (Chrome/Android) Web Bluetooth
 * flow — e.g. a vendored-jQuery static-HTML site — and returns
 * concrete, machine-actionable FileEdits that make it work on iOS Safari via beacio:
 *
 *   (a) the polyfill bootstrap inserted into <head> BEFORE the first script that
 *       reads navigator.bluetooth (a static app reads it synchronously, so a
 *       body-end / deferred-module insert loses the parse-time gate race);
 *   (b) `optionalServices` added onto the existing iOS `if (…)` requestDevice
 *       branch, such as `if (isIOS())` (iOS uses namePrefix-only filters, so every service
 *       later reached via getPrimaryService() must be declared optional or
 *       Safari/beacio throws a SecurityError);
 *   (c) the active-path message sending the user to Bluefy or another Web BLE
 *       browser, swapped for the beacio install/enable affordance.
 *
 * It emits edits ONLY — it never writes files (the `beacio migrate` CLI applies the
 * same transform to disk, idempotently). The edits are derived from the SUBMITTED
 * source text, so `find` strings are exact literals an agent can apply with a plain
 * string replace and zero judgment. The bootstrap reuses the ONE canonical classic
 * `browser-auto.global.js` artifact documented in the webble quickstart — it
 * introduces no fourth bootstrap variant (AC#6).
 */

/** The ONE canonical classic bootstrap artifact (webble quickstart §2 / onboarding-manifest cdn). */
export const CANONICAL_BOOTSTRAP_URL =
  'https://cdn.beacio.com/@beacio/core@2.1.0/dist/browser-auto.global.js';

type FileEditOp = 'insert' | 'create' | 'replace';

interface FileEdit {
  /**
   * 'insert' adds `insert` into an existing file (`position` says where, default top);
   * 'replace' swaps the first occurrence of `find` for `insert`;
   * 'create' writes a new file whose full contents are `insert`.
   */
  op: FileEditOp;
  path: string;
  position?: 'top' | 'head' | 'body-end';
  /** For op==='replace': the exact substring to swap (derived from the submitted source). */
  find?: string;
  /** For op==='insert' without a position: insert AFTER the first occurrence of this anchor. */
  anchor?: string;
  insert: string;
  note?: string;
}

interface PatchExistingAppInput {
  /** Full text of the app's entry HTML (e.g. the served index.html). */
  entry_html: string;
  /** Full text of the JS module that runs the requestDevice() flow. */
  entry_js: string;
  /** Repo-relative path of the entry HTML the edits target. */
  html_path: string;
  /** Repo-relative path of the JS module the edits target. */
  js_path: string;
}

interface PatchExistingAppOutput {
  files_to_edit: FileEdit[];
  /** Echoes the ONE canonical bootstrap artifact used (AC#6 "no fourth variant"). */
  canonical_bootstrap_url: string;
  /** Per-edit human notes for an agent applying the plan; parallels files_to_edit. */
  steps: string[];
  attribution_token: string;
  source_url: string;
}

// --- pure transform helpers (single-sourced by the `beacio migrate` CLI at src/cli/commands/migrate.ts) ---------

const BOOTSTRAP_COMMENT =
  '<!-- beacio: @beacio/core polyfill (the canonical classic browser-auto.global.js build) loaded FIRST — before jQuery and the app entry — so navigator.bluetooth is patched before any parse-time `if (navigator.bluetooth)` gate runs. Self-no-ops on Chrome/Android and on iOS with the extension active. Vendor (self-host) this file for a security-sensitive deploy. -->';

/** The bootstrap <head> edit: the canonical classic tag, no fourth variant. */
export function bootstrapEdit(htmlPath: string): FileEdit {
  return {
    op: 'insert',
    path: htmlPath,
    position: 'head',
    insert: `  ${BOOTSTRAP_COMMENT}\n  <script src="${CANONICAL_BOOTSTRAP_URL}" data-operator-name="this app"></script>`,
    note: 'Insert into <head> before any other script. For a static HTML app the bootstrap MUST be a classic (non-module) tag in <head>, not a body-end / deferred insert, or it loses the race with a parse-time navigator.bluetooth gate.',
  };
}

/**
 * An iOS test inside an `if (…)` condition, as a plain regex source: an `ios` / `iOS` /
 * `IOS` / `Ios` word part (isIOS(), is_ios, IS_IOS, platform === 'ios') or an iPhone /
 * iPad / iPod token (/iPhone|iPad/.test(navigator.userAgent)). Word-part boundaries keep
 * `bios`, `radios` and `scenarios` out. Plain syntax only (no quote, `$` or unescaped `/`),
 * so the same source is reused verbatim by the perl `ios_optional_services` check.
 */
export const IOS_CONDITION_SOURCE =
  '(?:(?<![A-Za-z])ios(?![a-z])|(?<![A-Z])(?:iOS|IOS|Ios)(?![a-z])|i(?:Phone|Pad|Pod))';

/**
 * A NEGATED iOS test, as a plain regex source in the same syntax: a `!` in front of the
 * identifier, call or regex literal that holds the iOS token (`!isIOS()`, `!(isIOS())`,
 * `!/iPhone/.test(ua)`, `!ua.match(/iPad/)`), or a `!=` / `!==` comparison against an
 * iOS literal (`platform !== 'ios'`, `'ios' != os`). A condition that contains one is
 * NOT the iOS branch, even when it also holds a plain iOS token (fail-safe: no edit).
 */
export const IOS_NEGATED_SOURCE =
  `(?:![\\s(]*[\\w.\\x24(]*(?:\\/[^\\/{};]*)?${IOS_CONDITION_SOURCE}` +
  `|!==?\\s*\\W?${IOS_CONDITION_SOURCE}` +
  `|${IOS_CONDITION_SOURCE}\\W?\\s*!=)`;

const IOS_CONDITION_RE = new RegExp(IOS_CONDITION_SOURCE);
const IOS_NEGATED_RE = new RegExp(IOS_NEGATED_SOURCE);

/** True when an `if (…)` condition tests for iOS and does not negate that test. */
function isIosCondition(condition: string): boolean {
  return IOS_CONDITION_RE.test(condition) && !IOS_NEGATED_RE.test(condition);
}

/**
 * Parse an `if (…) {` header starting at `at` (which must point at `if`). The condition
 * is matched with balanced parentheses; a `{`, `}` or `;` inside it rejects the header
 * (the same bound the perl check uses). Returns the condition text and the index of the
 * opening `{`, or null.
 */
function ifHeaderAt(src: string, at: number): { condition: string; openBrace: number } | null {
  const head = /^if\s*\(/.exec(src.slice(at, at + 64));
  if (!head) return null;
  const condStart = at + head[0].length;
  let depth = 1;
  let i = condStart;
  for (; i < src.length && depth > 0; i++) {
    const ch = src[i];
    if (ch === '{' || ch === '}' || ch === ';') return null;
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  if (depth !== 0) return null;
  const condition = src.slice(condStart, i - 1);
  const rest = /^\s*\{/.exec(src.slice(i, i + 64));
  if (!rest) return null;
  return { condition, openBrace: i + rest[0].length - 1 };
}

/**
 * Locate the iOS `if (…) { … }` branch (any `if` whose condition tests for iOS, such as
 * `if (isIOS())` or an inline user-agent test, and does not negate it: `if (!isIOS())`
 * is skipped) that configures the requestDevice
 * `options` (filters / acceptAllDevices) — NOT some other iOS block — by brace-matching
 * so it is robust to nested object literals in the filter list and to both minified and
 * pretty-printed source. Returns null when no such branch exists.
 */
export function findIosOptionsBranch(
  src: string,
): { full: string; body: string; start: number; end: number } | null {
  const re = /\bif\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const header = ifHeaderAt(src, m.index);
    if (!header || !isIosCondition(header.condition)) continue;
    const start = m.index;
    const openBrace = header.openBrace;
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
      return { full: src.slice(start, end + 1), body, start, end };
    }
  }
  return null;
}

/**
 * The optionalServices line spliced into the iOS branch. App-AGNOSTIC: it declares
 * every service the app already filters on (across `options.filters`) as optional,
 * which is exactly the coverage iOS getPrimaryService() requires. It carries no
 * app-specific UUIDs, so it is safe to ship in this package and correct for any
 * brownfield app whose iOS branch reuses its filter `services`. (For an app whose
 * iOS branch uses namePrefix-only filters, the agent/operator widens this
 * to the explicit service UUIDs. That is the documented superset the AC permits.)
 */
const OPTIONAL_SERVICES_SPLICE =
  ';/* beacio: declare every service the app filters on as optional so iOS getPrimaryService() is permitted */' +
  'options.optionalServices=(options.optionalServices||[]).concat((options.filters||[]).flatMap(function(f){return f.services||[]}))';

/** Build the replacement text for an iOS options branch that lacks optionalServices. */
export function iosBranchWithOptionalServices(full: string): string {
  const header = ifHeaderAt(full, 0);
  if (!header || !isIosCondition(header.condition)) return full;
  const open = full.slice(0, header.openBrace + 1);
  const body = full.slice(open.length, full.length - 1); // strip leading `if(..){` and trailing `}`
  return `${open}${body}${OPTIONAL_SERVICES_SPLICE}}`;
}

/**
 * Match the active-path third-party-browser message `alert("… Bluefy / Web BLE
 * browser …")`. Used to detect AND to swap it; a guard in front of the alert stays in
 * place. Single (non-global) so callers test/replace the first hit.
 */
export const THIRD_PARTY_BROWSER_RE =
  /alert\(\s*["'][^"']*(?:Bluefy|Web BLE browser)[^"']*["']\s*\)\s*;?/;

/** The beacio onboarding affordance that replaces the third-party-browser message. */
export const THIRD_PARTY_BROWSER_REPLACEMENT =
  'if(/iPhone|iPad|iPod/i.test(navigator.userAgent)){' +
  '/* beacio: route to the beacio install/enable onboarding instead of a third-party browser */' +
  'try{window.beacioDetect&&window.beacioDetect.showInstallBanner&&window.beacioDetect.showInstallBanner({operatorName:document.title||"this app"});}catch(e){}}';

export function runPatchExistingApp(input: PatchExistingAppInput): PatchExistingAppOutput {
  if (typeof input.entry_html !== 'string' || input.entry_html.length === 0) {
    throw new ToolInputError('entry_html must be the non-empty text of the app entry HTML.');
  }
  if (typeof input.entry_js !== 'string' || input.entry_js.length === 0) {
    throw new ToolInputError('entry_js must be the non-empty text of the requestDevice() JS module.');
  }
  if (!input.html_path) throw new ToolInputError('html_path must be the repo-relative entry HTML path.');
  if (!input.js_path) throw new ToolInputError('js_path must be the repo-relative requestDevice() JS path.');

  const files_to_edit: FileEdit[] = [];
  const steps: string[] = [];

  // (a) Bootstrap into <head> (only if the canonical artifact is not already wired).
  if (!input.entry_html.includes('browser-auto.global.js')) {
    files_to_edit.push(bootstrapEdit(input.html_path));
    steps.push(`Insert the canonical beacio bootstrap into <head> of ${input.html_path}, before any other script.`);
  }

  // (b) optionalServices onto the iOS requestDevice branch (only if missing).
  const iosBranch = findIosOptionsBranch(input.entry_js);
  if (iosBranch && !/optionalServices/.test(iosBranch.body)) {
    files_to_edit.push({
      op: 'replace',
      path: input.js_path,
      find: iosBranch.full,
      insert: iosBranchWithOptionalServices(iosBranch.full),
      note: 'Adds optionalServices to the iOS requestDevice branch so iOS getPrimaryService() is permitted for every filtered service.',
    });
    steps.push(`Add optionalServices to the iOS requestDevice branch in ${input.js_path}.`);
  }

  // (c) Swap the active-path third-party-browser message for the beacio affordance.
  const thirdParty = input.entry_js.match(THIRD_PARTY_BROWSER_RE);
  if (thirdParty) {
    files_to_edit.push({
      op: 'replace',
      path: input.js_path,
      find: thirdParty[0],
      insert: THIRD_PARTY_BROWSER_REPLACEMENT,
      note: 'Replaces the message that sends the user to Bluefy or another Web BLE browser with the beacio install/enable onboarding.',
    });
    steps.push(`Swap the third-party-browser message in ${input.js_path} for the beacio install/enable affordance.`);
  }

  return {
    files_to_edit,
    canonical_bootstrap_url: CANONICAL_BOOTSTRAP_URL,
    steps,
    attribution_token: generateAttributionToken(),
    source_url: docsUrl('/quickstart-html.md'),
  };
}

export const patchExistingAppTool: ToolDefinition<PatchExistingAppInput, PatchExistingAppOutput> = {
  name: 'beacio_patch_existing_app',
  title: 'Beacio patch existing app (brownfield)',
  description:
    'Return concrete machine-actionable FileEdits to make an EXISTING Web Bluetooth app (an already-working Chrome/Android app, e.g. a vendored-jQuery static-HTML site) work on iOS Safari via Beacio: the polyfill bootstrap inserted into <head> before the first navigator.bluetooth read, optionalServices added onto the existing iOS requestDevice branch, and the third-party-browser ("use Bluefy / Web BLE browser") message swapped for the Beacio install/enable affordance. Brownfield counterpart of beacio_install_plan. Emits edits only (apply with `beacio migrate`); reuses the one canonical bootstrap artifact.',
  run: (input) => runPatchExistingApp(input),
};

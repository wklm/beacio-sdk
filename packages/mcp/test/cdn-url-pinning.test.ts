import { describe, expect, it } from 'vitest';
import { runInstallPlan, FRAMEWORKS, PACKAGE_MANAGERS } from '../src/tools/install-plan.js';
import { runExample, PROFILES } from '../src/tools/example.js';

// AIDEV-NOTE: Regression guard for PR #178 BLOCKER B1.
// The cdn.beacio.com Worker (cloudflare/workers/cdn) rejects partial versions
// (`@1`, `@1.0`) with HTTP 400 — see its PINNED_VERSION_REGEX and the
// `rejects partial versions` case in cloudflare/workers/cdn/src/index.test.ts.
// Only a FULL three-part semver (`@X.Y.Z`) 302s to npm. So every cdn.beacio.com
// URL the MCP tools emit to agents MUST carry a full semver, or the marquee
// copy-paste install one-liner loads nothing and navigator.bluetooth is never
// patched. This test extracts every cdn.beacio.com URL from every tool output
// (all frameworks × package managers × profiles) and asserts the pinned shape.

// Matches a @beacio/core CDN URL carrying a FULL semver immediately after `@`.
// Prerelease suffixes (e.g. 1.0.0-rc.1) are allowed; bare/partial (@1, @1.0) are not.
const FULL_SEMVER_CDN = /cdn\.beacio\.com\/@beacio\/core@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\//;

// Any cdn.beacio.com URL up to the first whitespace/quote/paren/angle-bracket.
const ANY_CDN_URL = /https?:\/\/cdn\.beacio\.com\/[^\s'"`)<]+/g;

// A bare/partial-version form the proxy 400s: `@beacio/core@<digits>` followed
// by `/` or end (no second dot-segment). e.g. `@beacio/core@1/`, `@beacio/core@1.0/`.
const PARTIAL_VERSION = /@beacio\/core@\d+(?:\.\d+)?(?=[/?'"` )<]|$)/;

/** Collect every cdn.beacio.com URL the install-plan + example tools emit. */
function collectCdnUrls(): { url: string; origin: string }[] {
  const found: { url: string; origin: string }[] = [];
  const scan = (text: string, origin: string) => {
    const matches = text.match(ANY_CDN_URL);
    if (matches) for (const url of matches) found.push({ url, origin });
  };

  for (const framework of FRAMEWORKS) {
    for (const package_manager of PACKAGE_MANAGERS) {
      const out = runInstallPlan({ framework, package_manager });
      const label = `install_plan(${framework},${package_manager})`;
      scan(out.code_snippet, `${label}.code_snippet`);
      out.steps.forEach((s, i) => scan(s, `${label}.steps[${i}]`));
      out.actions.files_to_edit.forEach((edit, i) => {
        scan(edit.insert, `${label}.actions.files_to_edit[${i}].insert`);
        if (edit.note) scan(edit.note, `${label}.actions.files_to_edit[${i}].note`);
      });
      // Premium variant exercises the extra premium step too.
      const premium = runInstallPlan({ framework, package_manager, include_premium: true });
      premium.steps.forEach((s, i) => scan(s, `${label}+premium.steps[${i}]`));
    }
  }

  for (const profile of PROFILES) {
    const out = runExample({ profile });
    scan(out.code, `example(${profile}).code`);
    scan(out.html, `example(${profile}).html`);
  }

  return found;
}

describe('CDN URL pinning (PR #178 B1 regression guard)', () => {
  const urls = collectCdnUrls();

  it('emits at least one cdn.beacio.com URL to scan (guards against a silent no-op)', () => {
    // The html framework + cdn package manager paths and the example html
    // snippets all carry a CDN bootstrap; if this is 0 the test is asserting
    // nothing and would falsely pass.
    expect(urls.length).toBeGreaterThan(0);
  });

  it('every emitted cdn.beacio.com URL pins a full @X.Y.Z semver (proxy 302s, not 400s)', () => {
    const bad = urls.filter(({ url }) => !FULL_SEMVER_CDN.test(url));
    expect(
      bad,
      `These CDN URLs are not pinned to a full semver and would 400 on cdn.beacio.com:\n` +
        bad.map(({ origin, url }) => `  - ${origin}: ${url}`).join('\n'),
    ).toEqual([]);
  });

  it('no emitted URL uses a bare/partial @1 or @1.0 version (the 400-rejected form)', () => {
    const partial = urls.filter(({ url }) => PARTIAL_VERSION.test(url));
    expect(
      partial,
      `These CDN URLs use a partial version the proxy rejects:\n` +
        partial.map(({ origin, url }) => `  - ${origin}: ${url}`).join('\n'),
    ).toEqual([]);
  });

  it('the documented core bootstrap resolves to @beacio/core@1.0.0 (the published, proxy-accepted release)', () => {
    // At least one emitted bootstrap must be the exact canonical one-liner URL.
    const canonical = 'https://cdn.beacio.com/@beacio/core@1.0.0/dist/auto.mjs';
    expect(urls.some(({ url }) => url === canonical)).toBe(true);
  });
});

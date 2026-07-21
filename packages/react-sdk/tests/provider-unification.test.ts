import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ReactSdk from '../src/index';

// AIDEV-NOTE: Provider unification guard (B10-c, §4.3(c) of the simplification
// plan; D5 RESOLVED = consolidate repo-side). Before this change there were TWO
// `BeacioProvider` / `useBeacio` pairs with DIFFERENT semantics:
//   - packages/detect/src/react.tsx  (@beacio/detect/react) — detection-only
//   - packages/react-sdk/src/core/BeacioProvider.tsx (@beacio/react) — full BLE client,
//     which ALREADY subsumes detect's install-prompt/detection semantics.
// The two were unified onto the react-sdk provider (the single home). The detect
// `./react` subpath was removed and every first-party emitting surface repointed
// to `@beacio/react`. This guard pins the invariant so the ambiguity (and the
// removed subpath) cannot silently return.

const REPO = join(__dirname, '..', '..', '..'); // packages/react-sdk/tests -> repo root

// The single unified provider lives in @beacio/react.
const EXPORTED = new Set(Object.keys(ReactSdk));

// First-party surfaces that must NOT reference the removed @beacio/detect/react
// subpath. Generated dist/ output and business content under outreach/ are
// excluded (dist is rebuilt by the gate; outreach is off-limits).
const SURFACES = [
  'packages/core/detect/README.md',
  'packages/core/detect/AGENTS.md',
  'packages/skill/SKILL.md',
  'packages/mcp/src/cli/commands/init.ts', // B10-e: the CLI merged into @beacio/mcp
  'website-src/public/docs.md',
  'website-src/pages/docs.html',
  'sdk-public/wiki/Extension-Detection.md',
];

describe('provider unification onto @beacio/react (B10-c)', () => {
  it('the unified provider + hook are the @beacio/react named exports', () => {
    expect(EXPORTED.has('BeacioProvider')).toBe(true);
    expect(EXPORTED.has('useBeacio')).toBe(true);
  });

  it('the redundant detect detection-only provider source is deleted', () => {
    const detectReact = join(REPO, 'packages', 'detect', 'src', 'react.tsx');
    expect(existsSync(detectReact)).toBe(false);
  });

  it('the former @beacio/detect package is gone (folded into @beacio/core in B10-d)', () => {
    // B10-d merged detect INTO core: the standalone package no longer exists, so
    // neither a `./react` nor a `./detect` subpath can carry a stray provider.
    expect(existsSync(join(REPO, 'packages', 'detect'))).toBe(false);
    const corePkg = JSON.parse(
      readFileSync(join(REPO, 'packages', 'core', 'package.json'), 'utf8'),
    );
    expect(corePkg.exports['./react']).toBeUndefined();
    expect(corePkg.exports['./detect/react']).toBeUndefined();
  });

  it('no first-party surface imports the provider from the removed @beacio/detect/react subpath', () => {
    const offenders: string[] = [];
    for (const rel of SURFACES) {
      const abs = join(REPO, rel);
      if (!existsSync(abs)) continue;
      const text = readFileSync(abs, 'utf8');
      if (text.includes('@beacio/detect/react')) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

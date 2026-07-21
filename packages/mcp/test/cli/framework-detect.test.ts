import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { detectFramework } from '../../src/cli/utils/framework-detect.js';

// SB-SDK-04 AC#2: framework detection must classify a vendored-jQuery static-HTML
// app — WITH or WITHOUT a package.json — as 'html' with a resolved entryFile.
// The S&B app is exactly this shape: a static jQuery site whose entry HTML lives
// under app/index.html, optionally carrying a package.json with no framework dep.

function scaffold(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'fd-detect-'));
  for (const [rel, body] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
  }
  return dir;
}

function withDir(files: Record<string, string>, fn: (dir: string) => void): void {
  const dir = scaffold(files);
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('framework-detect — vendored-jQuery static HTML (AC#2)', () => {
  it('classifies a static HTML app with NO package.json as html with a resolved entry', () => {
    withDir({ 'index.html': '<html><body><script src="js/jquery.js"></script></body></html>' }, (dir) => {
      const r = detectFramework(dir);
      expect(r.framework).toBe('html');
      expect(r.entryFile).toBeTruthy();
    });
  });

  it('classifies a vendored-jQuery app WITH a package.json (no framework dep) as html with a resolved entry', () => {
    // S&B-shaped: a package.json that lists jQuery (a vendored library, not a
    // framework) and an entry HTML that lives under app/index.html — NOT at the
    // repo root. Today the detector returns { framework: 'generic', entryFile: null }
    // for this layout, which would make `beacio migrate` no-op on the real S&B repo.
    withDir(
      {
        'package.json': JSON.stringify({
          name: 'sb-web-app',
          dependencies: { jquery: '3.4.1' },
        }),
        'app/index.html': '<html><head></head><body><script src="js/main.js"></script></body></html>',
        'app/js/main.js': 'if (navigator.bluetooth) {}',
      },
      (dir) => {
        const r = detectFramework(dir);
        expect(r.framework).toBe('html');
        expect(r.entryFile, 'entryFile must resolve to the app/index.html entry').toBeTruthy();
      },
    );
  });

  it('classifies a vendored-jQuery app whose entry is public/index.html as html', () => {
    withDir(
      {
        'package.json': JSON.stringify({ dependencies: { jquery: '3.4.1' } }),
        'public/index.html': '<html></html>',
      },
      (dir) => {
        const r = detectFramework(dir);
        expect(r.framework).toBe('html');
        expect(r.entryFile).toBe('public/index.html');
      },
    );
  });
});

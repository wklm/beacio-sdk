/**
 * Framework auto-detection for Beacio CLI
 */

import * as fs from 'fs';
import * as path from 'path';

export type Framework =
  | 'nextjs-app'
  | 'nextjs-pages'
  | 'react-vite'
  | 'react-cra'
  | 'vue'
  | 'nuxt'
  | 'sveltekit'
  | 'angular'
  | 'html'
  | 'generic';

export interface DetectionResult {
  framework: Framework;
  entryFile: string | null;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
}

function readPackageJson(projectPath: string): Record<string, any> | null {
  const pkgPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
}

function detectPackageManager(projectPath: string): 'npm' | 'yarn' | 'pnpm' | 'bun' {
  if (fs.existsSync(path.join(projectPath, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function findFile(projectPath: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const fullPath = path.join(projectPath, candidate);
    if (fs.existsSync(fullPath)) return candidate;
  }
  return null;
}

export function detectFramework(projectPath: string): DetectionResult {
  const pkg = readPackageJson(projectPath);
  const packageManager = detectPackageManager(projectPath);

  // Static-HTML entry candidates. Covers a vendored-jQuery app served from the repo
  // root, a public/ dir, or an app/ dir (the Storz & Bickel shape, SB-SDK-04 AC#2).
  const HTML_ENTRY_CANDIDATES = ['index.html', 'public/index.html', 'app/index.html', 'src/index.html'];

  if (!pkg) {
    // Check for plain HTML
    const htmlFile = findFile(projectPath, HTML_ENTRY_CANDIDATES);
    return {
      framework: htmlFile ? 'html' : 'generic',
      entryFile: htmlFile,
      packageManager,
    };
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Next.js
  if (deps?.next) {
    // Check for app router vs pages router
    const appLayout = findFile(projectPath, [
      'app/layout.tsx',
      'app/layout.jsx',
      'app/layout.js',
      'src/app/layout.tsx',
      'src/app/layout.jsx',
      'src/app/layout.js',
    ]);
    if (appLayout) {
      return { framework: 'nextjs-app', entryFile: appLayout, packageManager };
    }

    const pagesApp = findFile(projectPath, [
      'pages/_app.tsx',
      'pages/_app.jsx',
      'pages/_app.js',
      'src/pages/_app.tsx',
      'src/pages/_app.jsx',
      'src/pages/_app.js',
    ]);
    return {
      framework: 'nextjs-pages',
      entryFile: pagesApp,
      packageManager,
    };
  }

  // Nuxt
  if (deps?.nuxt) {
    const appVue = findFile(projectPath, ['app.vue', 'layouts/default.vue']);
    return { framework: 'nuxt', entryFile: appVue, packageManager };
  }

  // SvelteKit
  if (deps?.['@sveltejs/kit']) {
    const layout = findFile(projectPath, [
      'src/routes/+layout.svelte',
      'src/routes/__layout.svelte',
    ]);
    return { framework: 'sveltekit', entryFile: layout, packageManager };
  }

  // React + Vite
  if (deps?.react && deps?.vite) {
    const main = findFile(projectPath, [
      'src/main.tsx',
      'src/main.jsx',
      'src/main.js',
      'src/index.tsx',
      'src/index.jsx',
    ]);
    return { framework: 'react-vite', entryFile: main, packageManager };
  }

  // React (CRA or other)
  if (deps?.react) {
    const main = findFile(projectPath, [
      'src/index.tsx',
      'src/index.jsx',
      'src/index.js',
      'src/App.tsx',
      'src/App.jsx',
    ]);
    return { framework: 'react-cra', entryFile: main, packageManager };
  }

  // Vue
  if (deps?.vue) {
    const main = findFile(projectPath, [
      'src/main.ts',
      'src/main.js',
      'src/App.vue',
    ]);
    return { framework: 'vue', entryFile: main, packageManager };
  }

  // Angular
  if (deps?.['@angular/core']) {
    const appModule = findFile(projectPath, [
      'src/app/app.component.ts',
      'src/app/app.module.ts',
    ]);
    return { framework: 'angular', entryFile: appModule, packageManager };
  }

  // Plain HTML — including a vendored-library (e.g. jQuery) static app that carries a
  // package.json with NO framework dependency. Its entry HTML may live at the repo root,
  // under public/, or under app/ (the Storz & Bickel layout). SB-SDK-04 AC#2.
  const htmlFile = findFile(projectPath, HTML_ENTRY_CANDIDATES);
  if (htmlFile) {
    return { framework: 'html', entryFile: htmlFile, packageManager };
  }

  return { framework: 'generic', entryFile: null, packageManager };
}

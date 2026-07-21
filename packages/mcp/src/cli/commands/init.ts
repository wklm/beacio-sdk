/**
 * `npx beacio init` command
 * Auto-detects framework and adds Beacio detection snippet
 */

import * as fs from 'fs';
import * as path from 'path';
import { detectFramework, type Framework } from '../utils/framework-detect.js';

function parseArgs(args: string[]): { key?: string; framework?: string } {
  const result: { key?: string; framework?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--key' && args[i + 1]) {
      result.key = args[++i];
    } else if (args[i] === '--framework' && args[i + 1]) {
      result.framework = args[++i];
    }
  }
  return result;
}

function getInstallCommand(packageManager: string): string {
  switch (packageManager) {
    case 'yarn': return 'yarn add @beacio/core';
    case 'pnpm': return 'pnpm add @beacio/core';
    case 'bun': return 'bun add @beacio/core';
    default: return 'npm install @beacio/core';
  }
}

function getSnippet(framework: Framework, apiKey: string): { code: string; location: string } {
  switch (framework) {
    case 'nextjs-app':
      return {
        code: `import { BeacioProvider } from '@beacio/react'\n`,
        location: 'Install @beacio/react, then wrap children with <BeacioProvider config={{ apiKey: "' + apiKey + '" }}>{children}</BeacioProvider>',
      };
    case 'nextjs-pages':
      return {
        code: `import { BeacioProvider } from '@beacio/react'\n`,
        location: 'Install @beacio/react, then wrap <Component /> with <BeacioProvider config={{ apiKey: "' + apiKey + '" }}>...</BeacioProvider>',
      };
    case 'react-vite':
    case 'react-cra':
      return {
        code: `import '@beacio/core/auto'\nimport { initBeacio } from '@beacio/core/detect'\ninitBeacio({ key: '${apiKey}' })\n`,
        location: 'Add import at the top of the entry file',
      };
    case 'vue':
    case 'nuxt':
      return {
        code: `import '@beacio/core/auto'\nimport { initBeacio } from '@beacio/core/detect'\ninitBeacio({ key: '${apiKey}' })\n`,
        location: 'Add to the entry file',
      };
    case 'html':
      // CDN-01: emit the canonical M7-pinned cdn.beacio.com bootstrap (the same
      // URL `beacio_install_plan` writes on the html+cdn path — see
      // packages/mcp/src/tools/install-plan.ts CANONICAL_CDN_BOOTSTRAP_URL +
      // packages/mcp/src/data/install-plan.json). The cdn Worker 302s full-semver
      // `@1.0.0` and 400s partials (`@1`, `@1.0`), so the version is pinned
      // exactly. The API key rides on a `<meta name="beacio-key">` tag (the form
      // `@beacio/core/auto` reads — see packages/core/detect/AGENTS.md), since the
      // ESM self-installing polyfill has no `data-key` attribute surface. The
      // pre-rebrand `https://beacio.com/beacio.js` apex shortener is kept as a
      // LEGACY alternative in check.ts (not emitted here anymore).
      return {
        code: `<meta name="beacio-key" content="${apiKey}">\n<script type="module">import 'https://cdn.beacio.com/@beacio/core@1.0.0/dist/auto.mjs';</script>`,
        location: 'Add before </body> (meta tag first, then the module script — module scripts are deferred so navigator.bluetooth mounts after the document parses)',
      };
    default:
      return {
        code: `import '@beacio/core/auto'\nimport { initBeacio } from '@beacio/core/detect'\ninitBeacio({ key: '${apiKey}' })`,
        location: 'Add to your app entry point',
      };
  }
}

export async function init(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const projectPath = process.cwd();

  console.log('Detecting framework...');
  const detection = detectFramework(projectPath);
  console.log(`  Framework: ${detection.framework}`);
  console.log(`  Entry file: ${detection.entryFile || '(not found)'}`);
  console.log(`  Package manager: ${detection.packageManager}`);
  console.log();

  // Get API key (optional — used for campaign tracking)
  const apiKey = options.key || process.env.BEACIO_API_KEY || 'YOUR_API_KEY';

  if (options.key) {
    const { validateApiKey } = await import('@beacio/core/detect');
    console.log('Validating API key...');
    const config = await validateApiKey(options.key);
    if (config) {
      console.log(`  Valid — ${config.appName || 'unnamed app'} (${config.plan} plan)`);
    } else {
      console.log('  Could not validate key (invalid or network error)');
      console.log('  Proceeding anyway — the key will be checked at runtime.');
    }
    console.log();
  }

  // Install packages
  const installCmd = getInstallCommand(detection.packageManager);
  console.log(`Installing @beacio/core...`);
  console.log(`  Run: ${installCmd}`);
  console.log();

  // Generate snippet
  const snippet = getSnippet(
    options.framework as Framework || detection.framework,
    apiKey
  );

  if (detection.entryFile && detection.framework === 'html') {
    // For HTML, inject the script tag
    const filePath = path.join(projectPath, detection.entryFile);
    let content = fs.readFileSync(filePath, 'utf-8');
    if (!content.includes('beacio')) {
      content = content.replace('</body>', `  ${snippet.code}\n</body>`);
      fs.writeFileSync(filePath, content);
      console.log(`Added detection snippet to ${detection.entryFile}`);
    } else {
      console.log('Beacio already detected in entry file, skipping.');
    }
  } else if (detection.entryFile) {
    const filePath = path.join(projectPath, detection.entryFile);
    let content = fs.readFileSync(filePath, 'utf-8');
    if (!content.includes('beacio')) {
      content = snippet.code + '\n' + content;
      fs.writeFileSync(filePath, content);
      console.log(`Added detection import to ${detection.entryFile}`);
    } else {
      console.log('Beacio already detected in entry file, skipping.');
    }
  }

  console.log();
  console.log('Integration complete!');
  console.log();
  console.log('Next steps:');
  console.log(`  1. ${installCmd}`);
  if (detection.entryFile) {
    console.log(`  2. ${snippet.location}`);
  }
  console.log(`  3. Run: npx beacio check`);

  // Suggest React SDK if React is detected
  if (['nextjs-app', 'nextjs-pages', 'react-vite', 'react-cra'].includes(detection.framework)) {
    console.log();
    console.log('React detected! Also consider:');
    const reactPkg = detection.packageManager === 'yarn' ? 'yarn add @beacio/react' :
      detection.packageManager === 'pnpm' ? 'pnpm add @beacio/react' :
      detection.packageManager === 'bun' ? 'bun add @beacio/react' :
      'npm install @beacio/react';
    console.log(`  ${reactPkg} — React hooks for BLE (useDevice, useScan, useProfile)`);
  }
}

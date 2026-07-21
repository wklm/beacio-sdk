#!/usr/bin/env node

/**
 * `beacio` CLI (shipped from @beacio/mcp alongside the `beacio-mcp` bin).
 *
 * CLI tool for integrating Beacio into web projects.
 * Usage: npx beacio <command> [options]
 */

import { createRequire } from 'node:module';
import { init } from './commands/init.js';
import { migrate } from './commands/migrate.js';
import { check } from './commands/check.js';

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
  Beacio CLI - Add iOS Safari Bluetooth support to any web app

  Usage: npx beacio <command> [options]

  Commands:
    init              Auto-detect framework and add detection snippet
    migrate           Brownfield: patch an existing Web Bluetooth app for iOS Safari
    check             Verify Beacio integration is correct (add --brownfield for an existing app)

  Options:
    --help, -h        Show this help message
    --version, -v     Show version

  Examples:
    npx beacio init
    npx beacio init --key wbl_xxxxx --framework react
    npx beacio migrate
    npx beacio check
    npx beacio check --brownfield
  `);
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    const require = createRequire(import.meta.url);
    const pkg = require('../../package.json') as { version: string };
    console.log(pkg.version);
    process.exit(0);
  }

  try {
    switch (command) {
      case 'init':
        await init(args.slice(1));
        break;
      case 'migrate':
        await migrate(args.slice(1));
        break;
      case 'check':
        await check(args.slice(1));
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

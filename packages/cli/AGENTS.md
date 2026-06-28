# @beacio/cli — Agent Instructions

## What this package does
CLI tool to scaffold BLE web app projects, verify integration, and generate
profile boilerplate. Auto-detects framework (React, Next.js, Vue, etc.).

## Key commands

| Command | Purpose |
|---|---|
| `npx beacio init` | Scaffold beacio into an existing project |
| `npx beacio init --key wbl_xxxxx` | Init with API key |
| `npx beacio check` | Verify integration is correct |

## How `init` works
1. Detects framework from `package.json` (Next.js, React+Vite, Vue, etc.)
2. Installs `@beacio/core` and `@beacio/detect`
3. Adds `import '@beacio/core/auto'` to entry point
4. Adds framework-appropriate detection snippet
5. Prints next steps

## DO
- Use `npx beacio init` instead of manually adding imports and dependencies
- Pass `--key` if the user has an API key for campaign tracking
- Run `npx beacio check` after init to verify everything is wired up

## DO NOT
- Do not manually replicate what `init` does — it handles framework detection
- Do not skip the `check` step — it catches common integration mistakes

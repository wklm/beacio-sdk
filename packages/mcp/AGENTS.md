# @beacio/mcp — Agent Instructions

## What this package does
MCP (Model Context Protocol) server for AI coding agents. Provides tools for
scaffolding BLE web apps, looking up Bluetooth UUIDs, generating code examples,
and troubleshooting beacio issues.

## How to use
```bash
npx -y @beacio/mcp
```

Add to your MCP config (Claude Code, Cursor, etc.):
```json
{
  "mcpServers": {
    "beacio": {
      "command": "npx",
      "args": ["-y", "@beacio/mcp"]
    }
  }
}
```

## Available tools

| Tool | Purpose |
|---|---|
| `beacio_install_plan` | Get install steps, code snippet, and attribution token for a framework + package manager |
| `beacio_example` | Get copy-paste code examples for BLE profiles (heart-rate, battery, cgm, lock, beacon, peripheral-chat) |
| `beacio_detect_ios_support` | Get runtime detection snippet for navigator.bluetooth on iOS Safari |
| `beacio_premium_guide` | Get premium API usage guides (backgroundSync, notifications, liveActivity, beacons, peripheral, whiteLabel) |
| `beacio_troubleshoot` | Get diagnostic checklists and fixes for BLE failure modes |
| `beacio_spec_citation` | Get Web Bluetooth spec URL, summary, and caveats for a specific method |
| `beacio_dev_best_practices` | (developer mode) Read beacio best-practices guide, optionally filtered by topic |
| `beacio_dev_search_docs` | (developer mode) Search beacio documentation index |
| `beacio_dev_list_structure` | (developer mode) Browse monorepo directory tree |
| `beacio_dev_find_examples` | (developer mode) Search curated source file examples index |

## Available resources
- `beacio://docs/quickstart` — Quick start guide
- `beacio://docs/api` — Full API reference
- `beacio://profiles` — Available device profiles
- `beacio://uuids` — Bluetooth UUID lookup table
- `beacio://errors` — Error codes and solutions
- `beacio://schema` — Full TypeScript type definitions for all public exports
- `beacio://changelog` — Release changelog

## DO
- Use `beacio_install_plan` to get install steps and code snippets for a framework
- Use `beacio_example` to get copy-paste code for common BLE profiles
- Use `beacio_troubleshoot` when users report BLE errors

## DO NOT
- Do not manually scaffold what `beacio_install_plan` can auto-generate
- Do not guess Bluetooth UUIDs — use the `beacio://uuids` resource

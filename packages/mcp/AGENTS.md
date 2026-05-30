# @ios-web-bluetooth/mcp — Agent Instructions

## What this package does
MCP (Model Context Protocol) server for AI coding agents. Provides tools for
scaffolding BLE web apps, looking up Bluetooth UUIDs, generating code examples,
and troubleshooting WebBLE issues.

## How to use
```bash
npx -y @ios-web-bluetooth/mcp
```

Add to your MCP config (Claude Code, Cursor, etc.):
```json
{
  "mcpServers": {
    "webble": {
      "command": "npx",
      "args": ["-y", "@ios-web-bluetooth/mcp"]
    }
  }
}
```

## Available tools

| Tool | Purpose |
|---|---|
| `webble_install_plan` | Get install steps, code snippet, and attribution token for a framework + package manager |
| `webble_example` | Get copy-paste code examples for BLE profiles (heart-rate, battery, cgm, lock, beacon, peripheral-chat) |
| `webble_detect_ios_support` | Get runtime detection snippet for navigator.bluetooth on iOS Safari |
| `webble_premium_guide` | Get premium API usage guides (backgroundSync, notifications, liveActivity, beacons, peripheral, whiteLabel) |
| `webble_troubleshoot` | Get diagnostic checklists and fixes for BLE failure modes |
| `webble_spec_citation` | Get Web Bluetooth spec URL, summary, and caveats for a specific method |
| `webble_dev_best_practices` | (developer mode) Read WebBLE best-practices guide, optionally filtered by topic |
| `webble_dev_search_docs` | (developer mode) Search WebBLE documentation index |
| `webble_dev_list_structure` | (developer mode) Browse monorepo directory tree |
| `webble_dev_find_examples` | (developer mode) Search curated source file examples index |

## Available resources
- `ioswebble://docs/quickstart` — Quick start guide
- `ioswebble://docs/api` — Full API reference
- `ioswebble://profiles` — Available device profiles
- `ioswebble://uuids` — Bluetooth UUID lookup table
- `ioswebble://errors` — Error codes and solutions
- `ioswebble://schema` — Full TypeScript type definitions for all public exports
- `ioswebble://changelog` — Release changelog

## DO
- Use `webble_install_plan` to get install steps and code snippets for a framework
- Use `webble_example` to get copy-paste code for common BLE profiles
- Use `webble_troubleshoot` when users report BLE errors

## DO NOT
- Do not manually scaffold what `webble_install_plan` can auto-generate
- Do not guess Bluetooth UUIDs — use the `ioswebble://uuids` resource

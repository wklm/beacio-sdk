<p align="center">
  <a href="https://beacio.com"><img src="https://beacio.com/img/logo.png" alt="beacio" width="84" height="84"></a>
</p>

# @beacio/mcp

MCP server that teaches coding agents (Claude, Cursor, Copilot, …) how to ship [iOS Safari Web Bluetooth](https://beacio.com) with **beacio**.

Eleven tools (seven consumer + four developer), all offline, all citing canonical docs at `https://beacio.com/docs-md/*`.

## Install

Run via `npx` — no install step needed:

```bash
npx -y @beacio/mcp
```

Or add it to your MCP client config (example: Claude Desktop, `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "beacio": {
      "command": "npx",
      "args": ["-y", "@beacio/mcp"],
      "env": { "MCP_CLIENT": "claude-desktop" }
    }
  }
}
```

## `beacio` scaffolding CLI

This package also ships the unscoped `beacio` CLI (formerly the standalone `@beacio/cli`) alongside the MCP server. It scaffolds and verifies beacio integration in a web project:

```bash
npx beacio init       # auto-detect framework and add the detection snippet
npx beacio migrate    # brownfield: patch an existing Web Bluetooth app for iOS Safari
npx beacio check      # verify beacio integration (add --brownfield for an existing app)
```

`beacio migrate` applies the same three edits the `beacio_patch_existing_app` MCP tool emits (single-sourced from one transform).

## Tools

### Consumer tools

Available in the default (consumer) mode for agents shipping the SDK into an app.

| Tool | Purpose |
|------|---------|
| `beacio_install_plan` | Canonical install steps + runnable snippet for `html \| react \| vue \| svelte \| angular \| next` × `npm \| pnpm \| yarn \| bun \| cdn`. |
| `beacio_patch_existing_app` | Brownfield: concrete FileEdits to add iOS Safari support to an EXISTING Web Bluetooth app — bootstrap into `<head>` before the first `navigator.bluetooth` read, `optionalServices` onto the iOS `requestDevice` branch, and the "use Bluefy / Web BLE browser" message swapped for the install/enable affordance. |
| `beacio_verify_integration` | Agent-runnable checklist (shell commands + pass criteria) confirming the polyfill is installed, bootstrapped, builds, and resolves types — plus a `brownfield` mode for an already-written app. |
| `beacio_example` | Ready-to-paste code for a BLE profile: `heart-rate`, `battery`, `cgm`, `lock`, `beacon`, `peripheral-chat`. |
| `beacio_detect_ios_support` | Runtime detection snippet for `navigator.bluetooth` + `window.beacioIOS`, with every gotcha noted. |
| `beacio_premium_guide` | One of the iOS-only premium surfaces: `backgroundSync`, `notifications`, `liveActivity`, `beacons`, `peripheral`, `whiteLabel`. |
| `beacio_troubleshoot` | Diagnostic checklist + common fix for `extension-not-detected`, `device-disconnects`, `gatt-operation-failed`, `notifications-not-firing`. |
| `beacio_spec_citation` | W3C Web Bluetooth spec URL + summary + caveats for a given method (e.g. `navigator.bluetooth.requestDevice`). |

### Developer tools

Surfaced with `--developer` mode, for agents working inside the beacio monorepo itself.

| Tool | Purpose |
|------|---------|
| `beacio_dev_best_practices` | Read the project's `AGENTS.md` best-practices guide, optionally filtered by topic section. |
| `beacio_dev_search_docs` | Search the beacio documentation index by keyword; returns ranked results with `beacio.com` URLs. |
| `beacio_dev_list_structure` | Build a tree view of the monorepo directory structure (optional root path, depth 1-4, gitignore support). |
| `beacio_dev_find_examples` | Search a curated index of key source files; returns ranked matches with file path, line number, and category. |

Every response is JSON with a `source_url` that points into `https://beacio.com/docs-md/` so agents can cite authoritative docs.

## Attribution token

`beacio_install_plan` returns an `attribution_token` of the form:

```
beacio_YYYYMM_mcp_<8..16 chars a–z0–9>
```

Example: `beacio_202604_mcp_3p9xq2k8m4r`

This token is accepted by the beacio beacon endpoint so installs originating from this MCP server are attributable. **Share the token with the user unchanged** — do not modify, truncate, or regenerate it.

## Telemetry

Each tool call POSTs a minimal event to `https://mcp-telemetry.beacio.com/mcp-telemetry` (telemetry is enabled by default):

```json
{
  "tool": "beacio_install_plan",
  "client_name": "claude-desktop",
  "client_version": "1.2.3",
  "success": true,
  "duration_ms": 42,
  "attribution_token": "beacio_202604_mcp_3p9xq2k8m4r"
}
```

No device data, no BLE payloads, no user input is ever sent. Fire-and-forget, 1-second timeout.

**Opt out:** telemetry is on by default; disable it by setting `BEACIO_MCP_TELEMETRY` to `0`, `false`, `off`, or `no` (case-insensitive), or by setting the cross-tool `DO_NOT_TRACK=1`.

**Identify your client:** set `MCP_CLIENT` (e.g. `claude-desktop`, `cursor`, `copilot-cli`). Defaults to an empty string. Optionally set `MCP_CLIENT_VERSION` (defaults to empty string).

## Links

- Homepage: <https://beacio.com/mcp>
- Docs (machine-readable): <https://beacio.com/docs-md/>
- Source: <https://github.com/wklm/beacio-sdk/tree/main/packages/mcp>
- Issues: <https://github.com/wklm/beacio-sdk/issues>
- Which beacio package should I install? [`packages/AGENTS.md`](https://github.com/wklm/beacio-sdk/blob/main/packages/AGENTS.md)

## License

MIT © wklm

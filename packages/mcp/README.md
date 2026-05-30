<p align="center">
  <a href="https://ioswebble.com"><img src="https://raw.githubusercontent.com/wklm/WebBLE-Safari-Extension/main/design-assets/brand/logo.png" alt="WebBLE" width="84" height="84"></a>
</p>

# @ios-web-bluetooth/mcp

MCP server that teaches coding agents (Claude, Cursor, Copilot, …) how to ship [iOS Safari Web Bluetooth](https://ioswebble.com) with **WebBLE**.

Six tools, all offline, all citing canonical docs at `https://ioswebble.com/docs-md/*`.

## Install

Run via `npx` — no install step needed:

```bash
npx -y @ios-web-bluetooth/mcp
```

Or add it to your MCP client config (example: Claude Desktop, `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "webble": {
      "command": "npx",
      "args": ["-y", "@ios-web-bluetooth/mcp"],
      "env": { "MCP_CLIENT": "claude-desktop" }
    }
  }
}
```

## Tools

| Tool | Purpose |
|------|---------|
| `webble_install_plan` | Canonical install steps + runnable snippet for `html \| react \| vue \| svelte \| angular \| next` × `npm \| pnpm \| yarn \| bun \| cdn`. |
| `webble_example` | Ready-to-paste code for a BLE profile: `heart-rate`, `battery`, `cgm`, `lock`, `beacon`, `peripheral-chat`. |
| `webble_detect_ios_support` | Runtime detection snippet for `navigator.bluetooth` + `window.webbleIOS`, with every gotcha noted. |
| `webble_premium_guide` | One of the iOS-only premium surfaces: `backgroundSync`, `notifications`, `liveActivity`, `beacons`, `peripheral`, `whiteLabel`. |
| `webble_troubleshoot` | Diagnostic checklist + common fix for `extension-not-detected`, `device-disconnects`, `gatt-operation-failed`, `notifications-not-firing`. |
| `webble_spec_citation` | W3C Web Bluetooth spec URL + summary + caveats for a given method (e.g. `navigator.bluetooth.requestDevice`). |

Every response is JSON with a `source_url` that points into `https://ioswebble.com/docs-md/` so agents can cite authoritative docs.

## Attribution token

`webble_install_plan` returns an `attribution_token` of the form:

```
webble_YYYYMM_mcp_<8..16 chars a–z0–9>
```

Example: `webble_202604_mcp_3p9xq2k8m4r`

This token is accepted by the WebBLE beacon endpoint so installs originating from this MCP server are attributable. **Share the token with the user unchanged** — do not modify, truncate, or regenerate it.

## Telemetry

Each tool call POSTs a minimal event to `https://mcp-telemetry.ioswebble.com/mcp-telemetry` (telemetry is enabled by default):

```json
{
  "tool": "webble_install_plan",
  "client_name": "claude-desktop",
  "client_version": "1.2.3",
  "success": true,
  "duration_ms": 42,
  "attribution_token": "webble_202604_mcp_3p9xq2k8m4r"
}
```

No device data, no BLE payloads, no user input is ever sent. Fire-and-forget, 1-second timeout.

**Opt out:** telemetry is on by default; disable it by setting `WEBBLE_MCP_TELEMETRY` to `0`, `false`, `off`, or `no` (case-insensitive), or by setting the cross-tool `DO_NOT_TRACK=1`.

**Identify your client:** set `MCP_CLIENT` (e.g. `claude-desktop`, `cursor`, `copilot-cli`). Defaults to an empty string. Optionally set `MCP_CLIENT_VERSION` (defaults to empty string).

## Links

- Homepage: <https://ioswebble.com/mcp>
- Docs (machine-readable): <https://ioswebble.com/docs-md/>
- Source: <https://github.com/wklm/WebBLE-Safari-Extension/tree/main/packages/mcp>
- Issues: <https://github.com/wklm/WebBLE-Safari-Extension/issues>
- Which WebBLE package should I install? [`packages/AGENTS.md`](https://github.com/wklm/WebBLE-Safari-Extension/blob/main/packages/AGENTS.md)

## License

MIT © wklm

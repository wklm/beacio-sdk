<p align="center">
  <a href="https://ioswebble.com"><img src="https://raw.githubusercontent.com/wklm/ioswebble-sdk/main/design-assets/brand/logo.png" alt="WebBLE" width="84" height="84"></a>
</p>

# @ios-web-bluetooth/cli

CLI tool for integrating WebBLE into web projects. Auto-detects your framework and adds the detection snippet.

## Usage

```bash
# Auto-detect framework, add detection snippet
npx ioswebble init

# Specify API key and framework explicitly
npx ioswebble init --key wbl_xxxxx --framework react

# Verify integration is correct
npx ioswebble check
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Detect framework (Next.js, React, Vue, Nuxt, HTML, etc.) and inject the `@ios-web-bluetooth/detect` snippet into your entry file |
| `check` | Verify that WebBLE is correctly integrated in the current project |

## Options

```
--key <api-key>       Optional API key for campaign tracking
--framework <name>    Override auto-detection (nextjs-app, nextjs-pages, react-vite, react-cra, vue, nuxt, html)
--help, -h            Show help
--version, -v         Show version
```

## AI agent integration

MCP server for coding agents (Claude Code, Cursor, Copilot):

```
npx -y @ios-web-bluetooth/mcp
```

Full SDK reference for LLM context: <https://ioswebble.com/llms-full.txt>

## Two scopes

The **`@ios-web-bluetooth/*`** packages (`core`, `profiles`, `react`) are the cross-browser BLE SDK -- they work on any platform with Web Bluetooth support (Chrome, Edge, iOS Safari via the extension). The **`@ios-web-bluetooth/*`** packages (`detect`, `cli`, `mcp`, `skill`) handle iOS-specific extension detection, install prompts, and agent tooling. Use both together for full iOS Safari coverage.

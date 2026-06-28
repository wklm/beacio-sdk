<p align="center">
  <a href="https://beacio.com"><img src="https://beacio.com/img/logo.png" alt="beacio" width="84" height="84"></a>
</p>

# @beacio/cli

CLI tool for integrating beacio into web projects. Auto-detects your framework and adds the detection snippet.

## Usage

```bash
# Auto-detect framework, add detection snippet
npx beacio init

# Specify API key and framework explicitly
npx beacio init --key wbl_xxxxx --framework react

# Verify integration is correct
npx beacio check
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Detect framework (Next.js, React, Vue, Nuxt, HTML, etc.) and inject the `@beacio/detect` snippet into your entry file |
| `check` | Verify that beacio is correctly integrated in the current project |

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
npx -y @beacio/mcp
```

Full SDK reference for LLM context: <https://beacio.com/llms-full.txt>

## Two scopes

The **`@beacio/*`** packages (`core`, `profiles`, `react`) are the cross-browser BLE SDK -- they work on any platform with Web Bluetooth support (Chrome, Edge, iOS Safari via the extension). The **`@beacio/*`** packages (`detect`, `cli`, `mcp`, `skill`) handle iOS-specific extension detection, install prompts, and agent tooling. Use both together for full iOS Safari coverage.

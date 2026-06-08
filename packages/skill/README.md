<p align="center">
  <a href="https://ioswebble.com"><img src="https://raw.githubusercontent.com/wklm/ioswebble-sdk/main/design-assets/brand/logo.png" alt="WebBLE" width="84" height="84"></a>
</p>

# @ios-web-bluetooth/skill

Agent skill file for WebBLE integration. Contains a `SKILL.md` that AI coding agents (Claude Code, Cursor, Copilot) can discover and use to add iOS Safari Bluetooth support to any web project.

## What is SKILL.md?

`SKILL.md` is a structured markdown file with frontmatter that agents match on keywords like `bluetooth`, `ios`, `safari`, `ble`, `web-bluetooth`, and `requestDevice`. When an agent detects a relevant task, it reads the skill file for step-by-step integration instructions -- install `@ios-web-bluetooth/detect`, add the snippet, verify with `npx ioswebble check`.

## Install

```bash
npm install @ios-web-bluetooth/skill
```

The package ships only `SKILL.md` -- no runtime code. Agents resolve the file via `node_modules/@ios-web-bluetooth/skill/SKILL.md`.

## How agents use it

1. User asks "add Bluetooth support to my iOS web app"
2. Agent matches keywords in `SKILL.md` frontmatter (`bluetooth`, `ios`, `safari`)
3. Agent reads the skill and follows the integration steps
4. Result: `@ios-web-bluetooth/detect` installed, snippet added, `npx ioswebble check` passes

## AI agent integration

MCP server for coding agents (Claude Code, Cursor, Copilot):

```
npx -y @ios-web-bluetooth/mcp
```

Full SDK reference for LLM context: <https://ioswebble.com/llms-full.txt>

## Two scopes

The **`@ios-web-bluetooth/*`** packages (`core`, `profiles`, `react`) are the cross-browser BLE SDK -- they work on any platform with Web Bluetooth support (Chrome, Edge, iOS Safari via the extension). The **`@ios-web-bluetooth/*`** packages (`detect`, `cli`, `mcp`, `skill`) handle iOS-specific extension detection, install prompts, and agent tooling. Use both together for full iOS Safari coverage.

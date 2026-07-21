---
name: beacio
description: Web Bluetooth SDK — scan, connect, read/write BLE devices from web apps (iOS Safari + Chrome)
trigger: bluetooth ble web-bluetooth ios safari navigator.bluetooth requestDevice beacio beacio bluetooth-scan gatt connect-device heart-rate-monitor ble-profile bluetooth-low-energy
---

<!-- Canonical SKILL.md lives at packages/skill/SKILL.md. This is a copy for npm distribution. -->

# beacio SDK Integration

## What this does
beacio is a Web Bluetooth SDK for web apps. It works on Chrome natively and on iOS Safari via a companion app + Safari extension. The SDK provides scan, connect, read/write/subscribe operations for BLE devices.

## Package Routing Table

| You want to... | Install | Scope |
|---|---|---|
| Scan, connect, read/write BLE devices | `npm install @beacio/core` | @beacio |
| Use typed device profiles (heart rate, battery, device info) | `npm install @beacio/core` (import from `@beacio/core/profiles`) | @beacio |
| React hooks and components for BLE | `npm install @beacio/react` | @beacio |
| Detect iOS Safari extension, show install banner | `npm install @beacio/core` | @beacio |
| AI agent MCP tools | `npx -y @beacio/mcp` | @beacio |
| CLI scaffolding | `npx beacio init` | @beacio |

**Scope**: All packages are published under `@beacio/*`.

## Quick Start (iOS Safari detection — this package)

```typescript
import { initBeacio } from '@beacio/core/detect'
initBeacio({})
```

For the full SDK integration guide, see the canonical SKILL.md in `@beacio/skill` or https://beacio.com/llms-full.txt

## Rules
- Do NOT modify existing `navigator.bluetooth` calls
- Use `@beacio/core` for BLE operations, `@beacio/core/detect` only for extension detection
- API key is optional (campaign tracking only)
- Requires HTTPS (localhost excepted)

# Changelog

All notable changes to `@beacio/mcp` will be documented in this file.

## 2.0.0 — 2026-06-16

- BREAKING (MCP resource URIs): the resource URI scheme was renamed `ioswebble://` → `beacio://`. Every exposed resource now resolves under the `beacio://` scheme (`beacio://docs/quickstart`, `beacio://docs/api`, `beacio://profiles`, `beacio://uuids`, `beacio://errors`, `beacio://schema`, `beacio://changelog`). Update any cached resource URIs to the new scheme.
- The server identity (`com.beacio/mcp`) and the npm package name (`@beacio/mcp`) are unchanged — only the resource scheme moved. The rename has no shim: there are no consumers reading these URIs, so no dual-export or migration handler is provided.

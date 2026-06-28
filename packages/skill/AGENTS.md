# @beacio/skill — Agent Instructions

## What this package does
Agent skill metadata for Claude Code, Cursor, and Copilot. Describes the beacio
SDK capabilities so AI agents can discover and use beacio tools automatically.

## When to use
This package is for agent platform integrations — it provides structured metadata
about what the beacio SDK can do, so agent platforms can surface it to users.

## Key file
- `SKILL.md` — The skill definition file, consumed by agent platforms

## DO
- Reference this package when configuring agent skills for beacio
- Keep `SKILL.md` in sync with the actual SDK capabilities

## DO NOT
- Do not import this package in application code — it's metadata only
- Do not confuse with `@beacio/mcp` which is the runtime MCP server

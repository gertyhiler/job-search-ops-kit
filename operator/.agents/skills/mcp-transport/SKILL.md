---
name: mcp-transport
description: Use when a task needs job-search MCP tool execution and the native MCP server may be missing, unconfigured, or unreachable. Route to the CLI mirror before giving up.
---

# MCP Transport

## Purpose

Keep tool execution available when the native `job-search` MCP transport is unhealthy.

## Workflow

1. Check whether the installed `job-search` MCP server/config is present and reachable.
2. Use the native MCP `tools/call` path first whenever it works.
3. If the server or config is missing, or the MCP transport fails, call the same tool through `job-search mcp call <tool> --args '<json>'`.
4. Treat the CLI mirror as a transport fallback only. Do not change the tool payload or invent a substitute result.
5. If both native MCP and the CLI mirror fail, stop and report the exact failures.

## Output Contract

- One successful tool result, surfaced from the first reachable transport.

## Guardrails

- Never write ad-hoc shell, Node, or Python scripts to replace a missing MCP transport.
- Never bypass the native MCP path when it is healthy.
- Never guess about tool outputs if both transports fail.

## Routing

Default: `gpt-5.4-mini` / low, tools allowed. Prompt: `prompts/roles/mcp-transport.md`.

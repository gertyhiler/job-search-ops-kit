# Technology Stack

## Implemented Today

- TypeScript on Node.js 22+ in ESM mode
- `pnpm` workspace + Turborepo + TS project references
- Next.js 16 App Router control plane with standalone output for the installed runtime
- native `node:sqlite` for the first projection slice
- Node test runner + deterministic validation scripts
- operator bundle build/install/update scripts
- content-length stdio MCP server for the installed runtime
- installed runtime role runner with model-policy routing and schedule sweeps
- supervised control-plane run metadata and log files under the external state root
- supervised application workflow tools and pages for manual review/outbox/apply evidence
- rendered `.codex/config.toml` for Codex-first operator usage

## Architectural Position

- The source repo is for development only.
- The installed operator app is a separate workspace bundle under `~/.local/opt/job-search`.
- External roots follow an XDG-style split for config, data, state, and cache.

## Near-Term Layers

- Codex-first onboarding (chat-first operator UX)
- attended browser integration (human-in-the-loop)
- richer supervised orchestration + session logs

## Current Constraint

The installed bundle now ships the MCP/runtime substrate, first usable control plane slice, and supervised application loop. Codex-first onboarding, session-level orchestration UX, and attended browser flows are the next milestones; full unattended automation remains later.

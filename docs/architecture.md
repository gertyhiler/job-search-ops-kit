# Architecture

## 1. Two Workspaces, Not One

`job-search-ops-kit` now has two explicitly different environments:

- **Developer workspace** — the source repo. Used for source edits, `pnpm dev`, HMR, tests, docs, CLI/debugging, and developer-only skills.
- **Installed operator runtime** — the installed app bundle at `~/.local/opt/job-search`. Used for runtime `.agents/skills`, runtime AGENTS, MCP wiring, role execution, and production agent sessions.

The source repo must not behave like the operator runtime merely because it is open in an AI tool.

## 2. External Roots

The installed operator runtime uses external roots:

- app: `~/.local/opt/job-search`
- config: `~/.config/job-search`
- data: `~/.local/share/job-search`
- state: `~/.local/state/job-search`
- cache: `~/.cache/job-search`
- launchers: `~/.local/bin`

Path helpers in `packages/core/paths.ts` now default to these roots. Repo-local `user-data/` is only an explicit local override for tests or development experiments.

## 3. Source Layout

Relevant source-owned layers:

- `AGENTS.md` — developer contract for this repo.
- `.agents/skills/` — developer-only skills.
- `operator/AGENTS.md` — source form of the installed operator contract.
- `operator/.agents/skills/` — source form of production/operator skills.
- `operator/.codex/`, `operator/.cursor/` — runtime MCP templates rendered during install.
- `prompts/`, `automations/`, `routing/`, `schemas/`, `config/defaults/` — shared assets copied into the installed app bundle.
- `packages/core`, `packages/db`, `packages/cli`, `packages/mcp-server`, `packages/runtime`, `packages/browser-automation` — code foundation shipped into the operator bundle.

## 4. Operator Bundle Pipeline

The operator bundle is assembled from source via:

- `pnpm run build:operator`
- `pnpm run install:operator`
- `pnpm run update:operator`

The bundle contains only runtime-relevant assets and code. It must not depend on the source repo after installation.

Install/update responsibilities:

- copy the runtime bundle into `~/.local/opt/job-search`;
- initialize config/data/state roots;
- scaffold runtime settings and private env file under `~/.config/job-search`;
- render runtime MCP config into the installed app;
- create launchers in `~/.local/bin`;
- migrate/replay the SQLite projection against the external roots.

## 5. Data and State Ownership

- `~/.local/share/job-search` owns durable user memory, evidence, inbox, and long-lived job-search data.
- `~/.local/state/job-search` owns SQLite, audit logs, browser profiles, and other mutable runtime state.
- The DB remains rebuildable from files and events; it is not the source of truth.

## 6. Future Runtime Layers

The later milestones still add, but with a **Codex-first** priority:

- chat-first onboarding and supervised role workflows inside the Codex app,
- attended browser flows (human does login/2FA; agent drives the session),
- stronger observability (session logs + audit + evidence),
- optional control-plane UX refinement for supervision and review,
- only later: unattended/background automation and safety-gated apply flows.

The difference after this pivot is that those capabilities land in the **installed operator app**, not in the dev repo as an implicit runtime.

## 7. Codex App as Orchestrator

In the Codex-first phase, the operator runtime is primarily used by:

1. opening `~/.local/opt/job-search` in the Codex app,
2. running chat-first workflows that call MCP tools and write memory artifacts,
3. using the control plane as an observation surface and for supervised confirmations.

The operator bundle ships `.codex/config.toml` and runtime `.agents/skills` so Codex can route tasks to the right role guidance and tool calls without the developer workspace being involved.

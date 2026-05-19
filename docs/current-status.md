# Current Status

This repo already contains the source-form foundation for the system, but the roadmap has been rebaselined around a new architectural rule: **the source repo is developer mode only; the installed operator runtime is a separate workspace**.

## Already Implemented

- shared prompts, routing policy, schemas, defaults, and synthetic fixtures;
- `packages/core` path/bootstrap primitives with external roots;
- `packages/db` SQLite schema, migrations, replay, and recovery path;
- `packages/cli` technical DB commands plus installed-runtime `mcp serve`, `runtime run`, and `runtime tick`;
- installed `packages/mcp-server` with deterministic read/write tools for runtime memory and projection refresh;
- installed `packages/runtime` with role registry, model-policy resolution, adapter contracts, schedule sweep, and `agent_run` audit writes;
- installed `packages/control-plane` Next.js app with dashboard, schedules, run detail, supervised `runtime run` / `runtime tick` triggers, and the M5.2 supervised application queue;
- installed service manager commands: `job-search start`, `job-search stop`, `job-search status`, and `job-search logs`;
- Codex-first M6 foundation: `onboarding` role/skill, operator status/bootstrap commands, MCP onboarding tools, session-log tool, and installed Codex hook entrypoints;
- attended Playwright MCP template for supervised browser sessions; channel-specific browser apply recipes are still `M7`;
- installed browser-automation MCP stub remains explicitly blocked for unattended automation;
- validation and privacy guard scripts;
- source-form operator assets under `operator/`;
- build/install/update scripts for the operator bundle.

## Canonical Runtime Layout

- app bundle: `~/.local/opt/job-search`
- launchers: `~/.local/bin/job-search*`
- config and secrets: `~/.config/job-search`
- user data and memory: `~/.local/share/job-search`
- mutable runtime state: `~/.local/state/job-search`
- cache: `~/.cache/job-search`

The synthetic `examples/user-data-example/` tree remains a fixture source only. It is not the model for real operator installation.

## Active Direction

The roadmap is now:

1. `M1` Dev/operator separation and external path contract.
2. `M2` Operator bundle, installer, updater, and launcher contract.
3. `M3` Installed runtime foundation: bootstrap/DB/CLI against external roots.
4. `M4` Installed MCP server and runtime roles.
5. `M5.1` First usable control plane: dashboard, schedules, run detail, supervised dry-run triggers.
6. `M5.2` Supervised application loop: candidate vacancies, draft packages, review gate, manual outbox, applied evidence.
7. `M6` **Codex-first onboarding and chat-first operator UX** (foundation implemented; primary orchestrator is the Codex app).
8. `M7` **Attended browser workflows** (human-in-the-loop apply; no unattended submissions).
9. `M8` Background automation and self-learning hardening (after the supervised flow is proven).

In this phase, the Next.js control plane remains a supporting observation/supervision surface. The Codex app chat is the primary operator surface.

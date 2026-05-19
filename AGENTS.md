# Developer Contract — job-search-ops-kit

This repository is the **developer workspace** for building `job-search-ops-kit`.

It is not the production operator runtime.

## Workspace Role

- Use this repo for source changes, architecture work, schema work, tests, docs, `pnpm dev`, HMR, frontend debugging, and compatible backend debugging.
- Direct CLI/script runs are allowed here when they do not depend on runtime `.agents/skills`, runtime MCP wiring, or “chat with the agent inside the operator directory” behavior.
- Do not treat this repo as the installed operator app.

## Source vs Installed Runtime

- Root `AGENTS.md` and root `.agents/skills/` are **developer-only**.
- Production/operator skills live in source form under `operator/.agents/skills/`.
- The installer copies those production skills into the installed operator app under `~/.local/opt/job-search`.
- MCP-backed orchestration, runtime role execution, and production agent conversations belong in the installed operator app, not in this source repo.

## External Storage Contract

- App bundle: `~/.local/opt/job-search`
- Launchers: `~/.local/bin/job-search*`
- Config and secrets: `~/.config/job-search`
- User memory, evidence, inbox, long-lived data: `~/.local/share/job-search`
- Mutable runtime state, SQLite projection, browser profiles, audit, health: `~/.local/state/job-search`
- Cache and disposable scratch: `~/.cache/job-search`

The source repo may still use temporary local overrides such as repo-local `user-data/` for explicit tests or experiments, but that is not the default runtime topology anymore.

## Working Rules

- Keep repo guidance compact and developer-oriented.
- Keep runtime/operator behavior in `operator/` assets, not in always-on root instructions.
- Never store personal job-search data in tracked source files.
- Never wire the dev repo so that opening it implicitly becomes operator mode.
- If a behavior needs runtime `.agents/skills`, runtime MCP config, or runtime session hooks, implement it in the installed operator app contract, not in the dev workspace contract.

## Key Source Locations

- Developer-only skills: `.agents/skills/`
- Operator runtime assets in source form: `operator/`
- Shared prompts and policies: `prompts/`, `automations/`, `routing/`, `schemas/`, `config/defaults/`
- Source packages: `packages/`
- Documentation/spec: `docs/`

See [docs/README.md](docs/README.md) for the current architecture, roadmap, and installation model.

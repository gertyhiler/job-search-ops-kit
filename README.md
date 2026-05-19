# job-search-ops-kit

Self-hosted AI-ops kit for job search with a hard split between:

- a **developer workspace** (this repo), and
- an **installed operator runtime** at `~/.local/opt/job-search`.

The source repo is for code/spec work, `pnpm dev`, HMR, tests, `pnpm run control-plane:dev`, and developer-only skills. The installed operator runtime is for MCP-backed orchestration, production `.agents/skills`, role execution, the shipped Next.js control plane, and “chat with the agent inside the directory” behavior.

## Codex-first Orchestration (Current Direction)

The installed operator runtime is designed to be operated **from the Codex app**:

- open `~/.local/opt/job-search` in Codex,
- chat-first workflow orchestrates skills + MCP tools + hooks,
- first-run onboarding is handled by the installed `onboarding` skill plus MCP tools (`get_operator_status`, `bootstrap_operator`, `write_onboarding_profile`, `write_session_log`),
- the Next.js control plane is a supporting surface for observation and supervised confirmations (not the primary orchestrator),
- full unattended automation is a later milestone after the human-in-the-loop flow is proven.

## Runtime Layout

- app bundle: `~/.local/opt/job-search`
- launchers: `~/.local/bin/job-search*`
- config and secrets: `~/.config/job-search`
- user memory, evidence, inbox: `~/.local/share/job-search`
- mutable runtime state, DB, browser profiles, audit: `~/.local/state/job-search`
- cache: `~/.cache/job-search`

## Status

The source-form foundation already exists: core path/bootstrap helpers, SQLite schema/migrations, deterministic replay, technical CLI, prompts, schemas, defaults, synthetic fixtures, the operator bundle pipeline, the M5 control plane/application loop, and the M6 Codex-first onboarding foundation. The active roadmap is now rebaselined around dev/operator separation and the installed runtime workflow. See [docs/current-status.md](docs/current-status.md) and [docs/implementation-roadmap.md](docs/implementation-roadmap.md).

## Quick Map

- [docs/README.md](docs/README.md) — documentation index.
- [docs/current-status.md](docs/current-status.md) — what is already implemented and what the new milestone sequence is.
- [docs/functional-spec.md](docs/functional-spec.md) — system behavior and environment boundaries.
- [docs/architecture.md](docs/architecture.md) — developer repo vs installed operator runtime architecture.
- [docs/getting-started.md](docs/getting-started.md) — current developer flow and operator install/update flow.
- [docs/codex-first.md](docs/codex-first.md) — chat-first operator workflow in the Codex app.
- [docs/privacy.md](docs/privacy.md) — storage and leak-guard policy.
- [AGENTS.md](AGENTS.md) — developer-only contract for this repo.
- [operator/AGENTS.md](operator/AGENTS.md) — production/operator contract in source form.

## Key Principles

- **Developer mode is not operator mode.** Opening the source repo must not implicitly become a production runtime session.
- **Installed runtime is isolated.** Production skills, runtime AGENTS, and MCP configs are installed into a separate workspace bundle.
- **Files are the source of truth.** Memory and events live under `~/.local/share/job-search`; the SQLite projection under `~/.local/state/job-search` is rebuildable.
- **External state stays out of git.** Personal data, browser profiles, audit logs, and secrets are never part of the source repo.

## Credits

Inspired by [santifer/career-ops](https://github.com/santifer/career-ops) and a private learning-base pattern that informed the memory contract. Uses the [JSON Resume](https://jsonresume.org/) schema.

## License

MIT (see [LICENSE](LICENSE)).

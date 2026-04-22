# job-search-ops-kit

Self-hosted AI-ops kit for job search. Agent roles (scout, tailor, reviewer, applier, strategist, interviewer, memory-manager, analyst, negotiator, support) orchestrate over a file-first memory layer and a SQLite projection. A Next.js 16 dashboard and a CLI/TUI (Ink) sit on top. Designed to be observable, self-learning, and strictly privacy-respecting.

## Status

Milestone 1 — normalised skeleton. Public zone (prompts, skills, schemas, routing, automations, docs) is in place. Application code (`packages/*`) arrives from Milestone 3 onward. See [docs/implementation-roadmap.md](docs/implementation-roadmap.md).

## Quick Map

- [docs/README.md](docs/README.md) — documentation index.
- [docs/functional-spec.md](docs/functional-spec.md) — what the system does.
- [docs/architecture.md](docs/architecture.md) — how it fits together.
- [docs/tech-stack.md](docs/tech-stack.md) — pinned stack.
- [docs/database-schema.md](docs/database-schema.md) — entities and event sourcing.
- [docs/self-learning.md](docs/self-learning.md) — autonomous strategy consolidation.
- [docs/privacy.md](docs/privacy.md) — zones, leak guards, generic-by-default invariants.
- [docs/getting-started.md](docs/getting-started.md) — onboarding (stub until `js init` lands).
- [AGENTS.md](AGENTS.md) — the contract every agent operating in this repo follows.

## Key Principles

- **Two zones.** Public system code lives in this repo; personal data lives only in `user-data/` (gitignored). A fresh `git clone` never contains personal information.
- **Files are the source of truth.** SQLite is a projection that can be rebuilt from `user-data/memory/events/*.jsonl` + file memory.
- **Autonomous strategy.** Weekly strategist proposes changes; a deterministic MCP evaluator auto-accepts reversible low-risk ones and escalates the rest.
- **Evidence for every side effect.** Applications, strategy changes, and agent spawns all leave auditable trails.

## Credits

Inspired by [santifer/career-ops](https://github.com/santifer/career-ops) (the mental prototype with loadable skill modes and batch processing) and a private learning-base pattern that informed the memory contract. Uses the [JSON Resume](https://jsonresume.org/) schema. MCP integrations include [gmen1057/headhunter-mcp-server](https://github.com/gmen1057/headhunter-mcp-server) and, optionally, [stickerdaniel/linkedin-mcp-server](https://github.com/stickerdaniel/linkedin-mcp-server).

## License

MIT (see [LICENSE](LICENSE) — added in the next commit).

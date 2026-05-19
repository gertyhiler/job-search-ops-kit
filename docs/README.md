# Documentation

This directory is the living spec for `job-search-ops-kit` after the dev/operator split.

## Map

- [current-status.md](./current-status.md) — completed foundation work plus the active post-pivot milestone sequence.
- [functional-spec.md](./functional-spec.md) — environment boundaries, role/runtime rules, and filesystem contract.
- [architecture.md](./architecture.md) — how the developer repo, installed operator app, and external roots fit together.
- [getting-started.md](./getting-started.md) — current developer flow and operator install/update flow.
- [codex-first.md](./codex-first.md) — Codex app as the primary operator orchestrator.
- [implementation-roadmap.md](./implementation-roadmap.md) — active milestones after the separation decision.
- [privacy.md](./privacy.md) — what lives in config/data/state/cache and what must never leak into source control.
- [database-schema.md](./database-schema.md) — SQLite projection, memory files, and state-root ownership.
- [tech-stack.md](./tech-stack.md) — current technical choices and launch policy.
- [self-learning.md](./self-learning.md) — long-loop behavior after the operator runtime grows MCP and automation support.
- [first-brief-template.md](./first-brief-template.md) — template saved into the external data root, not into the repo.

## Conventions

- Root [AGENTS.md](../AGENTS.md) is the **developer** contract for this repo.
- [operator/AGENTS.md](../operator/AGENTS.md) is the source-form **operator** contract that the installer ships into the installed app.
- Runtime defaults refer to:
  - `~/.local/opt/job-search`
  - `~/.config/job-search`
  - `~/.local/share/job-search`
  - `~/.local/state/job-search`
  - `~/.cache/job-search`

# Documentation

This directory is the specification of `job-search-ops-kit`. It is the single source of truth for the intent and shape of the system — all in-repo code, prompts, schemas, and automations are expected to align with the documents below.

## Map

- [functional-spec.md](./functional-spec.md) — what the system does: roles, automations, vacancy lifecycle, safety rails, "where things live".
- [architecture.md](./architecture.md) — how the pieces fit: zones, paths resolver, MCP layer, Next.js app, dataflow diagrams.
- [tech-stack.md](./tech-stack.md) — the pinned stack (frameworks, libraries, versions, policies).
- [database-schema.md](./database-schema.md) — SQLite tables, file memory structure, event sourcing invariant.
- [self-learning.md](./self-learning.md) — autonomous strategy consolidation, observability, why seed analysis exists.
- [implementation-roadmap.md](./implementation-roadmap.md) — milestones M0–M8, strategy of execution.
- [privacy.md](./privacy.md) — zone A vs zone B, leak guards, generic-by-default invariants.
- [getting-started.md](./getting-started.md) — onboarding path (stub until M3 lands `js init`).
- [first-brief-template.md](./first-brief-template.md) — structured brief the first-time user fills in.
- [diagrams/architecture.md](./diagrams/architecture.md) — end-to-end flow.
- [diagrams/vacancy-lifecycle.md](./diagrams/vacancy-lifecycle.md) — life of a single vacancy.

## Conventions

- All cross-references inside `docs/` are relative paths to this repo.
- No paths outside the repo appear in these documents.
- External references are limited to public resources (library docs, inspiring OSS projects) and cited in the Credits section of the root README.
- When code and docs diverge, the docs are authoritative for intent; code changes follow.

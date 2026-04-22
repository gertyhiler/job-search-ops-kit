# Architecture

This document describes how the system is organised. The "what" is in [functional-spec.md](./functional-spec.md). The pinned stack is in [tech-stack.md](./tech-stack.md).

## 1. Two Zones

The repository is strictly split into two zones:

- **Zone A — system (git-tracked, public).** Code, prompts, role skills, schemas, config defaults, examples, documentation. No personal data, ever.
- **Zone B — user data (gitignored).** Resume, brief, vacancies, applications, events, browser profiles, OAuth tokens. Lives under `user-data/` (or a custom path via `JOB_SEARCH_DATA_DIR`).

A user who wants multi-device sync can initialise a private git inside `user-data/`. The system works the same way in both cases.

## 2. Public Repository Layout

```
job-search-ops-kit/
├── README.md
├── LICENSE                              # MIT
├── AGENTS.md                            # contract for any agent operating here
├── CONTRIBUTING.md
├── .env.example                         # skeleton for OAuth, API keys
├── .gitignore                           # enforces user-data/, .env.local, *.db, runtime/
│
├── .cursor/
│   ├── rules/                           # policy (rate limits, never-send-without-review)
│   ├── hooks/                           # session-end → ingest → update_performance
│   └── mcp.example.json
├── .codex/
│   ├── hooks/
│   └── mcp.example.json
├── .agents/skills/                      # loadable role skills (10 roles)
│
├── prompts/
│   ├── roles/                           # 10 role prompts, generic with placeholders
│   └── session-types/
├── routing/model-policy.yaml
├── automations/                         # prompt sidecars for scheduled roles
│
├── schemas/                             # JSON Schema contracts
│
├── config/defaults/                     # defaults copied into user-data/ on init
│   ├── active-strategy.template.yaml
│   ├── escalation-rules.defaults.yaml
│   ├── schedules.seed.yaml
│   ├── resume-theme.defaults.yaml
│   └── browser-recipes/
│
├── scripts/                             # thin deterministic scripts, no LLM
│
├── packages/                            # (populated from M3 onwards)
│   ├── core/                            # types + use cases, no I/O
│   ├── db/                              # Drizzle schema + migrations
│   ├── mcp-server/                      # the job-search MCP server
│   ├── cli/                             # Ink TUI + js init, js today, js tick
│   ├── web/                             # Next.js 16 dashboard
│   ├── agents/                          # role configs (prompt + model + mcp profile)
│   └── browser-automation/              # Playwright wrapper, recipes
│
├── deploy/
│   └── launchd/                         # optional tick plist example
│
├── examples/
│   └── user-data-example/               # anonymous synthetic profile for tests/docs
│
└── docs/                                # this directory
```

## 3. `user-data/` Layout (gitignored)

Created automatically by `js init`. Can live next to the clone or under `$XDG_DATA_HOME/job-search/` — path resolved via `JOB_SEARCH_DATA_DIR` in `.env.local`.

```
user-data/
├── .env.local                           # OAuth tokens, API keys
├── brief.md                             # user's filled brief
├── config/                              # overrides over config/defaults/
│   ├── active-strategy.yaml
│   ├── escalation-rules.yaml
│   ├── model-policy.overrides.yaml
│   └── browser-recipes/
├── memory/
│   ├── profile/                         # candidate.md, constraints.md, preferences.md, master-resume.json
│   ├── strategy/                        # decision-log.jsonl, change-proposals/
│   ├── vacancies/
│   ├── applications/
│   ├── resumes/variants/, renders/
│   ├── events/application-events.jsonl
│   ├── journal/YYYY/
│   ├── evidence/
│   ├── performance/
│   ├── reviews/queue.jsonl
│   └── dashboards/
├── runtime/                             # purely local
│   ├── job-search.db                    # SQLite (rebuildable)
│   ├── audit/agent_runs.jsonl
│   ├── browser-profiles/                # cookies/tokens! never share
│   └── health/
└── inbox/                               # drop-zone for raw emails / screenshots
```

## 4. Path Resolution

All code reaches `user-data/` through `resolvePath(kind, name)` in `packages/core/paths.ts`. The resolver reads `JOB_SEARCH_DATA_DIR` from the environment (default `./user-data`). Tests point it at `examples/user-data-example/`. This keeps the code generic — it does not know whose data it processes.

## 5. MCP Layer

Registered in `.codex/mcp.json` (scheduled agents) and `.cursor/mcp.json` (interactive sessions):

- `headhunter` — OAuth-based hh.ru MCP server.
- `linkedin` — optional scraping MCP, used only in manual sessions.
- `browser-attended` — Playwright / browser-use MCP attached to the user's live browser tab via CDP. Cursor-only.
- `browser-unattended` — thin Playwright wrapper in `packages/browser-automation/` with persistent `userDataDir` per site under `user-data/runtime/browser-profiles/`. Codex-only.
- `job-search` — this repo's MCP server in `packages/mcp-server`. Single write-path into the DB, event log, memory, strategy, schedules.

`job-search` MCP tools:

- applications: `list_vacancies(filter)`, `get_vacancy(id)`, `create_application(...)`, `log_event(application_id, kind, payload)`, `get_application_pack(id)`.
- analytics: `get_funnel(period)`, `next_actions(horizon)`, `search_performance(question)`.
- strategy: `propose_strategy_change`, `auto_decide_strategy(proposal)`, `apply_strategy_change(proposal, decision)`, `rollback_strategy(version)`.
- memory: `ingest_session(transcript)`, `extract_events(journal_entry)`, `update_performance()`.
- scheduler: `list_schedules()`, `trigger_schedule(id)` (manual re-run), `promote_to_live(id)`.

## 6. Dataflow

See [diagrams/architecture.md](./diagrams/architecture.md) for the end-to-end mermaid diagram.

Core invariants:

- File memory (under `user-data/memory/`) is the source of truth for narrative and events.
- SQLite is a projection. Delete it → event replay rebuilds it from `application-events.jsonl` + file contents.
- Every action an agent takes goes through the `job-search` MCP server → auditable in `agent_run` and in `runtime/audit/*.jsonl`.
- No agent edits `active-strategy.yaml` directly. Strategy changes always flow: propose → decide → apply → log.

## 7. Next.js App Boundaries

See [functional-spec.md §2.4](./functional-spec.md) for scope. Architecturally:

- Pages are server components reading SQLite directly for list views and file memory for detail.
- The scheduler sweep lives in `src/server/scheduler/` inside `packages/web`.
- Auth: Better Auth, single user, multi-device-ready.
- Subprocess spawner launches `codex exec` with the correct model, prompt, and MCP profile, then parses the JSON stream of events to record an `agent_run`.

## 8. CLI

The Ink-based CLI in `packages/cli` does three things:

- `js init` — first-time bootstrap wizard (M3): creates `user-data/`, copies defaults, ingests resume, writes `brief.md`, seeds schedules, runs migrations.
- `js today`, `js apply`, `js funnel`, etc. — quick operator commands that talk to the `job-search` MCP server.
- `js tick` — triggers a scheduler sweep without the Next.js app being up. Talks to SQLite directly.

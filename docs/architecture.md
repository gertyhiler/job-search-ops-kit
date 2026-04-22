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
│   ├── runner-adapters/                 # Codex CLI / Cursor CLI / future adapters
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
│   ├── runtime-settings.yaml
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

## 5. Runner Adapter Layer

Model execution is adapter-based. The user chooses one global `selected_runner_adapter` in `user-data/config/runtime-settings.yaml`, and the system uses that adapter for every model-backed run unless the task is `script-only`.

Runner adapter contract:

- Input: `role`, `task_kind`, `prompt_ref`, `context refs`, `tool profile`, `routing decision`, `run_mode`.
- Output: `status`, `stdout/trace ref`, `tool_calls summary`, `artifacts`, `exit_code`, `started_at`, `finished_at`.
- Capabilities: `tools`, `pty_terminal`, `session_hooks`, `browser_attended`, `browser_unattended`, `json_event_stream`.

Run modes:

- `background` — app/scheduler launches a fire-and-forget run with durable audit.
- `supervised` — app/backend owns a PTY-backed terminal process, streams it to the browser UI, and can continue/stop/kill/retry or open the work externally.
- `interactive_external` — the user works in Codex App, Cursor App, or another compatible client directly, then the run is ingested via hooks / structured summary.
- `script_only` — deterministic scripts bypass the model runner entirely.

The router runs after adapter selection and before spawn. It chooses execution policy, not CLI provider.

## 6. MCP Layer

MCP servers are consumed through the selected runner adapter and through the app/backend runtime. Tool-specific config files such as `.codex/mcp.json` and `.cursor/mcp.json` remain supported thin adapters for the same underlying capability set.

- `headhunter` — OAuth-based hh.ru MCP server.
- `linkedin` — optional scraping MCP, used only in manual sessions.
- `browser-attended` — Playwright / browser-use MCP attached to the user's live browser tab via CDP. Available when the chosen run mode and adapter capabilities support attended browser work.
- `browser-unattended` — thin Playwright wrapper in `packages/browser-automation/` with persistent `userDataDir` per site under `user-data/runtime/browser-profiles/`. Used by the local backend runtime for vetted unattended flows.
- `job-search` — this repo's MCP server in `packages/mcp-server`. Single write-path into the DB, event log, memory, strategy, schedules.

`job-search` MCP tools:

- applications: `list_vacancies(filter)`, `get_vacancy(id)`, `create_application(...)`, `log_event(application_id, kind, payload)`, `get_application_pack(id)`.
- analytics: `get_funnel(period)`, `next_actions(horizon)`, `search_performance(question)`.
- strategy: `propose_strategy_change`, `auto_decide_strategy(proposal)`, `apply_strategy_change(proposal, decision)`, `rollback_strategy(version)`.
- memory: `ingest_session(transcript_or_summary)`, `extract_events(journal_entry)`, `update_performance()`.
- scheduler: `list_schedules()`, `trigger_schedule(id)` (manual re-run), `promote_to_live(id)`.

## 7. Dataflow

See [diagrams/architecture.md](./diagrams/architecture.md) for the end-to-end mermaid diagram.

Core invariants:

- File memory (under `user-data/memory/`) is the source of truth for narrative and events.
- SQLite is a projection. Delete it → event replay rebuilds it from `application-events.jsonl` + file contents.
- Every action an agent takes goes through the `job-search` MCP server → auditable in `agent_run` and in `runtime/audit/*.jsonl`.
- No agent edits `active-strategy.yaml` directly. Strategy changes always flow: propose → decide → apply → log.
- Every model-backed run goes through the selected runner adapter unless the task is explicitly `script_only`.
- Every routing decision is captured before spawn and stored with the resulting `agent_run`.

## 8. Next.js App Boundaries

See [functional-spec.md §2.4](./functional-spec.md) for scope. Architecturally:

- Pages are server components reading SQLite directly for list views and file memory for detail.
- The scheduler sweep lives in `src/server/scheduler/` inside `packages/web`.
- Auth: Better Auth, single user, multi-device-ready.
- The app is the control plane, not the primary conversational runtime.
- The local backend runtime owns supervised terminal sessions on the user's machine.
- The subprocess spawner launches the selected runner adapter with the routed model/prompt/tool profile, then records the resulting `agent_run`.
- For supervised runs, the app keeps the PTY handle, streams terminal output to the UI, surfaces approvals/prompts, and can stop/kill/retry or open the task externally.

## 9. CLI

The Ink-based CLI in `packages/cli` does three things:

- `js init` — first-time bootstrap wizard (M3): creates `user-data/`, copies defaults, ingests resume, writes `brief.md`, seeds schedules, runs migrations.
- `js today`, `js apply`, `js funnel`, etc. — quick operator commands that talk to the `job-search` MCP server.
- `js tick` — triggers a scheduler sweep without the Next.js app being up. Talks to SQLite directly.

External CLIs such as Codex CLI and Cursor CLI are not the architecture's source of truth. They are adapter implementations that the system may launch, supervise, or ingest.

# Functional Specification

This document describes what the system does. Architecture (how) lives in [architecture.md](./architecture.md), stack in [tech-stack.md](./tech-stack.md), schema in [database-schema.md](./database-schema.md).

## 1. Purpose

Self-hosted AI-ops kit for job search. The system:

- Monitors job boards and career pages against an active strategy.
- Prepares tailored application packages (resume variant, cover letter, screening answers).
- Gates packages against the master resume before they go out.
- Submits through the correct channel (hh, LinkedIn, career pages via Playwright).
- Records every side effect as an event with evidence.
- Consolidates strategy autonomously, without blocking on human accept.
- Surfaces observability through a single-user web dashboard.

The first-party user is the candidate themselves — there is no multi-tenant aspect. Data is local by default.

## 2. Responsibility Boundaries: Where Things Live

Source of truth: the question "where does X belong?" Everything else follows.

### 2.1 Config files (git-tracked, human-edited, reviewed by diff)

Changed rarely, discussed, authoritative for **policies and prompts**.

- `routing/model-policy.yaml` — per-role, per-task model selection.
- `prompts/roles/*.md`, `automations/*.md` — role prompts and scheduled flows.
- `user-data/memory/strategy/active-strategy.yaml` — current strategy (ICP, tactics, KPIs, hypotheses). Mutated by strategist via `apply_strategy_change` + git commit.
- `config/defaults/escalation-rules.defaults.yaml` (public) + `user-data/config/escalation-rules.yaml` (user override).
- `user-data/memory/strategy/schedules.seed.yaml` — initial schedule seed for the DB at bootstrap.
- `packages/browser-automation/recipes/<site>.yaml` — per-site recipe (mode A/B, steps, selectors).
- `user-data/memory/resumes/theme-defaults.yaml` + variant JSON files — PDF theme + JSON Resume patches.
- `schemas/*.schema.json` — contracts.
- `.codex/mcp.json`, `.cursor/mcp.json` — MCP server lists and profiles.

### 2.2 SQLite DB (hot mutable state + projection over files)

Anything that (a) UI/agents query often, (b) changes daily, (c) needs runtime counters/timestamps.

- `vacancy`, `application`, `application_event`, `resume_version`, `cover_letter`, `interview` — projections over files for fast queries. Fully rebuildable from `user-data/memory/events/*.jsonl` via replay.
- `agent_run` — audit of every Codex/Cursor spawn.
- `schedule` — runtime state (`next_run_at`, `last_run_at`, `fails_in_a_row`, `enabled`, `dry_run`). Seeded from `schedules.seed.yaml`, mutated by sweeps.
- `strategy_change` — index of applied proposals. Truth is `decision-log.jsonl`.

**Invariant:** the DB contains no unique data. Delete `*.db`, rebuild from files and events.

### 2.3 File memory (git-tracked in `user-data/` — private, append-only or narrative)

Anything that diffs meaningfully, is readable by a human, belongs as history.

- `user-data/memory/profile/` — `candidate.md`, `constraints.md`, `preferences.md`, `master-resume.json`.
- `user-data/memory/vacancies/<id>.md` — JD snapshot + our notes.
- `user-data/memory/applications/<id>/` — rendered resume PDF, letter, answers.
- `user-data/memory/resumes/variants/*.json`, `renders/*.pdf`.
- `user-data/memory/events/application-events.jsonl` — append-only SSoT for lifecycle.
- `user-data/memory/journal/<YYYY>/` — session narratives.
- `user-data/memory/evidence/` — screenshots, JD snapshots, raw emails.
- `user-data/memory/performance/*.yaml` — derived from events, committed for readable diff.
- `user-data/memory/reviews/queue.jsonl` — follow-up queue (append-only).
- `user-data/memory/strategy/decision-log.jsonl` — append-only log of applied proposals.
- `user-data/memory/strategy/change-proposals/<id>.yaml` — individual proposals.
- `user-data/memory/dashboards/today-context.md`, `funnel.md`, `weekly-summary.md` — generated.

### 2.4 Web app — purpose and scope

Purpose: a single UI for observation + managing things that are painful in YAML. Not a place for agent business logic or policy content.

Pages (read-mostly):
- **Today** — next actions, `today-context.md`, due tasks.
- **Pipeline** — kanban by application status.
- **Funnel** — response rate, conversion, timeseries.
- **Applications / Vacancies / Resumes** — filters, search, detail views.
- **Strategy** — history of change-proposals, diff view, rollback button.
- **Schedules** — toggle enabled/dry-run, edit cron, manual trigger, promote to live.
- **Agent Runs** — stream of spawns with filters, changed_paths diff, stdout artifact link.

Also host: the scheduler sweep (when the process is live) and single-user auth.

Out of scope for the app:
- Editing prompts, `model-policy.yaml`, `active-strategy.yaml`, browser recipes — these are files under git, edited in IDE.
- Running interactive agent chat — that happens in Codex/Cursor.
- Re-implementing MCP tools — the app consumes the `job-search` MCP server for reads.

### 2.5 Codex / Cursor chat

Interactive agent work always lives in chat. Scenarios:

- Ad-hoc Q&A: "what is the status of vacancy X", "analyze the funnel", "why no fintech replies".
- High-stakes manual apply: run `tailor` → `reviewer` → `applier` from chat with full visibility.
- Creating and debugging browser recipes in attended mode.
- Strategy brainstorm with the strategist role; final proposal is applied via MCP.
- Prompt iteration: edit prompt in IDE, run `codex exec`, inspect traces.

Every chat emits events via the session-end hook: `ingest_session` captures the transcript into `user-data/memory/journal/`, `extract_events` converts relevant moments into events. Nothing is lost, not even interactive chat.

## 3. Roles (10)

Each role has a prompt in `prompts/roles/<role>.md`, a loadable skill in `.agents/skills/<role>/SKILL.md`, and a default model in `routing/model-policy.yaml`.

| Role | Task | Default Model |
|---|---|---|
| `scout` | Daily monitoring, match-scoring, candidate list building. | gpt-5.4-mini / low |
| `strategist` | Weekly/monthly proposals, autonomous auto-decide, no direct mutation. | gpt-5.4 / high |
| `tailor` | Resume variant + cover letter + answers for a specific vacancy. | gpt-5.4-mini / medium |
| `reviewer` | Gate packages before send: hallucinations, tone, JD fit. | gpt-5.4 / medium |
| `applier` | Submit via hh MCP or Playwright; evidence + events. | gpt-5.3-codex / high, tools |
| `interviewer` | Mock technical/behavioral/system-design; live-coding uses codex model. | gpt-5.4-mini / medium |
| `memory-manager` | Classify inbox, rebuild performance, write journal. | gpt-5.4-nano / low (classification); gpt-5.4-mini (journal) |
| `analyst` | Ad-hoc quantitative questions; read-only. | gpt-5.4 / medium |
| `negotiator` | Offer decomposition, counter draft, call script. | gpt-5.4 / high |
| `support` | Fast lookups, reminders, next-actions. | gpt-5.4-mini / low |

Full role contracts in the corresponding `prompts/roles/*.md` files.

## 4. Automations (DB-driven scheduler)

The app is not required to be running 24/7. The scheduler is DB-driven: SQLite `schedule.next_run_at` is the single source of truth. Any trigger (process start, dashboard request, `js tick` from CLI, optional launchd poker) performs a sweep.

Triggers:
1. On Next.js process boot: `POST /internal/scheduler/sweep`.
2. On each dashboard request: middleware dispatches a throttled (1/min) sweep.
3. `js tick` from CLI — works even when the app is not running; the CLI talks to SQLite directly.
4. Optional launchd plist (`com.job-search.tick.plist`, 15–30 min) — convenience, not required.

Catchup policies (per task, field `catchup_policy`):
- `run_once_if_overdue` — default for strategist/monthly-review.
- `skip_if_stale` — if `now() - next_run_at > max_staleness`, move `next_run_at` forward without running (e.g. yesterday's today-context is stale).
- `run_all_missed` — run every missed tick (dependency review and similar).

Coldstart guard: if the app sees more than N overdue tasks at boot, they are queued at a rate limit (default 1/min) so the machine is not overwhelmed.

Runner: `codex exec --model <id> --prompt @prompts/roles/<role>.md --mcp .codex/mcp.json --json`. Cursor is the interactive path for tailor/reviewer/interviewer and debugging.

Baseline schedules (seed in `config/defaults/schedules.seed.yaml`, detailed in `automations/*.md`):

| Cron | Role | Model | Prompt | Catchup | Output |
|---|---|---|---|---|---|
| `0 7 * * *` | scout | gpt-5.4-mini / low | `prompts/roles/scout.md` | skip_if_stale (12 h) | candidates, today-context, push |
| `0 19 * * *` | reviewer (follow-up) | gpt-5.4-mini / low | follow-up flavour | skip_if_stale (24 h) | reminders from reviews queue |
| `0 23 * * *` | memory-manager | gpt-5.4-nano / low | `prompts/roles/memory-manager.md` | run_once_if_overdue | rebuilt performance, inbox → events |
| `0 10 * * 0` | strategist (weekly) | gpt-5.4 / high | `prompts/roles/strategist.md` | run_once_if_overdue | proposal + auto-decide |
| `0 10 1 * *` | strategist (monthly) | gpt-5.4 / high | `prompts/roles/strategist.md` | run_once_if_overdue | monthly review |
| `0 3 */14 * *` | maintainer | gpt-5.4-mini / low | support + maintainer flavour | run_all_missed | dependency proposal |

Session-end hooks (Codex + Cursor) call `ingest_session` → `extract_events` → `update_performance` through the local `job-search` MCP server. It works even when the app is off — the MCP server runs standalone (`job-search mcp serve`) and writes to the same SQLite.

Dry-run default: any new or changed task runs in `dry_run` for the first 3 runs. External side effects are blocked until promoted via **Schedules → Promote to live**.

## 5. Vacancy Lifecycle

See [diagrams/vacancy-lifecycle.md](./diagrams/vacancy-lifecycle.md) for the state diagram. In prose:

1. Scout finds a vacancy on hh/LinkedIn/career page.
2. Scout computes `match_score` against the active strategy; below threshold → archive, above → write `vacancy` file + DB row.
3. Tailor produces `resume_version` + `cover_letter` + `answers` → draft application.
4. Reviewer approves / revises / rejects. On revise the loop returns to tailor.
5. If `auto_send` conditions are met (see Safety Rails) → applier submits. Otherwise the application sits in the review queue for manual approval.
6. Applier submits via the channel's MCP tool or Playwright recipe, writes evidence, emits `application_event(applied)`.
7. Follow-up is scheduled.
8. HR reply arrives → memory-manager classifies → new `application_event` (screened/invited/rejected/…).
9. `update_performance()` rebuilds derived metrics.
10. Strategist's weekly review picks up the new data.

## 6. Safety Rails

1. `dry_run: true` is the default for new or changed automations. `auto_send_when` conditions must be stated in the active strategy before any auto-submission: `match_score ≥ threshold`, `reviewer_confidence ≥ threshold`, channel allowlist, daily cap not exhausted.
2. Rate limits per channel are enforced (hh, career-pages, LinkedIn). Breaching them is a hard stop.
3. Reviewer blocks on: hallucination (not present in master resume), tone mismatch, stop-words, JD gap not honestly addressed.
4. Every side effect leaves evidence: HTTP request/response for hh, before/after screenshots for browser automation, SHA of rendered artefacts.
5. Every resume variant sent is pinned by commit SHA in the `resume_version` row of the application.
6. Strategy changes are reversible: `decision-log.jsonl` + `active-strategy.yaml` under git. `js strategy rollback <version>` restores a previous YAML commit and marks the proposal `reverted`.
7. Escalation: see `config/defaults/escalation-rules.defaults.yaml` for the baseline — constraints/preferences changes, salary floor changes, `reversibility == hard`, more than N changes in a week → `escalate_to_human`.

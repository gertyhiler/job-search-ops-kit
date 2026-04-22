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
- `user-data/config/runtime-settings.yaml` — local runtime settings: selected runner adapter, supervised-run preferences, UI-level approvals policy.
- `user-data/memory/strategy/schedules.seed.yaml` — initial schedule seed for the DB at bootstrap.
- `packages/browser-automation/recipes/<site>.yaml` — per-site recipe (mode A/B, steps, selectors).
- `user-data/memory/resumes/theme-defaults.yaml` + variant JSON files — PDF theme + JSON Resume patches.
- `schemas/*.schema.json` — contracts.
- `.codex/mcp.json`, `.cursor/mcp.json` — MCP server lists and profiles.

### 2.2 SQLite DB (hot mutable state + projection over files)

Anything that (a) UI/agents query often, (b) changes daily, (c) needs runtime counters/timestamps.

- `vacancy`, `application`, `application_event`, `resume_version`, `cover_letter`, `interview` — projections over files for fast queries. Fully rebuildable from `user-data/memory/events/*.jsonl` via replay.
- `agent_run` — audit of every runner-adapter spawn and every external interactive session that is ingested into the system.
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

Purpose: a single browser UI for control-plane concerns: onboarding, observation, approvals, launch/stop/retry, and managing things that are painful in YAML. Not a place for agent business logic or policy content.

Pages (read-mostly):
- **Today** — next actions, `today-context.md`, due tasks.
- **Pipeline** — kanban by application status.
- **Funnel** — response rate, conversion, timeseries.
- **Applications / Vacancies / Resumes** — filters, search, detail views.
- **Strategy** — history of change-proposals, diff view, rollback button.
- **Schedules** — toggle enabled/dry-run, edit cron, manual trigger, promote to live.
- **Agent Runs** — stream of spawns with filters, changed_paths diff, stdout artifact link, and live supervised-run attach.
- **Settings** — selected runner adapter, supervised approvals defaults, and local runtime preferences.

Also host: the scheduler sweep (when the process is live), single-user auth, and the local orchestration runtime that owns supervised terminal sessions on the user's device.

Out of scope for the app:
- Editing prompts, `model-policy.yaml`, `active-strategy.yaml`, browser recipes — these are files under git, edited in IDE.
- Being the primary conversational agent runtime.
- Re-implementing MCP tools — the app consumes the `job-search` MCP server for reads.

### 2.5 Execution surfaces and run modes

The system supports three run modes:

- `background` — fully automatic launch with no user presence. Used by scheduled work and safe deterministic runs.
- `supervised` — the app/backend starts a CLI runner as a PTY-backed terminal process, streams live output, surfaces approvals/prompts, and lets the user `continue`, `stop`, `kill`, `retry`, or `open externally`.
- `interactive_external` — the user works in Codex App, Cursor App, or another compatible tool directly. The system does not own the terminal, but it still ingests the session and audits the resulting work.

The canonical control surface is the Next app. External chat/apps remain supported operator tooling, especially for debugging prompts, exploratory work, or fallback attended flows.

Every completed run emits ingestible artifacts through the runner-adapter contract. Chat-shaped runs use a transcript; non-chat runs use a structured run summary. In both cases the lifecycle is the same: `ingest_session` captures the session or run narrative into `user-data/memory/journal/`, `extract_events` converts relevant moments into events, and `update_performance` refreshes derived metrics.

### 2.6 Onboarding paths

Canonical path: `App-first`.

1. Start the app.
2. Complete welcome/auth.
3. Upload or import the CV / source resume.
4. Fill the questionnaire / brief.
5. Let the system extract the initial profile and strategy, seed schedules, and run the first dry scout / bootstrap pipeline.
6. Continue through dashboard-driven background and supervised runs, with the app surfacing escalations when human input is required.

Fallback path: `Chat-first`.

1. Bootstrap the profile and strategy through a CLI/chat flow.
2. Start the app after the base memory is ready.
3. Continue with the app as the control plane.
4. If a run needs attended browser work, the app prefers a supervised run and falls back to `interactive_external` only when supervised execution is insufficient or unsupported by the selected runner adapter.

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

### 3.1 Routing (pre-dispatch)

Routing is a pre-dispatch policy layer that runs after the user selects a global runner adapter and before any agent process is spawned.

Input:
- `role`
- `task_kind`
- workload/risk context
- selected run mode
- adapter capabilities (tools, PTY terminal, browser attended, browser unattended, session hooks, JSON event stream)

Output:
- `model`
- `reasoning_effort`
- `allow_tools`
- `fallback_model`
- `escalate_when`

Rules:
- The router does not choose between CLI providers. The user chooses one global `selected_runner_adapter` in runtime settings.
- `script-only` tasks bypass the model runner layer entirely.
- Every routing decision is observable and stored with the resulting `agent_run`, including a short decision trace explaining why the policy was chosen.

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

Spawn model:
1. Resolve the selected runner adapter from `user-data/config/runtime-settings.yaml`.
2. Route the task to a concrete execution policy (`model`, `reasoning_effort`, tool allowance, escalation conditions).
3. Start the run in the requested mode:
   - `background` for scheduled safe work,
   - `supervised` for app-owned attended work,
   - `interactive_external` for externally launched sessions that are later ingested.

The default scheduled path is `background`. Manual triggers from the app may start either `background` or `supervised` runs depending on task risk and required capabilities.

Baseline schedules (seed in `config/defaults/schedules.seed.yaml`, detailed in `automations/*.md`):

| Cron | Role | Model | Prompt | Catchup | Output |
|---|---|---|---|---|---|
| `0 7 * * *` | scout | gpt-5.4-mini / low | `prompts/roles/scout.md` | skip_if_stale (12 h) | candidates, today-context, push |
| `0 19 * * *` | reviewer (follow-up) | gpt-5.4-mini / low | follow-up flavour | skip_if_stale (24 h) | reminders from reviews queue |
| `0 23 * * *` | memory-manager | gpt-5.4-nano / low | `prompts/roles/memory-manager.md` | run_once_if_overdue | rebuilt performance, inbox → events |
| `0 10 * * 0` | strategist (weekly) | gpt-5.4 / high | `prompts/roles/strategist.md` | run_once_if_overdue | proposal + auto-decide |
| `0 10 1 * *` | strategist (monthly) | gpt-5.4 / high | `prompts/roles/strategist.md` | run_once_if_overdue | monthly review |
| `0 3 */14 * *` | maintainer | gpt-5.4-mini / low | support + maintainer flavour | run_all_missed | dependency proposal |

Runner adapters expose completion hooks that call `ingest_session` → `extract_events` → `update_performance` through the local `job-search` MCP server. This works even when the app is off — the MCP server runs standalone (`job-search mcp serve`) and writes to the same SQLite.

Dry-run default: any new or changed task runs in `dry_run` for the first 3 runs. External side effects are blocked until promoted via **Schedules → Promote to live**.

### 4.1 Validation checkpoint for browser-backed runs

Attended browser work is allowed through `supervised` runs when the selected runner adapter can safely drive Playwright/MCP from an app-owned terminal session. Until the team proves a stable command template and prompt contract for that path, the system keeps `interactive_external` as a mandatory fallback.

Validation workstream:
- pick CLI flags that reduce approval churn without disabling necessary safety gates;
- define a prompt contract for deterministic Playwright/MCP startup;
- confirm that backend-owned PTY sessions can launch and monitor a browser-backed run, not just a manually started shell session.

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

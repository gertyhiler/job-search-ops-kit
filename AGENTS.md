# Agent Contract — job-search-ops-kit

This repository is a self-hosted AI-ops kit for job search. It orchestrates agent roles (Codex CLI, Cursor) over a file-first memory layer plus a SQLite projection. Any agent acting in this repo MUST follow the contract below.

## Separation of Zones

- **Zone A — system (public, git-tracked):** code, prompts, role skills, schemas, defaults, docs, automations. Lives in this repo.
- **Zone B — user data (private, gitignored):** resume, brief, vacancies, applications, events, evidence, browser profiles, OAuth tokens. Lives in `user-data/` (resolved via `JOB_SEARCH_DATA_DIR`, default `./user-data`).

Agents MUST NOT write personal data into Zone A. Agents MUST NOT read secrets from anywhere but `user-data/.env.local` (via the env, never by hardcoding paths).

## Core Concepts

- `journal` — narrative of a working session (what happened, what was decided).
- `events` — machine-readable lifecycle signals: `applied`, `viewed`, `screened`, `invited`, `rescheduled`, `technical`, `final`, `offer`, `rejected`, `ghosted`, `withdrawn`. Append-only in `user-data/memory/events/application-events.jsonl`.
- `performance` — derived signals about what works (resume variants, cover letter tones, channels). Rebuilt from events, never hand-edited.
- `strategy` — the active search strategy (ICP, tactics, KPIs, hypotheses) in `user-data/memory/strategy/active-strategy.yaml`. Mutated only through proposals + auto-decide.
- `reviews` — follow-up queue (ping HR after N days, prep for interview the day before).
- `evidence` — raw artefacts: JD snapshots, screenshots of apply forms, email payloads.
- `today-context` — morning briefing generated from tracked memory (due tasks, new matches, overdue follow-ups, today's interviews). Derivable; never the source of truth.
- `routing` — per-role, per-task model policy. Pick a model from workload and risk, not from role name alone.

## Working Rules

- Files under `user-data/memory/` are the source of truth. SQLite is an index/projection and can be rebuilt via event replay.
- Event log is append-only. Corrections go as new events, not edits in place.
- Every external side effect (apply, email send, browser click) MUST leave evidence in `user-data/memory/evidence/` and produce an `application_event`.
- Any strategy change MUST flow through `propose_strategy_change` → `auto_decide_strategy` → `apply_strategy_change`. Decisions are logged in `decision-log.jsonl`; rollback is cheap and expected.
- `dry_run: true` is the default for any new or modified automation. Promote to live only after explicit approval.
- Rate limits apply per channel (hh, career-pages, LinkedIn). Exceeding them is a hard stop, not a warning.
- Role prompts in `prompts/roles/` are generic and use `{{profile.*}}` / `{{strategy.*}}` placeholders. Never bake a specific person, company, or resume into a prompt.

## Session Lifecycle

- On session start, an agent reads `user-data/memory/profile/`, the active strategy, and the latest `today-context`.
- On session end, the Codex/Cursor hook calls `ingest_session` → `extract_events` → `update_performance` through the `job-search` MCP server. Nothing is lost, even in interactive chat.

## What Lives Where

- Policy and prompts: `prompts/roles/`, `prompts/session-types/`, `routing/model-policy.yaml`, `automations/`. Edited in the IDE, reviewed by diff.
- Contracts: `schemas/*.schema.json`. Any data written to disk or DB must validate against them.
- Agent role skills (loadable modes): `.agents/skills/<role>/SKILL.md`.
- Scripts: `scripts/` (thin, deterministic; no LLM calls).
- Runtime audit (this repo): `runtime/audit/*.jsonl` (gitignored content, only `.gitkeep` is tracked).
- User data: `user-data/` only. Always resolved through `resolvePath(kind, name)` once `packages/core/paths.ts` lands in M2+.

## Safety Rails

- Never commit anything from `user-data/`, `.env*` (except `.env.example`), `*.db*`, `runtime/browser-profiles/`.
- Never invent facts in resumes, cover letters, or answers. Reviewer role is gated against hallucinations (cross-check with `master-resume.json`).
- Never auto-accept a strategy change with `reversibility == hard`, touching constraints/preferences, or lowering salary below the declared floor — those escalate to a human.

## Scope of This Repo

- IN SCOPE: the system that makes job search observable, self-hosted, and self-learning.
- OUT OF SCOPE: anybody's personal data, CVs, tokens, or proprietary company info. If it smells personal, it belongs in `user-data/`.

See [docs/README.md](docs/README.md) for the full specification.

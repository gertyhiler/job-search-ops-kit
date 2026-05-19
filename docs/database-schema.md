# Database Schema

The SQLite DB is the rebuildable projection layer for the installed operator runtime.

## Location

Canonical default location:

- `~/.local/state/job-search/job-search.db`

This is intentionally outside the source repo and outside the long-lived user data root.

## File → DB Projection

Source-of-truth files under `~/.local/share/job-search` project into SQLite as follows:

| DB Table | File source |
|---|---|
| `vacancy` | `memory/vacancies/*.json` |
| `application` | `memory/applications/*/application.json` |
| `application_event` | `memory/events/*.jsonl` |
| `resume_version` | `memory/resumes/variants/*.json` |
| `cover_letter` | `memory/applications/*/cover-letter.json` |
| `interview` | `memory/applications/*/interview.json` |
| `strategy_change` | `memory/strategy/change-proposals/*.yaml` + `memory/strategy/decision-log.jsonl` |

M5.2 application package assets that remain file-backed:

| Asset | File source |
|---|---|
| letter markdown | `memory/applications/*/letter.md` |
| screening answers | `memory/applications/*/answers.md` |
| resume variant ref | `memory/applications/*/resume-variant-ref.json` |
| reviewer verdict | `memory/applications/*/reviewer-verdict.json` |
| manual outbox | `memory/applications/*/outbox.json` |

State-owned runtime inputs:

| DB / state surface | Source |
|---|---|
| `agent_run` | `~/.local/state/job-search/audit/agent_runs.jsonl` mirror |
| `schedule` | seeded from `config/defaults/schedules.seed.yaml`, then runtime-managed |

## Invariants

- The DB contains no unique truth.
- File memory stays authoritative.
- `schedule` is runtime state.
- `agent_run` is observability state.
- `applied` requires explicit human confirmation and evidence; the event log remains authoritative for funnel history.
- DB loss is recoverable through migrate + replay.

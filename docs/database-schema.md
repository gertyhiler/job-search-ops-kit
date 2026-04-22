# Database Schema

Principle: **files are the source of truth (git-friendly, diff-able, human-readable); SQLite is a projection for fast queries and the dashboard**. Recovery is always from files.

## Entities (SQLite)

The canonical location will be `packages/db/schema.ts` (Drizzle) from M3 onward. Schemas in `schemas/*.schema.json` are the portable JSON Schema contracts that these tables must conform to.

### `vacancy`
- `id` (string, PK), `source` (hh | linkedin | site | referral | agency | other), `source_id`, `url`
- `company`, `title`, `location`, `remote` (remote | onsite | hybrid | unknown)
- `salary_min`, `salary_max`, `currency`
- `tags[]`, `jd_markdown_path`
- `match_score` (0–100), `match_rationale`
- `status` (candidate | archived | applied | dropped)
- `first_seen_at`

### `application`
- `id`, `vacancy_id`, `resume_version_id?`, `cover_letter_id?`
- `channel` (hh | site | linkedin | referral | agency)
- `status` (draft | dry_run | ready_to_send | applied | screened | interviewing | offer | rejected | withdrawn)
- `applied_at?`, `confidence?`, `auto_sent` (bool), `dry_run` (bool)

### `application_event`
- `id`, `application_id`, `ts`, `kind`
- kind ∈ { applied, apply_failed, viewed, screened, invited, rescheduled, technical, final, offer, rejected, ghosted, withdrawn }
- `payload?`, `evidence_ref?`, `emitted_by?`

### `resume_version`
- `id`, `slug`, `base_commit_sha`
- `patches_json_path?`, `rendered_pdf_path?`
- `targeted_domain?`, `created_at`

### `cover_letter`
- `id`, `application_id`, `style?`, `tone?`, `markdown`, `sha`, `generated_by_model?`

### `interview`
- `id`, `application_id`, `stage` (screening | technical | behavioral | system-design | final | other)
- `scheduled_at`, `duration_min?`, `format?` (onsite | video | phone | async-task)
- `notes_path?`, `verdict?` (pass | fail | borderline | withdrawn), `questions_asked[]`

### `strategy_change`
- `id`, `ts`, `before`, `after`
- `rationale`, `evidence_refs[]`, `expected_impact?`
- `confidence` (0–1), `reversibility` (trivial | moderate | hard)
- `proposed_by`, `decision` (auto_accept | auto_defer | auto_reject | escalate_to_human | reverted)
- `applied_version?`

### `agent_run`
- `id`, `ts_started`, `ts_finished?`, `scheduled_for?`
- `role`, `model`, `prompt_sha`, `schedule_id?`
- `runner_adapter`, `run_mode` (background | supervised | interactive_external | script_only)
- `routing_decision_ref?` or inline routed fields (`reasoning_effort`, `allow_tools`, `fallback_model`)
- `exit_code?`, `duration_ms?`, `tool_calls_count?`, `changed_paths[]`
- `pty_session_id?`, `approval_state?`, `escalation_reason?`, `capabilities_used[]`
- `dry_run` (bool), `catchup` (bool)
- `trigger` (boot | sweep | manual | cli | session_hook)
- `notes_path?`

### `schedule`
- `id`, `cron`, `role`, `model?`, `prompt_file`, `mcp_profile?`
- `dry_run` (bool), `enabled` (bool)
- `next_run_at`, `last_run_at?`, `last_status?`
- `catchup_policy` (run_once_if_overdue | skip_if_stale | run_all_missed)
- `max_staleness_sec?`, `fails_in_a_row`

## Events Log (Source of Truth)

`user-data/memory/events/application-events.jsonl` is append-only. SQLite `application_event` rows and derived `vacancy` / `application` status are populated by the deterministic `ingest_events` script (replay). Correcting history = emit a new event, never edit an old one.

## File ↔ Table Mapping (Cheat Sheet)

| DB Table | File(s) (`user-data/memory/`) |
|---|---|
| `vacancy` | `vacancies/<slug>.md` |
| `application` | `applications/<id>/{resume.pdf,letter.md,answers.md}` |
| `application_event` | `events/application-events.jsonl` (SSoT) |
| `resume_version` | `resumes/variants/<slug>.json`, `resumes/renders/<slug>.pdf` |
| `cover_letter` | `applications/<id>/letter.md` |
| `interview` | `interviews/<app-id>-<date>.md` |
| `strategy_change` | `strategy/change-proposals/<id>.yaml` + `strategy/decision-log.jsonl` |
| `schedule` | seed from `config/defaults/schedules.seed.yaml`; runtime only in DB |
| `agent_run` | `runtime/audit/agent_runs.jsonl` mirror |

## Live Supervision Notes

For long-running supervised runs, the app may keep ephemeral process state (PTY handle, live approval prompt, browser attachment status) in memory or a local runtime registry. Durable audit still anchors on `agent_run`, which records how the run was launched, what capabilities it used, and why it escalated.

## Recovery

```
rm user-data/runtime/job-search.db
js db migrate
js db replay          # scans events/*.jsonl + file memory, rebuilds rows
```

The replay is deterministic and idempotent. It must produce the same DB state for the same inputs.

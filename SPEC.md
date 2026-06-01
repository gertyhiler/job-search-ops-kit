# SPEC — job-search-ops-kit

## 1. Design philosophy

The system has two contours that never blur:

1. **Deterministic runtime pipeline.** Plain Node cron queues advance a state machine
   on `vacancies.pipeline_status`. Each stage is a pure step that reads rows in one
   status and writes them to the next. AI is used only as a **stateless subprocess**
   (`codex` / `agent` / `claude`): prompt text in, strict JSON out.
2. **Reasoning layer (the chat agent).** `AGENTS.md` is a router: the user picks a role
   or just chats, and the agent loads a skill. The agent never touches data directly; it
   acts through the MCP server / CLI only.

The agent **builds, repairs, analyzes, reasons**. The pipeline **executes**.

## 2. Pipeline state machine

```
normalized -> scored -> classified(auto|manual_review|reject)
   classified(auto) -> packaged -> applying -> applied | failed | queued(<reason>)
```

Cron queues (interval from `POLL_INTERVAL_SEC`; downstream queues at `min(interval, 30s)`):

- **search-queue** — for each enabled connector: `fetchNewJobs(since)` -> `normalize` ->
  dedupe by content hash -> upsert (`normalized`) + events; advance source cursor.
- **score-queue** — `normalized` -> `vacancy-scoring.yaml` (filters + mechanical signals +
  routing) -> optional LLM classify for `ai_score` only -> `scored`/`classified`.
- **package-queue** — `classified(auto)` -> select resume variant + cover template, fill
  via AI subprocess under the evidence policy -> store letter + artifacts -> `packaged`.
- **apply-queue** — `packaged` that pass auto-apply policy -> Playwright apply
  (`dry_run` or `real`) -> classify result/errors -> update status -> route exceptions
  to queues + Telegram.
- **notify-queue** — emit Telegram for high-value vacancies, applied confirmations,
  questionnaire/auth/captcha/broken-playbook needs, daily/weekly summaries.

## 3. Storage

SQLite is the **system of record** for operational data:
`companies`, `vacancies`, `applications`, `application_artifacts`, `queues`, `events`,
`playbooks`, `llm_generations`, `insights`, `reflection_reports`, plus internal
`source_cursors` and `telegram_messages`.

Human-domain data lives as files under `data/` (gitignored): `profile/`, `strategy/`,
`prompts/`, `templates/`, `resume/`, `memory/`, `browser/`, `exports/`.

Key profile files (under `data/profile/`):

- `user-profile.md` — short positioning summary; safe to load broadly into agent context.
- `use-cases.md` — curated library of 8–12 reusable cases for cover letters (pick 1–2 per letter).
- `experience-facts.md` — atomic, canonical facts; used for questionnaires and to back profile/use-cases.
- `evidence.md` — supporting links/notes behind claims; backs facts/use-cases.
- `resume-gaps.md` — backlog of resume improvements suggested by consolidation.

## 4. Queue types (exceptions)

`auto_apply`, `manual_review`, `questionnaire`, `auth_required`, `captcha_or_antibot`,
`broken_selector`, `high_value`, `suspicious`, `hr_reply`, `interview_prep`.

## 5. Browser apply error taxonomy

`already_applied`, `resume_required`, `cover_letter_field_missing`,
`questionnaire_required`, `auth_required`, `captcha_or_antibot`, `selector_broken`,
`network_error`, `unknown_error`.

## 6. Memory model

- **Programmatic only.** The chat agent is forbidden (see `AGENTS.md`) from editing
  anything under `data/memory/`, the SQLite DB, or events. All writes go through the
  memory CLI / MCP tools, which validate input.
- **Capture.** Pipeline steps append `events` (DB) and journal lines
  (`data/memory/journal/*.jsonl`). Cursor/Codex `Stop` hooks drop session transcripts
  into `data/memory/inbox/`.
- **Consolidation.** A separate, deterministic process (`job-search consolidate`) reads a
  fixed input set (recent events + journal + inbox) and writes a fixed output
  (`data/memory/insights/` + `insights` table + a `reflection_reports` row). The single
  reasoning step is a bounded AI subprocess with a strict output schema. It runs weekly
  and on a trigger (after `CONSOLIDATION_EVENT_THRESHOLD` new events), so the interactive
  agent never has to think about it. Insights are surfaced read-only via `get_insights`.

Consolidation goals: decide whether actions led to results, and surface durable
learnings — e.g. "a cover letter cited a case not present in the resume -> propose adding
it" (written to `resume-gaps.md`), "this filter is too strict/loose", "what converts".

## 7. Safety rules

Allowed without confirmation: search, read, store, normalize, score, generate a short
cover letter, pick a standard resume, auto-apply to ordinary vacancies that pass policy,
log, notify, enqueue exceptions.

Requires confirmation: high-value / target-company vacancies, **chat-agent HH submit or
marking applied**, employer questionnaires answered in chat, anything touching
salary/relocation/citizenship/visa/taxes/legal status,
HR replies, changing the HH profile or resume, test assignments, low-confidence cases.

Forbidden: bypassing CAPTCHA/antibot, IP rotation to evade limits, spamming one company,
fabricating any fact, answering questionnaires with facts absent from
`experience-facts.md`/`evidence.md`, storing secrets in code, running a new browser
playbook in `real` mode before it has passed a `dry_run`.

## 8. Evidence policy

Everything claimed about the candidate in resumes, letters and questionnaire answers must
be true and traceable. For cover letters, claims are drawn from `data/profile/user-profile.md`
and `data/profile/use-cases.md` (and those must be backed by `data/profile/experience-facts.md`
and/or `data/profile/evidence.md`). Missing fact -> ask or leave a TODO; never invent companies,
dates, titles, technologies or results. You may sharpen wording and re-order emphasis, not change meaning.

## 9. AI subprocess contract

Models are `{provider}.{model}`:

- `codex.<model>` -> `codex exec --model <model> [--json]`, payload via stdin.
- `cursor.<model>` -> `agent --print --output-format text --model <model> --trust`, payload via argv.
- `claude.<model>` -> `claude -p --output-format text --model <model>`, payload via argv.

Prompts are files under `prompts/` with `{{VAR}}` substitution. Generations are logged to
`llm_generations`.

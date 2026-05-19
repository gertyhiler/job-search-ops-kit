# Codex-first Operator Workflow

This document defines the **operator runtime workflow when used inside the Codex app**.

It does **not** change the dev/operator split: this repo remains a developer workspace; the installed operator runtime is the operational workspace.

## Scope

In the Codex-first phase, the **Codex app chat** is the primary orchestrator:

- Codex decides which skills/roles to apply and which MCP tools to call.
- The operator runtime writes durable memory, evidence, and events to the external data root.
- The operator runtime writes mutable state, audit, and browser profiles to the external state root.
- Full unattended automation is explicitly deferred until the human-in-the-loop flow is proven.

The Next.js control plane remains a supporting surface for:

- observing projection state,
- reviewing application packages,
- triggering supervised transitions and logging applied evidence.

## Operator Session Contract (Codex app)

When `~/.local/opt/job-search` is opened in the Codex app, a session should behave like this:

### 1) Before chat (bootstrap)

Ensure the operator runtime is usable before doing role work:

- external roots exist: config/data/state/cache,
- required baseline files exist (or are scaffolded) under config/data,
- SQLite projection can be migrated and replayed without manual steps,
- MCP `job-search` server is reachable (Codex-first priority),
- browser profile root is present for attended sessions.

If any prerequisite is missing (tokens, strategy files, empty profile), the session should guide the user to fix it through onboarding rather than failing mid-run.

Implemented foundation:

- `job-search operator status` prints the same readiness shape exposed by MCP `get_operator_status`.
- `job-search operator bootstrap` creates roots/defaults and replays the projection.
- MCP `bootstrap_operator` performs the same bootstrap from Codex chat.
- Installed Codex hooks run bootstrap/projection checks on session start and save raw stop payloads into `inbox/session-transcripts/`.

### 2) During chat (human-in-the-loop)

The primary user interaction is conversational:

- onboarding: user provides resume + answers; the runtime writes profile + strategy + resume variants into memory.
- scouting: the runtime searches sources (via MCP connectors), dedupes, scores, and writes candidate vacancies.
- tailoring: the runtime writes draft package assets (letter, answers, resume variant reference).
- review: the runtime produces a verdict and prepares a manual outbox plan.
- apply (attended): the user logs in / passes 2FA; the runtime drives clicks and form filling, then requests explicit human confirmation before logging `applied`.

At every stage:

- all mutations must be auditable (what changed and why),
- durable memory/journal/profile writes must use installed `job-search` MCP tools, never ad-hoc scripts or direct file edits,
- if a needed MCP write tool is unavailable, the agent must stop and report the missing tool instead of fabricating a filesystem workaround,
- when the native MCP server/config is unavailable, fall back to `job-search mcp call <tool> --args '<json>'` before declaring the workflow blocked,
- “applied” requires evidence and explicit confirmation,
- the system must degrade gracefully when automation is not possible (manual instructions + prepared assets).

Onboarding writes must use MCP `write_onboarding_profile`. Narrative journal entries must use MCP `write_journal_entry`. End-of-session summaries should use MCP `write_session_log` so the low-level audit trail has a readable companion.

### 3) After chat (session log)

Every operator session should leave behind a readable trail:

- what was requested,
- what tools were called,
- what memory artifacts were written,
- what failed and what was blocked (with reasons),
- what the next actions are.

The low-level audit logs are necessary but not sufficient; the Codex-first phase requires human-readable session logs suitable for iterating on the workflow.

## Non-goals (for the Codex-first phase)

- unattended background application submissions,
- silent strategy changes without explicit proposals/decisions,
- treating the developer workspace as a runtime environment.

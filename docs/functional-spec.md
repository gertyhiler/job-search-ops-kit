# Functional Specification

## 1. Purpose

`job-search-ops-kit` is a self-hosted system for running an observable, privacy-respecting job search with AI-assisted roles. It is built in a source repo but operated from a separately installed runtime.

## 2. Environment Boundaries

### Developer workspace

The source repo is for:

- source changes,
- schema and prompt work,
- tests and documentation,
- `pnpm dev`, HMR, and compatible backend debugging,
- direct CLI/script runs that do not depend on runtime AGENTS, runtime `.agents/skills`, or runtime MCP orchestration.

The source repo must not serve as the production operator workspace.

### Installed operator runtime

The installed operator app at `~/.local/opt/job-search` is for:

- runtime `AGENTS.md`,
- runtime `.agents/skills`,
- rendered runtime MCP config,
- **Codex app chat-first orchestration** (primary operator UX),
- MCP-backed tool execution and auditable memory writes,
- supervised role execution (human-in-the-loop),
- attended browser sessions (human does login/2FA; agent drives interactions),
- the Next.js control plane as a supporting observation/supervision surface,
- “chat with the agent inside the directory” behavior.

## 3. Filesystem Contract

- `~/.local/opt/job-search` — installed runtime bundle
- `~/.config/job-search` — runtime settings, config overrides, secrets
- `~/.local/share/job-search` — user memory, evidence, inbox, long-lived data
- `~/.local/state/job-search` — SQLite projection, audit, browser profiles, health, mutable runtime state
- `~/.cache/job-search` — disposable cache

The synthetic fixture under `examples/user-data-example/` exists only for tests and docs.

## 4. Source of Truth

- Memory and events under `~/.local/share/job-search` are the source of truth.
- SQLite under `~/.local/state/job-search/job-search.db` is a rebuildable projection.
- Config/secrets under `~/.config/job-search` are private runtime inputs.
- Shared prompts/policies/defaults remain source-controlled in the repo and are copied into the installed app bundle by the installer.

## 5. Roles and Skills

Production role skills are shipped from `operator/.agents/skills/` into the installed runtime `.agents/skills/`.

The active production roles remain:

- scout
- strategist
- tailor
- reviewer
- applier
- interviewer
- memory-manager
- analyst
- negotiator
- support

Developer-only skills, if any, live under root `.agents/skills/` and must not encode production/operator behavior.

## 6. Current Execution Model

Implemented now:

- technical DB CLI (`db migrate`, `db replay`);
- operator bundle build/install/update pipeline;
- external path/bootstrap contract;
- source-form operator runtime assets;
- installed MCP server with deterministic runtime read/write tools;
- installed role runtime commands and schedule sweep (`runtime run`, `runtime tick`) as supporting substrate;
- installed Next.js control plane with dashboard, schedules, run detail, and supervised application loop surfaces as supporting substrate;
- supervised application state machine through draft package, review gate, manual outbox, and human-confirmed applied event;
- append-only `agent_run` audit in the external state root.

Deferred to later milestones:

- Codex-first onboarding and end-to-end human-in-the-loop flows (chat-first operator UX),
- unattended/background automation beyond the proven supervised workflow.

## 7. Safety Rules

- Personal data never belongs in tracked source files.
- Production skills and MCP wiring must not remain active in the source repo.
- DB and browser profile state belong in `~/.local/state/job-search`, not in the repo.
- Direct edits to the installed runtime are discouraged; the source repo remains the place where changes are authored, then reinstalled/updated.

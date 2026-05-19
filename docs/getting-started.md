# Getting Started

## Developer Flow

Use the source repo only for development:

1. `git clone <this-repo> job-search-ops-kit && cd job-search-ops-kit`
2. `pnpm install`
3. Use `pnpm run check` to validate the current source tree.
4. Use `pnpm dev`, `pnpm run control-plane:dev`, HMR, direct scripts, and source edits for developer-mode work only.
5. Do **not** use the source repo as the production runtime workspace.

## Operator Install Flow

Use the installer to create the isolated operator workspace:

1. Build the bundle: `pnpm run build:operator`
2. Fresh install: `pnpm run install:operator`
3. Update an existing install: `pnpm run update:operator`

After install/update the canonical roots are:

- app: `~/.local/opt/job-search`
- config: `~/.config/job-search`
- data: `~/.local/share/job-search`
- state: `~/.local/state/job-search`
- cache: `~/.cache/job-search`
- launchers: `~/.local/bin`

## Codex-first Operator Flow (Primary)

Operate from the installed runtime inside the Codex app:

1. Open the installed runtime folder in Codex: `~/.local/opt/job-search`.
2. Check readiness: `job-search operator status` or MCP `get_operator_status`.
3. If needed, bootstrap: `job-search operator bootstrap` or MCP `bootstrap_operator`.
4. In chat, ask for onboarding and provide the resume. The agent should use the `onboarding` skill and MCP `write_onboarding_profile`.
5. Ask the agent to scout vacancies (it should use runtime skills + MCP connectors and write candidate vacancies into memory).
6. Ask the agent to prepare application packages (draft letter, screening answers, resume variant reference, reviewer verdict, outbox plan).
7. For apply: start an **attended** browser session (you do login/2FA; the agent drives clicks and form filling), then confirm applied with evidence.

Installed Codex hooks are shipped under `.codex/`:

- `SessionStart` runs bootstrap/projection checks and writes `~/.local/state/job-search/health/codex-session-start.json`.
- `Stop` saves raw Codex stop payloads under `~/.local/share/job-search/inbox/session-transcripts/`.
- Runtime profile, memory, journal, event, and application writes should go through installed `job-search` MCP tools. Do not ask the agent to generate scripts to populate those files; missing MCP write tools are blockers to report and fix in source.
- MCP `write_journal_entry` is the durable narrative journal path.
- MCP `write_session_log` is the readable end-of-session log and should be called by the agent before finishing meaningful operator work.

The control plane is optional but useful for supervision and inspection:

- Start both background services with `job-search start`, then open `/applications` and `/schedules`.
- Check service state with `job-search status`, tail logs with `job-search logs app|mcp`, and stop them with `job-search stop`.
- Use `job-search app start` only when you explicitly want the Next control plane in the foreground.

## Current Operator Foundation

Today the installed runtime already gets:

- runtime `AGENTS.md`,
- production `.agents/skills`,
- prompts, automations, routing, schemas, defaults,
- technical CLI and DB foundation,
- installed `job-search` MCP server,
- installed Codex hooks for bootstrap checks and raw session capture,
- onboarding role/skill plus MCP onboarding tools,
- installed runtime role execution commands (`runtime run`, `runtime tick`),
- installed Next.js control plane via `job-search app start`,
- supervised application loop pages under `/applications`,
- append-only `agent_run` audit under `~/.local/state/job-search/audit/`,
- append-only control-plane supervision state under `~/.local/state/job-search/control-plane/`,
- rendered MCP config templates in the installed app.

Codex-first onboarding and attended browser flows are the next milestone focus; full unattended automation remains a later milestone.

## Manual M5.2 Verification

1. Run `pnpm run build:operator && pnpm run update:operator`.
2. Start the installed runtime services with `job-search start`.
3. Open `/applications` and confirm candidate vacancies plus the application queue render.
4. Open an application detail page and inspect vacancy, letter, answers, reviewer verdict, outbox, and lifecycle events.
5. Mark a package reviewed, prepare the manual outbox, then log an applied event with confirmation evidence.
6. Confirm the application status is `applied`, `memory/events/application-events.jsonl` has an `applied` event, and `~/.local/state/job-search/audit/mcp-tool-calls.jsonl` records the tool calls.

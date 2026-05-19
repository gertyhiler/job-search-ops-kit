# Implementation Roadmap

This is the active roadmap after the dev/operator split decision.

## Execution Strategy

- The source repo remains the place where implementation happens.
- The installed operator runtime is a shipped artifact, not the authoring workspace.
- Each milestone should leave the source repo, the bundle pipeline, and the external-root contract internally consistent.

## Codex-first Focus (New Priority)

The operator runtime is operated primarily from the **Codex app**:

- open `~/.local/opt/job-search` in Codex and work chat-first,
- Codex orchestrates skills + MCP tools + hooks,
- the Next.js control plane remains a **supporting** surface for observation and supervised confirmations,
- full unattended/background automation is deferred until the supervised human-in-the-loop workflow is proven end-to-end.

## Milestones

### M1 — Dev / Operator Separation

- Root `AGENTS.md` becomes developer-only.
- Root `.agents/skills/` becomes developer-only.
- Production role skills and runtime AGENTS move under `operator/`.
- Path helpers stop defaulting to repo-local `user-data/`.
- Spec/docs explicitly ban using the source repo as production runtime.

### M2 — Operator Bundle, Installer, Updater

- `build:operator`, `install:operator`, `update:operator`.
- Installed app bundle at `~/.local/opt/job-search`.
- Launchers in `~/.local/bin`.
- Config/data/state/cache roots externalized.
- Runtime MCP templates rendered into the installed app.

### M3 — Installed Runtime Foundation

- Bootstrap external config/data/state roots.
- DB migrations and replay operate against external roots.
- CLI stays technical but works from the installed app/runtime contract.
- Validation/tests cover bundle and install/update paths.

### M4 — MCP Server and Runtime Roles

- Add installed MCP server.
- Wire runtime roles to installed `.agents/skills`, prompts, and routing.
- Make operator-side MCP-backed sessions work only from the installed app.
- Status: implemented in the source repo and shipped by the operator bundle.
- Includes:
  - `job-search mcp serve`
  - `job-search runtime run`
  - `job-search runtime tick`
  - deterministic MCP write-tools with audit-first file updates and projection refresh
  - runtime `agent_run` audit logging and schedule advancement
  - unattended browser/apply execution blocked until the attended workflow (`M7`) and later full automation (`M8`)

### M5 — Next.js Control Plane

- Add the web app as the control plane for the installed runtime.
- Add supervised orchestration and run observation surfaces.
- Keep prompts/policies source-controlled in the repo and shipped into the installed bundle.
- Status: `M5.1` first usable slice and `M5.2` supervised application loop are implemented and shipped by the operator bundle.
- Includes in `M5.1`:
  - `packages/control-plane` on App Router
  - dashboard with `next_actions`, due schedules, funnel, performance, and recent runs
  - `/schedules` with `Run now` and `Tick runtime`
  - `/runs/[id]` with supervised run metadata, runtime payload, stdout/stderr tails, and linked audit entry
  - `job-search app start`
  - `pnpm run control-plane:dev`
- Includes in `M5.2`:
  - MCP tools for `list_applications`, `create_application_package`, `write_application_asset`, and gated `update_application_status`
  - applied event/status gates requiring human confirmation and evidence
  - `/applications` and `/applications/[id]` control-plane surfaces for candidate vacancies, application packs, review status, manual outbox, and applied evidence
  - `POST /api/applications/[id]/status` and `POST /api/applications/[id]/events`
  - applier role limited to supervised manual outbox preparation; production browser submission remains M7
- Remaining in later `M5.x` slices:
  - richer supervised attach/stream/stop/retry surfaces
  - operator UX refinement beyond the first usable slice

### M6 — Codex-first Onboarding and Chat-first Operator UX

- Codex app becomes the primary orchestrator for operator work.
- Add onboarding flow that starts from empty memory:
  - ingest resume + Q/A,
  - write profile + strategy + resume baseline into `~/.local/share/job-search`,
  - replay projection deterministically.
- Add pre/post session hooks for bootstrap checks and readable session logs.
- Control plane remains optional and supporting; onboarding must not require it.
- Status: first foundation implemented in the source repo and shipped by the operator bundle.
- Includes:
  - `onboarding` runtime role and installed `.agents/skills/onboarding/SKILL.md`
  - MCP tools `get_operator_status`, `bootstrap_operator`, `write_onboarding_profile`, and `write_session_log`
  - default active strategy bootstrap into `~/.local/share/job-search/memory/strategy/active-strategy.yaml`
  - Codex `SessionStart` and `Stop` hook entrypoints under installed `.codex/`
  - attended Playwright MCP template (`browser-attended`) for supervised browser sessions

### M7 — Attended Browser Apply (Human-in-the-loop)

- Attended Playwright flows where the user does login/2FA and the agent drives interactions under supervision.
- Browser attachment is available in the installed MCP template, but channel-specific apply recipes and end-to-end form-driving playbooks are still M7 scope.
- Strict safety gates:
  - no silent submissions,
  - `applied` requires explicit human confirmation + evidence.
- Browser profiles and audit trails live under the external state root.

### M8 — Background Automation and Self-Learning Hardening

- Scheduled loops, automation promotion, and long-run reliability.
- Strategist/memory-manager hardening for repeated runs.
- Unattended browser flows (if ever enabled) remain explicitly safety-gated and auditable.

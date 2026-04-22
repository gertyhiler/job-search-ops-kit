# Implementation Roadmap

This roadmap is the execution plan for the specification in [functional-spec.md](./functional-spec.md) and [architecture.md](./architecture.md). Milestones are executed one per session with their own sub-plans.

## Strategy of Execution

This roadmap is a **master plan**, not a set of instructions for a single run. The scope does not fit into one session and should not: each milestone has its own decisions that benefit from a reality check at the moment they are faced.

**Cascade of sub-plans.** Each milestone M1–M8 gets its own detailed plan in a separate session. When the current milestone completes, a sub-plan for the next one is produced. This gives:

- A clear scope per session (the operator sees exactly what will happen).
- Ability to correct course between milestones without rewriting this roadmap.
- No tangled long runs where the agent loses context.
- Versioning of decisions: each sub-plan fixes the trade-offs chosen at the time.

**This roadmap does not get rewritten** on every course correction. Serious adjustments between milestones are recorded in `user-data/runtime/audit/plan-deviations.jsonl` and reflected in the next sub-plan; this document stays as the northern star.

## Milestones

### Milestone 0 — Seed Analysis (1 evening, no code)

Goal: give the agent a starting worldview rather than a blank contract, and validate the shape of seed artefacts on a real case so the future `js init` wizard reproduces them for any user.

Outputs (all private, stored locally and later imported into `user-data/memory/`):

- `profile/candidate.md` — narrative, key achievements with numbers, strengths, blind spots.
- `profile/constraints.md`, `profile/preferences.md`, `profile/master-resume.json`.
- `profile/resume-variants-hypothesis.md` — 3–4 hypothetical variants with rationale.
- `strategy/active-strategy.v0.yaml` — ICP, tactics, KPIs, focus week 1.
- `strategy/decision-log.v0.jsonl` — first entry: "strategy v0 accepted".
- `vacancies/*.md` — seed vacancies with full metadata.
- `performance/hypotheses.yaml` — H1/H2/H3 as A/B baselines.
- `reviews/initial-queue.json` — first follow-up tasks.
- `README.md` — map of artefacts.

Done when: files are structurally valid, `active-strategy.v0.yaml` has explicit numeric thresholds, the user has read and confirmed strategy v0, and the seed shapes are generic enough to be generated automatically later.

### Milestone 1 — Bootstrap the Public Repo + Seed Import

Goal: a canonical public repo and the seed artefacts imported into `user-data/`.

- `git init`, first commit, MIT `LICENSE`, `README`, `.gitignore` (strictly enforcing `user-data/`, `.env.local`, `*.db`, `runtime/`).
- `AGENTS.md` with the job-search contract.
- Zone A: `config/defaults/`, `docs/`, `.env.example`, `examples/user-data-example/` with a synthetic profile.
- `.cursor/mcp.example.json`, `.codex/mcp.example.json` — templates without user-specific secrets.
- Pre-commit + GitHub Actions guards against leaks (regex scanner for names/emails/phones/tokens/absolute paths).
- Zone B (local): `user-data/` populated from M0 seed; first journal entry "seed imported, strategy v0 active".
- Public repo pushed; verify `user-data/` did not travel.

### Milestone 2 — Schemas, Prompts, Defaults, Path Resolver

- Generic `schemas/*.schema.json` for profile, vacancy, application, event, resume-version, cover-letter, interview, strategy, schedule.
- `packages/core/paths.ts` with `resolvePath(kind, name)` reading `JOB_SEARCH_DATA_DIR`.
- Default `routing/model-policy.yaml`; override format in `user-data/config/model-policy.overrides.yaml`.
- Generic `prompts/roles/*.md`, `prompts/session-types/*.md`, `.agents/skills/*` with `{{profile.*}}` / `{{strategy.*}}` placeholders.
- `config/defaults/*` filled with sensible defaults, validated against schemas.
- Run seed through validators; fix discrepancies in schemas.

### Milestone 3 — pnpm Monorepo + DB + `js init` Wizard

- `pnpm init` + workspaces + Turborepo.
- `packages/core`, `packages/db` (Drizzle schema + migrations + event replay; DB path via `resolvePath`).
- `packages/cli/commands/init.tsx` — Ink wizard per [architecture.md §8](./architecture.md).
- SQLite hydration via event replay from `user-data/memory/events/*.jsonl`.
- Smoke test idempotency: `js init` on `examples/user-data-example/` reproduces the synthetic profile.

### Milestone 4 — MCP Server

- `packages/mcp-server` with the tool surface from [architecture.md §6](./architecture.md).
- Registration in `.codex/mcp.json` and `.cursor/mcp.json`.
- Install and configure `headhunter-mcp-server` (OAuth via dev.hh.ru/admin).

### Milestone 5 — First Usable Loop

- `scripts/scout_hh.ts` — full flow: search → filter → create vacancy files + DB rows. Compare against seeded list to calibrate scout matching.
- `packages/agents/tailor` + `packages/agents/reviewer` — package preparation using `resume-variants-hypothesis.md` as a menu.
- CLI commands `js scout`, `js prep <vacancy>`, `js apply <application> --dry-run`, `js today`.
- Scout is run manually from the CLI at this stage — the in-process scheduler arrives in M6.
- First 10 real applications go through manually, events recorded, hypotheses H1/H2/H3 calibrated.

### Milestone 6 — Web Dashboard + DB-Driven Scheduler

- Next.js 16 + Better Auth (single user) + shadcn@canary + Tailwind v4.
- Pages: Today, Pipeline, Funnel, Applications, Vacancies, Resumes, Strategy, Schedules, Agent Runs.
- `src/server/scheduler/sweep.ts` — core: `WHERE enabled AND next_run_at <= now()`, per-task catchup policy, drift-free `next_run_at` recomputation via cron-parser.
- Four sweep triggers: boot hook, dashboard-request middleware (throttled 1/min), `js tick` CLI, optional launchd plist.
- Coldstart guard: rate-limit overdue spawns to 1/min.
- Subprocess spawner with JSON event parsing, writing `agent_run` rows with `scheduled_for` / `ts_started` / `trigger` / `catchup`.

### Milestone 7 — Automation + Analyst

- `packages/agents/applier` + `packages/browser-automation/recipes/<site>.yaml` for 3–5 company sites. Each recipe starts in attended mode; after N successful runs with `confidence ≥ 0.8` it can be promoted to unattended through the dashboard.
- `prompts/roles/strategist.md` + MCP tools `auto_decide_strategy` / `apply_strategy_change` in `packages/mcp-server`. Escalation rules: defaults in `config/defaults/`, overrides in `user-data/config/`.
- Schedules from M6: weekly strategy consolidation, nightly memory consolidation, biweekly dependency review. The first consolidation compares facts against hypotheses H1/H2/H3 from seed → first autonomous strategy update.
- Memory-manager inbox classification via IMAP or Gmail API (separate sub-plan).

### Milestone 8 — Self-Learning Feedback Loop (hardening)

- Performance files update after every event; dashboard shows resume / letter / channel response rates; we keep what works and drop the rest.
- Weekly strategist reads performance + funnel and applies changes autonomously (confidence ≥ 0.75, not hard-reversible). Each strategy iteration is versioned; `decision-log.jsonl` shows the evolution. Rollback is one command.

## Open Questions (Not Blocking)

- IMAP/Gmail integration for automatic HR email capture — scheduled for M6. Manual forwarding to a watched inbox is enough for MVP.
- Credentials: `.env.local` + 1Password CLI; never committed.
- Public portfolio/demo version — a separate thread after M5.

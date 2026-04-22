# Self-Learning Loop

This system adapts autonomously: strategy mutates from evidence, memory consolidates nightly, performance files update after every event. Human intervention is reserved for hard-reversibility and ethical edges.

## 1. Autonomous Strategy Cycle

Unlike a human-in-the-loop learning system, job search treats speed as a feature. Consolidation and strategy adaptation do not wait for manual accept.

### Weekly cycle

1. Scheduler resolves the selected runner adapter, routes the strategist task, and starts a `background` run for `prompts/roles/strategist.md` (see `automations/weekly-strategy-consolidation.md`).
2. Strategist reads funnel + events + performance via MCP and produces one `strategy-change-proposal` with `before`, `after`, `rationale`, `evidence_refs`, `expected_impact`, `confidence` (0–1), `reversibility` (trivial | moderate | hard).
3. **Deterministic evaluator** `auto_decide_strategy(proposal)` (an MCP tool, not an LLM) returns a verdict:
   - `auto_accept` — `confidence ≥ 0.75` AND `reversibility ≠ hard` AND `expected_impact ≥ threshold`.
   - `auto_defer` — `0.5 ≤ confidence < 0.75` — queued for re-evaluation next week with more data.
   - `auto_reject` — `confidence < 0.5` OR contradicts `constraints.md`.
   - `escalate_to_human` — `reversibility == hard`, OR constraints/preferences change, OR salary floor touched, OR offer decision pending.
4. Another MCP tool `apply_strategy_change(proposal, decision)` patches `user-data/memory/strategy/active-strategy.yaml`, appends to `decision-log.jsonl`, bumps the version (`v1 → v2`), commits.
5. Async notification: macOS notification + entry in `today-context.md` + row in `agent_runs`. Not blocking.
6. Rollback is cheap: strategy is plain YAML under git, events are append-only, performance is derived. `js strategy rollback <version>` reverts the YAML commit and marks the proposal `reverted`.

**Result:** one routed adapter run → three MCP calls → one audit row. No Python glue in the middle, no separate launchd crons.

### What stays with the human

The escalation list lives in `user-data/config/escalation-rules.yaml` (copied from `config/defaults/escalation-rules.defaults.yaml` on init):

- Changes to `constraints.md` or `preferences.md`.
- Lowering the salary floor below the declared bottom-line.
- Accepting or declining an offer.
- `reversibility == hard` (e.g. deleting a resume-variant family permanently).
- More than N strategic changes within a single week (anti-thrashing guard).

Everything else runs itself.

## 2. Memory Consolidation (analogous to mastery update)

- `memory-manager` runs after every session (session-end hook → `ingest_session`) and nightly (23:00, routed adapter run for `prompts/roles/memory-manager.md` in `background` mode).
- In the run, the agent calls deterministic MCP tools: `extract_events(journal_entry)` parses emails/transcripts into events, `update_performance()` rebuilds `performance/*.yaml` from `events/*.jsonl` (means, percentiles — no LLM).
- LLM output appears only in the narrative journal summary.
- Every change to memory goes through the MCP server, so every call is visible in `agent_runs.tool_calls` and `runtime/audit/memory_consolidation.jsonl`.
- "What works / what does not" is available via `search_performance(question)` — any other agent or the user (via `js ask`) can query it mid-session.

## 3. Observability

Three layers, all local:

1. **Event sourcing** in `user-data/memory/events/application-events.jsonl` — append-only, rebuilds the full state.
2. **Runtime audit** — `user-data/runtime/audit/agent_runs.jsonl` + table `agent_run`: every runner-adapter spawn or ingested external interactive session with ts, duration, role, model, `prompt_sha`, `exit_code`, `tool_calls_count`, `changed_paths`, `dry_run`, `catchup`.
   This includes `background`, `supervised`, and `interactive_external` runs, plus the selected runner adapter and the routing decision trace.
3. **Web dashboard** (`packages/web`):
   - Pipeline (Kanban) by application status.
   - Funnel metrics: response rate, apply → screen, screen → interview, interview → offer.
   - A/B per resume variant, per cover letter style, per channel.
   - Timeseries: applications per week, responses per week.
   - **Schedules** — toggles, manual trigger, last status.
   - **Agent Runs** — filters by role/schedule/exit, `changed_paths` diff, stdout artifact link.
   - **Strategy change log** — auto/escalated decisions with rollback button.

## 4. Why Seed Analysis Matters

An agent system without initial memory hits a cold start: the first 2–4 weeks of applications run on default hypotheses, which then need to be unlearned. A seed analysis solves three problems at once:

1. **Baseline for self-learning.** Without a `hypotheses.yaml`, the strategist has nothing to compare. With it, every weekly review is "H1 confirmed / H2 refuted", and the decision log reads as a trajectory, not noise.
2. **Focus for week 1.** Seeded vacancies plus a v0 strategy give a concrete week-1 to-do. Without them, week 1 is spent tuning scout filters, not applying.
3. **Portable artefact.** The seed is a self-contained document: if the architecture changes later, the seed moves with you.

In practice: the seed is generated during **Milestone 0** (see [implementation-roadmap.md](./implementation-roadmap.md)) for the first user by the strategist and reviewer roles, then imported into `user-data/memory/` during **Milestone 1**. From M3 onwards, the same process runs via the `js init` wizard for any new user.

# Automation: Weekly Strategy Consolidation

- Schedule: `0 10 * * 0`  (Sunday 10:00)
- Role: `strategist`
- Runner: `codex exec`
- Model: `gpt-5.4` / high
- Prompt: `prompts/roles/strategist.md` + `prompts/session-types/weekly-consolidation.md`
- Catchup policy: `run_once_if_overdue`

Output:
- One `strategy-change-proposal` per run.
- Deterministic decision via `auto_decide_strategy`.
- On `auto_accept`: `apply_strategy_change` + notification in `today-context.md` + git commit of the mutated `active-strategy.yaml`.

Notes:
- Strategist never mutates strategy directly — only via MCP tools.
- Anti-thrashing: if `strategy.max_changes_per_week` already reached, session no-ops.

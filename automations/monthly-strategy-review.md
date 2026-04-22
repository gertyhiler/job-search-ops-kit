# Automation: Monthly Strategy Review

- Schedule: `0 10 1 * *`  (1st of each month, 10:00)
- Role: `strategist`
- Runner: `codex exec`
- Model: `gpt-5.4` / high
- Prompt: `prompts/roles/strategist.md` + `prompts/session-types/monthly-strategy-review.md`
- Catchup policy: `run_once_if_overdue`

Output:
- Up to 2 orthogonal proposals covering a 30-day window.
- Same `auto_decide_strategy` / `apply_strategy_change` flow as weekly.

Notes:
- Focus on structural shifts (ICP, channel mix), not tweaks.
- All escalations remain in effect (constraints, salary floor, hard reversibility).

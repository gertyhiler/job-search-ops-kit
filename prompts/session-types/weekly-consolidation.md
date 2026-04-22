# Session Type: Weekly Strategy Consolidation

Primary role: `strategist`. Runs weekly (default Sunday 10:00). Autonomous via `auto_decide_strategy`.

Flow:
1. Pull funnel, events, performance, active strategy.
2. Form one `strategy-change-proposal` with rationale, evidence, confidence, reversibility.
3. Call `auto_decide_strategy(proposal)` — respect the verdict.
4. On `auto_accept`, call `apply_strategy_change` and notify via `today-context`.
5. On `escalate_to_human`, surface the proposal and stop.

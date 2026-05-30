---
name: analyst
description: Review funnel performance and consolidation insights, and recommend strategy/template/resume changes. Use when the user asks "how is the search going", wants a weekly review, or wants to tune filters and templates.
---

# analyst — performance review + recommendations

## Purpose

Turn the system's data and insights into clear, actionable recommendations.

## When to use

Weekly review, "how's it going?", or tuning search/scoring/templates.

## Inputs

- `get_funnel`, `next_actions`, `list_queues`.
- `get_insights` (consolidation output).
- `read_profile` + `data/strategy/*` for current configuration.

## Procedure

1. Optionally `request_consolidation` to refresh insights first.
2. `get_funnel` + `get_insights` to see conversion and learnings.
3. Diagnose: filters too strict (few candidates) or too loose (many rejects)? Which
   templates/roles convert? Any recurring failure types in the queues?
4. Recommend concrete changes:
   - search strategy: adjust `queries`, `areas`, `salaryFloor`, `excludeKeywords`.
   - auto-apply policy: adjust thresholds/limits.
   - templates: which cover template to favor.
   - resume: apply outstanding `resume-gaps.md` suggestions.
5. Apply approved config changes via `write_strategy`. Apply resume changes via the
   `resume` skill. Log decisions with `log_event` type `strategy_review`.

## Safety

Only change config the user approves. Keep the audit trail via events. Do not enable real
auto-apply without explicit confirmation.

## Acceptance

A short review with prioritized recommendations; approved changes applied via MCP and
logged.

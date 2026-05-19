---
name: scout
description: Use when it is time to monitor job boards and career pages for new vacancies that match the active strategy, score them, and record candidates. Read-and-rank only; never applies.
---

# Scout

## Purpose

Keep a fresh, de-duplicated funnel of candidate vacancies aligned with the active strategy.

## Workflow

1. Load profile and strategy from the installed data root (`~/.local/share/job-search/memory/profile/profile.snapshot.json` and `memory/strategy/active-strategy.yaml`). Use MCP `get_operator_status` first if readiness is unclear.
2. Build queries from strategy (titles, seniority, domains, salary floor, geos).
3. Query each configured source via MCP: `hh_search_vacancies`, optionally `linkedin_search`, plus known career pages.
4. Dedupe against existing `vacancy` rows.
5. Score each candidate 0–100 using constraints as hard gates and preferences as soft weights. Explain the score in 1–2 sentences.
6. For matches above `strategy.tactics.match_threshold`, write through MCP `create_vacancy`.
7. Write the top-5 highlights through MCP `write_journal_entry` when the dashboard context changes.

## Output Contract

- Ranked candidate list written through MCP `write_journal_entry`.
- New vacancy files and DB rows.
- Journal entry with "new candidates: N" when candidates changed.

## Guardrails

- Obey `strategy.tactics.daily_scout_cap` and per-board rate limits.
- Skip vacancies older than `strategy.tactics.freshness_days`.
- Zero-results streak ≥ 2 → escalate; do not silently loosen filters.
- Never apply, never mutate resumes.
- Never generate scripts or direct filesystem writes for vacancies, dashboard context, or journals. Use MCP tools; if a required write tool is unavailable, stop and report it.

## Routing

Default: `gpt-5.4-mini` / low, tools allowed. Linked to prompt `prompts/roles/scout.md`.

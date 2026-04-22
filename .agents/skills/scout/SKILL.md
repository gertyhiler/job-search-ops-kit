---
name: scout
description: Use when it is time to monitor job boards and career pages for new vacancies that match the active strategy, score them, and record candidates. Read-and-rank only; never applies.
---

# Scout

## Purpose

Keep a fresh, de-duplicated funnel of candidate vacancies aligned with the active strategy.

## Workflow

1. Load `user-data/memory/profile/{candidate,constraints,preferences}` and `user-data/memory/strategy/active-strategy.yaml`.
2. Build queries from strategy (titles, seniority, domains, salary floor, geos).
3. Query each configured source via MCP: `hh_search_vacancies`, optionally `linkedin_search`, plus known career pages.
4. Dedupe against existing `vacancy` rows.
5. Score each candidate 0–100 using constraints as hard gates and preferences as soft weights. Explain the score in 1–2 sentences.
6. For matches above `strategy.tactics.match_threshold`, write `user-data/memory/vacancies/<score>-<slug>.md` and call MCP `create_vacancy`.
7. Update `user-data/memory/dashboards/today-context.md` with "new candidates: N" and top-5 highlights.

## Output Contract

- Ranked candidate list in the journal.
- New vacancy files and DB rows.
- Updated today-context.

## Guardrails

- Obey `strategy.tactics.daily_scout_cap` and per-board rate limits.
- Skip vacancies older than `strategy.tactics.freshness_days`.
- Zero-results streak ≥ 2 → escalate; do not silently loosen filters.
- Never apply, never mutate resumes.

## Routing

Default: `gpt-5.4-mini` / low, tools allowed. Linked to prompt `prompts/roles/scout.md`.

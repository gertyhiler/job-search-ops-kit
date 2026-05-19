# Automation: Daily Scouting

- Schedule: `0 7 * * *`
- Role: `scout`
- Runner: `codex exec`
- Model: `gpt-5.4-mini` / low
- Prompt: `prompts/roles/scout.md`
- Catchup policy: `skip_if_stale` (12 h)

Output:
- New candidate vacancies under the runtime data root `memory/vacancies/`.
- Updated `memory/dashboards/today-context.md` in the runtime data root with "new candidates: N" and top-5 highlights.
- Optional macOS notification.

Notes:
- Dry-run by default for the first 3 runs of any changed version. Promote to live via the dashboard.
- Obey `strategy.daily_scout_cap` and per-board rate limits.

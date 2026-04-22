# Automation: Nightly Memory Consolidation

- Schedule: `0 23 * * *`
- Role: `memory-manager`
- Runner: `codex exec`
- Model: `gpt-5.4-nano` / low (classification), `gpt-5.4-mini` (journal summary)
- Prompt: `prompts/roles/memory-manager.md`
- Catchup policy: `run_once_if_overdue`

Output:
- New `application_event` rows from inbox classification.
- Rebuilt `user-data/memory/performance/*.yaml` via deterministic `update_performance()`.
- Journal entry for the day under `user-data/memory/journal/<YYYY>/<date>.md`.

Notes:
- Classification is deterministic per item; LLM is only used for the narrative summary.
- Ambiguous inbox items land in `user-data/inbox/unresolved/` for human review.

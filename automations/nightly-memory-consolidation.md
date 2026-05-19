# Automation: Nightly Memory Consolidation

- Schedule: `0 23 * * *`
- Role: `memory-manager`
- Runner: `codex exec`
- Model: `gpt-5.4-nano` / low (classification), `gpt-5.4-mini` (journal summary)
- Prompt: `prompts/roles/memory-manager.md`
- Catchup policy: `run_once_if_overdue`

Output:
- New `application_event` rows from inbox classification.
- Rebuilt `memory/performance/*.yaml` in the runtime data root via deterministic `update_performance()`.
- Journal entry for the day under `memory/journal/<YYYY>/<date>.md` in the runtime data root.

Notes:
- Classification is deterministic per item; LLM is only used for the narrative summary.
- Ambiguous inbox items land in `inbox/unresolved/` under the runtime data root for human review.

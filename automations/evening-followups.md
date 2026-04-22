# Automation: Evening Follow-ups

- Schedule: `0 19 * * *`
- Role: `reviewer` (follow-up mode)
- Runner: `codex exec`
- Model: `gpt-5.4-mini` / low
- Prompt: `prompts/roles/reviewer.md` (follow-up flavour) + `prompts/session-types/ad-hoc.md`
- Catchup policy: `skip_if_stale` (24 h)

Output:
- Processed entries in `user-data/memory/reviews/queue.jsonl`.
- Reminder messages surfaced into `today-context.md`.
- Follow-up application events where appropriate.

Notes:
- Never send anything outbound without explicit approval. Reminders are for the operator.

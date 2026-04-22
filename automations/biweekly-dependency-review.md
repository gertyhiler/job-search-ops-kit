# Automation: Biweekly Dependency Review

- Schedule: `0 3 */14 * *`
- Role: `maintainer`
- Runner: `codex exec`
- Model: `gpt-5.4-mini` / low
- Prompt: `prompts/roles/support.md` (maintainer flavour — TBD: dedicated `maintainer.md` may be added in a later milestone if scope demands it)
- Catchup policy: `run_all_missed`

Output:
- `pnpm outdated` + `pnpm audit` summary.
- A `dependency-change-proposal` when a non-trivial bump is warranted. Same evaluator shape as strategy proposals.

Notes:
- Security advisories → `escalate_to_human`.
- Major version bumps → always `escalate_to_human`.

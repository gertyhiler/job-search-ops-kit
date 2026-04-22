# Privacy and Leak Guards

This kit separates system and user data so strictly that a curious contributor to the public repo never sees the operator's personal information.

## Zones

- **Zone A — public, git-tracked.** Code, prompts, skills, schemas, config defaults, examples, documentation.
- **Zone B — private, gitignored.** Everything in `user-data/` plus `.env.local`, SQLite databases, browser profiles, runtime audit logs.

At any time, `git clone` of this repo plus `ls user-data/` should reveal nothing more than an empty directory.

## What Lives Where (Cheat Sheet)

| Item | Location | Public? | Why |
|---|---|---|---|
| New default model for everyone | `routing/model-policy.yaml` | yes | system policy |
| Personal model override | `user-data/config/model-policy.overrides.yaml` | no | personal preference |
| New role prompt | `prompts/roles/<role>.md` | yes | generic |
| Generic site recipe | `config/defaults/browser-recipes/<site>.yaml` | yes | shared |
| Personal recipe patch | `user-data/config/browser-recipes/<site>.yaml` | no | personal selectors/tokens |
| Toggle a schedule | SQLite `schedule.enabled` via dashboard | no (DB) | runtime state |
| Change a cron | SQLite `schedule.cron` via dashboard | no (DB) | runtime state |
| Change seed schedule set | `config/defaults/schedules.seed.yaml` | yes | starting point for everyone |
| Fact of an application | `user-data/memory/events/application-events.jsonl` | no | personal history |
| Applied strategy log | `user-data/memory/strategy/decision-log.jsonl` | no | personal trajectory |
| Derived metrics | `user-data/memory/performance/*.yaml` | no | personal stats |
| Browser profile cookies | `user-data/runtime/browser-profiles/<site>/` | no | secret |
| hh.ru OAuth token | `user-data/.env.local` | no | secret |
| Your brief | `user-data/brief.md` | no | personal |
| Brief template for new users | `docs/first-brief-template.md` | yes | onboarding |

## Leak Guards

1. **`.gitignore`** explicitly lists: `user-data/`, `.env`, `.env.*` (with `!.env.example`), `*.db*`, `runtime/browser-profiles/`, build artefacts. No one has to remember.
2. **Pre-commit hook** (`packages/cli/scripts/guard-commit.ts`): blocks the commit if the diff contains personal-data patterns — full names, phone numbers, email addresses, hh.ru URLs with `resume_id`, secret-shaped tokens. Simple regex, no LLM.
3. **CI guard** on GitHub Actions: runs the same scanner on every PR. If anything personal slips in, CI fails.
4. **`examples/user-data-example/`** contains only a synthetic anonymous case ("Alex Dev, generic fullstack") — enough to make tests and documentation screenshots work without real data.
5. **Two-way protection:** `js init` installs a `.git/hooks/pre-push` copy of the guard, so even without a commit hook nothing leaves for `origin`.

## Generic-by-Default Invariants

- Prompts never mention specific companies, real names, or real resumes. They use placeholders like `{{profile.name}}`, `{{strategy.target_icp}}`.
- Schemas are flexible: `profile.schema.json` covers junior/middle/senior of any specialisation, not just frontend.
- The `scout` role targets domains listed in `active-strategy.yaml`, not hardcoded in the prompt.
- `escalation-rules.defaults.yaml` is conservative by default (any change to constraints/preferences escalates); the user loosens rules as trust grows.

## Optional Private Memory Repo

An advanced user can run `cd user-data && git init` with a private remote to sync memory across devices. The system supports both modes transparently — it is just files on disk.

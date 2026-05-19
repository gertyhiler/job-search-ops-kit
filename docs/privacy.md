# Privacy and Leak Guards

## Storage Separation

- **Public source repo** — code, prompts, defaults, docs, schemas, developer guidance, source-form operator assets.
- **Private runtime config** — `~/.config/job-search`
- **Private long-lived user data** — `~/.local/share/job-search`
- **Private mutable runtime state** — `~/.local/state/job-search`
- **Private cache** — `~/.cache/job-search`

A fresh `git clone` must reveal no personal job-search data.

## What Lives Where

| Item | Location |
|---|---|
| runtime settings | `~/.config/job-search/runtime-settings.yaml` |
| secrets | `~/.config/job-search/.env.local` |
| active strategy and memory | `~/.local/share/job-search/memory/...` |
| inbox and evidence | `~/.local/share/job-search/...` |
| SQLite projection | `~/.local/state/job-search/job-search.db` |
| audit logs | `~/.local/state/job-search/audit/...` |
| browser profiles | `~/.local/state/job-search/browser-profiles/...` |
| build/install bundle | `~/.local/opt/job-search` |

## Leak Guards

1. `.gitignore` blocks common local overrides such as repo-local `user-data/`, `runtime/`, secrets, DBs, and build artefacts.
2. `.githooks/pre-commit` runs the privacy scanner before commits.
3. CI runs the same scanner and foundation validation.
4. `examples/user-data-example/` stays synthetic and anonymous.

## Operational Rule

If something is personal, secret, mutable runtime state, or browser/session related, it belongs outside the repo. If it is shared code, shared policy, or source-form runtime assets, it belongs in the repo.

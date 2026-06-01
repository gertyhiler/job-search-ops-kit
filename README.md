# job-search-ops-kit

A local, agentic-but-deterministic job-search automation system. It runs on your
machine, searches job boards (HH.ru first), scores and packages vacancies,
auto-applies through a real browser under strict safety rules, and notifies you on
Telegram. You drive strategy and edge cases by chatting with an agent in your IDE/CLI.

It ships **empty**: there is no personal data in the repo. After `git clone` you run
`job-search init`, then talk to the `/init` skill to configure everything for yourself.

## Two contours

- **Deterministic pipeline** (`apps/service`): cron queues that do the routine work —
  search -> score -> package -> apply -> notify. No "thinking with a browser" at runtime.
- **Reasoning layer** (chat agent): `AGENTS.md` routes you to skills (roles = scenarios):
  `init`, `tailor`, `resume`, `interview`, `questionnaire`, `playwright-repair`, `analyst`.
  The agent reaches the system only through the **MCP server** / **CLI** — never by
  editing data files directly.

## Subsystems (one package each)

- `packages/contracts` — zod schemas + shared types + the `JobSourceAdapter` interface.
- `packages/core` — env/config/paths, logger, the AI-CLI subprocess runner.
- `packages/db` — SQLite (better-sqlite3 + Drizzle) schema, migrations, repositories.
- `packages/connectors` — one adapter per board (HH.ru) with normalization + dedupe.
- `packages/scoring` — vacancy-scoring.yaml (filters, keyword signals, routing) + apply gate; LLM classify only for `ai_score` route.
- `packages/browser` — Playwright login + auto-apply with full error taxonomy.
- `packages/resume` — Typst renderer (JSON master resume -> PDF).
- `packages/telegram` — grammy notifier + inline-button approvals.
- `packages/memory` — programmatic journal/events + a deterministic consolidation engine.
- `apps/service` — the pipeline service + one-shot stage scripts.
- `apps/cli` — the `job-search` management CLI.
- `apps/mcp` — the MCP server (the strict channel for agents).

## Requirements

- Node.js >= 22.6
- pnpm >= 10
- [Typst](https://github.com/typst/typst) on `PATH` (for resume PDFs)
- At least one agent CLI on `PATH` for AI subprocess calls: `codex`, `agent` (Cursor), or `claude`

## Quick start (from scratch)

```bash
cp .env.example .env          # fill TELEGRAM_*, models, HH_PLAYWRIGHT_*
pnpm install
pnpm exec playwright install chromium

pnpm job-search init          # scaffold the gitignored data/ tree + seed configs
pnpm job-search doctor        # verify environment

# In your IDE/CLI chat, invoke the /init skill and paste your resume.
# The agent writes profile/strategy/evidence/master-resume via MCP (validated, programmatic).

pnpm job-search hh:login      # one-time: log into HH in the browser, session is saved
pnpm dev                      # start the pipeline (dry-run by default)

# When happy, flip auto-apply to real:
#   data/strategy/auto-apply-policy.yaml -> mode: real
# You will then see real applications + Telegram messages.

pnpm job-search resume render --variant ru   # build a PDF
pnpm job-search consolidate                  # derive insights from recent activity
```

## Data & privacy

All user data lives under `data/` (gitignored). The repo is OSS-clean: a `pre-commit`
privacy guard blocks secrets and personal data from ever being committed.

Key profile files:

- `data/profile/user-profile.md` — short positioning summary.
- `data/profile/use-cases.md` — curated cases used for cover letters (1–2 per letter).
- `data/profile/experience-facts.md` + `data/profile/evidence.md` — canonical truth store behind claims.

See [SPEC.md](SPEC.md) for architecture, the safety rules, and the memory model.

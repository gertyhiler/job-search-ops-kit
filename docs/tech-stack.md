# Technology Stack

Pinned for 2026-04-22. All versions are latest stable unless otherwise noted. Update policy is documented at the bottom.

## Application Layer

- **Next.js 16.2.4** (App Router, Turbopack stable by default, Cache Components)
- **React 19.2.4+** — pin is mandatory (patch against CVE-2025-55182 / React2Shell)
- **TypeScript 5.x**

## Styling

- **Tailwind CSS v4** — `@theme` directive, CSS variables, zero-config
- **shadcn/ui@canary** — stable Tailwind-v4 release expected mid-2026; canary is the correct choice now

## Data

- **SQLite** via `better-sqlite3`
- **Drizzle ORM** latest + `drizzle-kit` migrations
- **Better Auth** latest — self-hosted, single user, multi-device-ready

## Monorepo

- **pnpm 10.x stable** (pnpm 11 is in RC; wait for GA)
- **Turborepo** latest
- **TypeScript 5 project references** for incremental builds

## CLI / TUI

- **Ink** latest (React in the terminal)
- **Commander** for `js init`, `js add-vacancy`, `js apply`, `js funnel`, `js today`, `js tick`

## MCP

- **`@modelcontextprotocol/sdk` v1.29.0+** — critical lower bound. Versions 1.10.0–1.25.3 are vulnerable (CVE-2026-25536). v2 alpha is expected in Q1 2026; stay on 1.x stable.
- Our own `packages/mcp-server` — TypeScript + MCP SDK. Single wrapper around SQLite and memory. Tools listed in [architecture.md §5](./architecture.md).

## Browser Automation (two modes, chosen per-site by recipe)

**Mode A — Attend a live browser.** User's own Chrome/Arc, already logged in, user retains control. Agent attaches via the `user-playwright` / browser-use MCP (CDP or extension) and interacts with the active tab. Good for sites with 2FA/CAPTCHA/anti-bot, the first runs of a new recipe, and manual oversight.

**Mode B — Spawn an isolated browser.** Agent launches Playwright with `launchPersistentContext({ userDataDir: 'user-data/runtime/browser-profiles/<site>' })`. The user logs in once into that profile; cookies/session persist; scheduled applier runs thereafter work unattended. Good for vetted career-page recipes and overnight batches with the laptop closed.

**Recipe policy** in `packages/browser-automation/recipes/<site>.yaml`: fields `mode: attended|unattended`, `min_confidence_to_unattend: 0.8`. A new recipe starts `attended`; after N successful runs with `confidence ≥ 0.8` it can be promoted to `unattended` via the dashboard's **Schedules → Promote to live**.

## Scripts Glue

- Python 3.12+ for shared scripts under `scripts/` (sync helpers, event replay, context builders). Deterministic; no LLM calls.

## PDF Rendering

- `@jsonresume/jsonresume-theme-*` + `resumed` CLI for producing targeted resume PDFs from JSON Resume variants.

## Scheduler (DB-driven)

- **Source of truth:** `schedule.next_run_at` in SQLite.
- **In-process tick** (node-cron): only an optimisation; safe to miss.
- **Launch rule:** a task is due iff `next_run_at <= now() AND enabled`. After running, `next_run_at` is recalculated from the **previous scheduled tick** (via cron-parser), not `now()`, so schedules do not drift on miss.
- **Triggers:** app boot sweep, dashboard-request middleware (throttled 1/min), `js tick` from CLI (direct SQLite access), optional launchd poker.
- **Catchup policies:** `run_once_if_overdue`, `skip_if_stale`, `run_all_missed` — see [functional-spec.md §4](./functional-spec.md).
- **Coldstart guard:** rate-limit overdue queue to avoid spawning many subprocesses at once.

## Agent Runner

- **Codex CLI headless** — `codex exec --model <id> --prompt @prompts/roles/<role>.md --mcp .codex/mcp.json --json` — primary background runner. The spawner parses the JSON event stream and writes an `agent_run` row.
- **Cursor Agent** — for interactive sessions (tailor, reviewer, interviewer, strategy brainstorm) and for debugging prompts.

## Update Policy

- Pin major+minor in every `package.json`.
- `pnpm audit` runs in the pre-commit guard.
- Every 2 weeks the `maintainer` role (see `automations/biweekly-dependency-review.md`) runs `pnpm outdated` + `pnpm audit` and produces a `dependency-change-proposal` routed through the same evaluator as strategy proposals.
- Major-version bumps and security advisories always `escalate_to_human`.

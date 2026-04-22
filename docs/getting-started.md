# Getting Started

Full onboarding arrives with `js init` in Milestone 3 (see [implementation-roadmap.md](./implementation-roadmap.md)). Until then, this is a stub describing the intended flow.

## Target Flow (from M3)

1. `git clone <this-repo> job-search-ops-kit && cd job-search-ops-kit`
2. `pnpm install`
3. `js init`
   - Creates `user-data/` structure.
   - Copies `config/defaults/*` into `user-data/config/`.
   - Asks for a resume (PDF / DOCX / hh profile URL) — drop it into `user-data/inbox/resume.*` if preferred.
   - Extracts `master-resume.json` (JSON Resume schema) and drafts `candidate.md`.
   - Opens `docs/first-brief-template.md` in `$EDITOR` for you to fill in; saves as `user-data/brief.md`.
   - Generates `constraints.md`, `preferences.md`, `active-strategy.v0.yaml` with three hypotheses.
   - Scaffolds `.env.local` from `.env.example`.
   - Runs DB migrations and seeds `schedule` from `schedules.seed.yaml`.
   - Runs a dry scout pass and shows 20 candidate vacancies for a first manual review.
4. `next dev` to start the dashboard, or `js today` for the CLI briefing.

## Current State (pre-M3)

The repository is in M1 shape — the public skeleton exists with prompts, schemas, routing, automations, docs. The `packages/` directory is empty until M3. For M0 users, seed artefacts have been imported directly into `user-data/memory/`.

## Verifying Your Clone

Even at this early stage you can sanity-check the privacy guards:

```
git clone <this-repo> /tmp/job-search-check && cd /tmp/job-search-check
ls user-data 2>/dev/null && echo "LEAK" || echo "clean"
```

Expected output: `clean`.

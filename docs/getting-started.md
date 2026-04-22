# Getting Started

Full onboarding arrives with `js init` in Milestone 3 (see [implementation-roadmap.md](./implementation-roadmap.md)). Until then, this is a stub describing the intended flow.

## Target Flow (from M3)

### Canonical path: App-first

1. `git clone <this-repo> job-search-ops-kit && cd job-search-ops-kit`
2. `pnpm install`
3. Start the app/backend runtime.
4. Complete welcome + auth.
5. Upload a resume (PDF / DOCX / hh profile URL) or drop it into `user-data/inbox/resume.*`.
6. Complete the questionnaire / brief.
7. The system:
   - creates `user-data/` structure;
   - copies `config/defaults/*` into `user-data/config/`;
   - extracts `master-resume.json` (JSON Resume schema) and drafts `candidate.md`;
   - writes `user-data/brief.md`, `constraints.md`, `preferences.md`, `active-strategy.v0.yaml`;
   - scaffolds `.env.local` from `.env.example`;
   - writes `user-data/config/runtime-settings.yaml` with the selected runner adapter;
   - runs DB migrations and seeds `schedule` from `schedules.seed.yaml`;
   - kicks off the first dry scout / bootstrap pipeline.
8. Continue from the dashboard: background runs happen automatically, supervised runs surface approvals/prompts in the app, and escalations ask for human input when needed.

### Fallback path: Chat-first

1. `git clone <this-repo> job-search-ops-kit && cd job-search-ops-kit`
2. `pnpm install`
3. `js init`
   - Creates `user-data/` structure.
   - Copies `config/defaults/*` into `user-data/config/`.
   - Asks for a resume and drafts the base profile and strategy.
   - Writes `user-data/config/runtime-settings.yaml` with the selected runner adapter.
   - Runs DB migrations and seeds `schedule` from `schedules.seed.yaml`.
4. Bootstrap or refine the initial state in CLI/chat if preferred.
5. Start the app and continue with it as the control plane.
6. If attended browser work is needed, the app first tries a supervised run and falls back to an external client only when supervised execution is not sufficient.

## Current State (pre-M3)

The repository is in M1 shape — the public skeleton exists with prompts, schemas, routing, automations, docs. The `packages/` directory is empty until M3. For M0 users, seed artefacts have been imported directly into `user-data/memory/`.

## Verifying Your Clone

Even at this early stage you can sanity-check the privacy guards:

```
git clone <this-repo> /tmp/job-search-check && cd /tmp/job-search-check
ls user-data 2>/dev/null && echo "LEAK" || echo "clean"
```

Expected output: `clean`.

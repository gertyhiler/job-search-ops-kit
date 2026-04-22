# Scripts

Thin, deterministic scripts (Python 3.12+ or TypeScript) that do not call LLMs. They are populated from Milestone 2 onwards. Expected inhabitants, per [../docs/architecture.md](../docs/architecture.md):

- `resolve_route.py` — resolves `role + task_kind` against `routing/model-policy.yaml` into a concrete `{model, reasoning_effort, allow_tools}` decision. Used by the scheduler spawner and the CLI.
- `seed_from_resume.py` — extracts a JSON Resume from a PDF / DOCX / hh profile URL and scaffolds `candidate.md`.
- `render_resume.ts` — renders a JSON Resume variant to PDF via `@jsonresume/jsonresume-theme-*` + `resumed` CLI.
- `ingest_events.py` — replays `application-events.jsonl` into the SQLite projection.
- `sync_repo.py` — optional helper for advanced users who want to vendor this kit into a parent repo.

None of these are learning-domain adapters. The previous `_base-kit` synchronisation scripts were removed during normalisation — this kit is no longer a downstream of `_base-kit`.

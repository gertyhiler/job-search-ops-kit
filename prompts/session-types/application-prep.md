# Session Type: Application Prep

Roles: `tailor` → `reviewer` → `applier` (manual outbox in M5.2).

Flow:
1. Pick a vacancy (by id or slug).
2. `tailor` produces resume variant ref + cover letter + answers, saves as a `dry_run` application package.
3. `reviewer` gates the package: approve / revise / reject.
4. On approve, `applier` prepares manual outbox instructions and moves the package to `outbox_prepared`.
5. On revise, bounce back to `tailor` with concrete edits.
6. After the human confirms submission, log `application_event(kind=applied)` with evidence and mark the application `applied`.

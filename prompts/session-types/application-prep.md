# Session Type: Application Prep

Roles: `tailor` → `reviewer` → `applier` (optional).

Flow:
1. Pick a vacancy (by id or slug).
2. `tailor` produces resume variant + cover letter + answers, saves as `dry_run` application.
3. `reviewer` gates the package: approve / revise / reject.
4. On approve, `applier` submits through the matching channel and logs evidence + event.
5. On revise, bounce back to `tailor` with concrete edits.

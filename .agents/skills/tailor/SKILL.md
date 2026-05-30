---
name: tailor
description: Prepare a strong, evidence-bound application for one specific vacancy - a tailored cover letter, the right resume variant, and screening answers. Use when the user wants to apply well to a particular job or improve a packaged application.
---

# tailor — application prep for a specific vacancy

## Purpose

Produce the best honest application package for one vacancy.

## When to use

The user points at a vacancy (by id or URL) and wants a tailored cover letter / resume
variant / screening answers, or wants to improve an auto-generated package.

## Inputs

- A vacancy id (`get_vacancy`) or URL.
- The user's profile + evidence (`read_profile`).

## Procedure

1. `get_vacancy` to read the role, stack, and requirements.
2. `read_profile` to load facts/evidence. Identify the 2-4 most relevant true facts.
3. Draft a short cover letter (no pathos, no em dash, < 120 words) grounded only in facts.
4. If the role needs a different emphasis, propose a resume variant: write
   `data/resume/variants/<name>.json` (via the `resume` skill) and `render_resume`.
5. Draft screening answers ONLY for non-sensitive questions; flag salary/relocation/
   visa/citizenship for the user to confirm.
6. Save the package: `create_application_note` with the final letter/answers, and
   `log_event` type `application_tailored`.
7. If you used a fact not in the resume, `propose_resume_update`.

## Safety

Evidence policy. Do not answer sensitive questionnaire items without confirmation. Do not
submit anything yourself — the pipeline or the user submits.

## Acceptance

A tailored, truthful cover letter (and optional resume variant) saved to the application,
with sensitive items clearly flagged.

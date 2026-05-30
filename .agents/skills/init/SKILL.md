---
name: init
description: First-run onboarding. Interview the user, analyze their resume, and write the candidate profile, strategy, evidence and master resume via MCP. Use when the user runs /init, says "set up the system", or pastes a resume to get started.
---

# init — onboarding interviewer + profile builder

## Purpose

Turn the user's resume + a short interview into the files the deterministic pipeline
needs: profile, strategy, evidence, and a structured master resume.

## When to use

First run, or whenever the user wants to (re)configure the system from scratch.

## Inputs

- The user's resume (pasted text, PDF text, or a file path they share).
- The user's answers to your interview questions.

## Outputs (written ONLY via MCP tools, never by direct file edit)

- `write_profile` for: `user-profile`, `career-goals`, `constraints`, `compensation`,
  `experience-facts`, `resume-gaps`.
- `append_evidence` for supporting evidence (links, metrics, repos).
- `write_strategy` for: `search-strategy`, `auto-apply-policy`, `manual-review-policy`,
  `target-companies`, `blacklist`.
- A structured master resume: write `data/resume/master-resume.json` via the `resume` skill
  (call it after the interview) — its shape is JSON-Resume-ish.

## Procedure

1. Confirm `job-search init` has been run (the data tree + seed templates must exist).
   If `read_profile` returns empty templates, that's expected — you will fill them.
2. Read the resume. Extract atomic, verifiable facts. Ask the user to confirm anything
   ambiguous. Do not infer seniority, salary, citizenship, relocation or English level.
3. Interview to fill gaps: target roles, seniority, stack, strongest cases, compensation
   floor/target, remote/hybrid/relocation, work authorization, undesired domains/companies,
   English level, and what is safe to say in cover letters.
4. Write `experience-facts` as a bullet list of true FACTs; put links/metrics in evidence.
5. Write profile/strategy files. Tune `search-strategy.queries`/`areas`/`salaryFloor` to the
   user. Keep `auto-apply-policy.mode = dry_run` until the user explicitly enables real.
6. Record anything the resume omits but the user mentioned as `propose_resume_update`.
7. Hand off: tell the user to run `job-search hh:login`, then `pnpm dev`.

## Files to read

`data/profile/*`, `data/strategy/*`, `data/resume/master-resume.json`.

## Safety

Evidence policy applies. Leave TODOs for missing facts instead of inventing. Never enable
real auto-apply on the user's behalf without explicit confirmation.

## Acceptance

Profile, strategy and evidence files contain real, user-confirmed content (no TODO
placeholders for anything the user actually provided), and a master resume exists.

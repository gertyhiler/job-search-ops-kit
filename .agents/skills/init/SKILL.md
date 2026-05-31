---
name: init
description: First-run onboarding. Interview the user, analyze their resume, and write the candidate profile, strategy, evidence and master resume via MCP. Use when the user runs /init, says "set up the system", or pastes a resume to get started.
---

# init — onboarding interviewer + profile builder

## Purpose

Turn the user's resume + a short interview into the files the deterministic pipeline
needs: profile, strategy, evidence, classification prompt, and a structured master resume.

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
  `target-companies`, `blacklist`, `vacancy-gates`.
- `write_prompt` for: `vacancy-scoring` — the LLM classification prompt in
  `data/prompts/vacancy-scoring.md` (role fit, applyMode, remote/hybrid rules).
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
5. Write profile/strategy files:
   - `search-strategy`: wide mechanical funnel (queries, areas, excludeKeywords).
   - `vacancy-gates`: mechanical rules on normalized vacancies (ban words, hybrid/salary rules).
   - `vacancy-scoring` prompt: nuanced fit classification for LLM (roles, stacks, manual_review cases).
   - Keep `auto-apply-policy.mode = dry_run` until the user explicitly enables real.
6. Record anything the resume omits but the user mentioned as `propose_resume_update`.
7. Hand off: tell the user to run `job-search hh:login`, then `pnpm dev`.

## Pipeline classification flow (for context)

```
search (wide) → normalize → vacancy-gates.yaml (mechanical) → LLM (vacancy-scoring prompt) → auto / manual_review / reject
```

Mechanical gates run before LLM. Personal nuance belongs in `vacancy-gates.yaml` and the
`vacancy-scoring` prompt — not in repository code.

## Files to read

`data/profile/*`, `data/strategy/*`, `data/prompts/vacancy-scoring.md`, `data/resume/master-resume.json`.

## Safety

Evidence policy applies. Leave TODOs for missing facts instead of inventing. Never enable
real auto-apply on the user's behalf without explicit confirmation.

## Acceptance

Profile, strategy, gates, scoring prompt and evidence files contain real, user-confirmed
content (no TODO placeholders for anything the user actually provided), and a master resume exists.

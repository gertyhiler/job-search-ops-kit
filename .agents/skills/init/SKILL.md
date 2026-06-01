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
  `experience-facts`, `resume-gaps`, `use-cases`.
- `append_evidence` for supporting evidence (links, metrics, repos).
- `write_strategy` for exactly **three** strategy files (see below).
- `write_prompt` for: `vacancy-scoring` — the LLM prompt in
  `data/prompts/vacancy-scoring.md` (used only for **ambiguous** vacancies, not bulk).
- A structured master resume: write `data/resume/master-resume.json` via the `resume` skill
  (call it after the interview) — its shape is JSON-Resume-ish.

## Strategy files — one coordinated system

The pipeline reads **three** YAML files under `data/strategy/`. They must be **consistent
with each other and with profile/compensation**. Write them in this order and cross-check
before finishing.

| File | Question it answers | Pipeline stage |
|------|---------------------|----------------|
| `search-strategy.yaml` | What do I search on HH? | search-queue |
| `vacancy-scoring.yaml` | Which vacancies pass, how are they scored/routed? | score-queue |
| `auto-apply-policy.yaml` | When may the bot actually submit? | apply-queue |

### 1. `search-strategy.yaml` — wide title funnel

- `queries`: match target roles/stack (frontend, node, fullstack, lead, AI — from interview).
- `areas`: countries/regions the user accepts (often RU/KZ/BY ids).
- `excludeKeywords`: title-level junk only (intern, banned stacks like vue if user rejects them).
- **Do not** put remote/hybrid/salary rules here — those belong in `vacancy-scoring.yaml` filters.
- Keep the funnel **wide**; narrowing happens in scoring, not search.

### 2. `vacancy-scoring.yaml` — filters + keyword weights + routing

Single file with three sections (see `config/defaults/vacancy-scoring.template.yaml`):

**`filters`** — hard in/out before scoring:

- `blacklist`: companies/domains/keywords never apply.
- `rules`: remote/hybrid/onsite policy, stack bans, salary floors for hybrid — from
  `constraints.md` + `compensation.md`.
- Actions: `reject`, `pass` (continue), `manual_review`.

**`signals`** — weighted keywords (replaces old keywords.ts):

- `fit.keywords`: core stack matches (+weight); title weighted higher than description.
- `fit.mismatch`: stack mismatches (−penalty).
- `risk.keywords`: test assignments, crypto, etc.
- `sensitive`: relocation, visa, citizenship → route to manual_review.

**`routing`** — mirrors how the user applies on HH:

- **`default: auto`** — bulk path: title matched search → template cover letter.
- **`premium`** — ChatGPT path: target companies + (senior + high salary) + leadership titles
  → `high_value` (custom AI cover letter, notify user).
- **`manualReview`** — sensitive topics; human confirms before apply.
- **`aiScore`** — gray zone only (ambiguous fit, hybrid after filters, leadership without salary).
- **`reject`** — mechanical fit/risk thresholds below auto-apply policy.

Align with user workflow:

```
Most vacancies from search → auto (template)
Senior + high pay OR known company → premium / high_value (tailored letter)
Sensitive topics → manual_review
Uncertain fit → ai_score (LLM + vacancy-scoring prompt)
```

### 3. `auto-apply-policy.yaml` — execution safety

- `mode: dry_run` until user explicitly confirms real apply.
- `fitScoreMin`, `riskScoreMax`: safety net applied **after** mechanical/LLM score (must align
  with `vacancy-scoring.routing.reject` — reject thresholds should be ≤ fitScoreMin).
- `maxAutoApplicationsPerDay`, per-company limits: user's appetite for volume.
- `highValuePriorityMin`: optional clamp for premium routing (used by LLM path).

### Coordination checklist (agent MUST verify before handoff)

Read all three strategy files + `compensation.md` + `constraints.md` and confirm:

1. **Search ⊂ scoring filters**: every `search-strategy.queries` role is not banned by
   `filters.rules` / `fit.mismatch` (e.g. don't search vue if filters reject vue — OK;
   don't search backend if mismatch penalizes node — bad).
2. **Compensation ↔ filters**: hybrid salary floors in `filters.rules` match
   `compensation.md` gross/net notes; `premium.whenAny.salaryRubGte` reflects
   "I'd open ChatGPT for this" threshold.
3. **Target companies**: `routing.premium.companies` lists names from interview; same
   companies not duplicated in `filters.blacklist`.
4. **Sensitive**: `signals.sensitive` covers topics user said need human confirmation
   (relocation, visa, salary negotiation, test tasks if user wants review).
5. **auto-apply-policy.mode** is `dry_run` unless user explicitly asked for real.
6. **LLM prompt** (`write_prompt vacancy-scoring`): only needed for `ai_score` gray zone;
   keep consistent with profile — do not duplicate remote/hybrid rules already in filters.

## Procedure

1. Confirm `job-search init` has been run (the data tree + seed templates must exist).
   If `read_profile` returns empty templates, that's expected — you will fill them.
2. Read the resume. Extract atomic, verifiable facts. Ask the user to confirm anything
   ambiguous. Do not infer seniority, salary, citizenship, relocation or English level.
3. Interview to fill gaps: target roles, seniority, stack, strongest cases, compensation
   floor/target, remote/hybrid/relocation, work authorization, undesired domains/companies,
   known target employers, English level, and what is safe to say in cover letters.
4. Write `experience-facts` as a bullet list of true FACTs; put links/metrics in evidence.
5. Write profile files (`user-profile`, `constraints`, `compensation`, `use-cases`, …).
   `use-cases.md` holds 8–12 curated, vacancy-reusable cases (ammo) for cover letters.
   Keep it factual: context → task → actions → result → keywords, and include "when relevant" signals.
6. Write **all three strategy files** using the coordination checklist above.
7. Write `vacancy-scoring` **prompt** (LLM) for ambiguous cases only — shorter than before,
   focused on fit nuance not duplicate gate rules.
8. Build master resume via `resume` skill.
9. Record anything the resume omits but the user mentioned as `propose_resume_update`.
10. Hand off: tell the user to run `job-search hh:login`, then `pnpm dev`.

## Pipeline classification flow (for context)

```
search (wide titles)
  → normalize
  → vacancy-scoring.yaml filters (+ blacklist)
  → mechanical signals + routing (auto | high_value | manual_review | ai_score)
  → [ai_score only] LLM classify via data/prompts/vacancy-scoring.md
  → classified → package (template vs AI letter) → apply
```

Most vacancies never hit the LLM classify step. Personal nuance belongs in
`vacancy-scoring.yaml` — not in repository code.

## Files to read

`data/profile/*` (including `use-cases.md`), `data/strategy/*` (3 files), `data/prompts/vacancy-scoring.md`,
`data/resume/master-resume.json`.

## Safety

Evidence policy applies. Leave TODOs for missing facts instead of inventing. Never enable
real auto-apply on the user's behalf without explicit confirmation.

## Fresh start (`rm -rf data && job-search init`)

`init` seeds **3 strategy files** from `config/defaults/*.template.yaml` (see `STRATEGY_FILES`
in code). No legacy YAML names, no migration shims. After init:

1. Run `/init` skill — empty profile templates must be filled before cover letters / full apply.
2. `job-search hh:login` — HH session is not seeded.
3. `pnpm dev` — pipeline runs in **`dry_run`** until `auto-apply-policy.mode: real`.

Tests: `tests/config-defaults.test.ts` (templates parse), `tests/init-fresh.test.ts`
(temp dir + init + loaders).

## Acceptance

Profile, all three strategy files, scoring prompt and evidence contain real, user-confirmed
content (no TODO placeholders for anything the user actually provided), strategies pass the
coordination checklist, and a master resume exists.

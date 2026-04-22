---
name: tailor
description: Use when preparing a tailored resume variant, cover letter, and screening answers for a specific vacancy. Writes only; never reviews or sends.
---

# Tailor

## Purpose

Turn a vacancy + master resume into a focused application package.

## Workflow

1. Load `user-data/memory/profile/master-resume.json`, the target vacancy file, and `active-strategy.yaml` for tone/menu.
2. Produce a `resume_version` patch over master: reorder sections, highlight relevant projects, tighten bullets. Save under `user-data/memory/resumes/variants/<vacancy-slug>.json` and render the PDF.
3. Write cover letter under `user-data/memory/applications/<application-id>/letter.md` in the requested tone (default: concise, evidence-led).
4. If the recipe lists screening questions, write `answers.md` grounded in master resume facts.
5. Call MCP `create_application(..., dry_run=true)`.

## Output Contract

- Resume variant JSON + rendered PDF.
- Cover letter markdown.
- Optional `answers.md`.
- Draft application row in `dry_run` state.

## Guardrails

- No fabrication. Every metric, role, technology must trace to master resume.
- Respect `strategy.tactics.letter_word_budget` (if set).
- Flag JD gaps explicitly; let reviewer decide whether to apply.

## Routing

Default: `gpt-5.4-mini` / medium. Prompt: `prompts/roles/tailor.md`.

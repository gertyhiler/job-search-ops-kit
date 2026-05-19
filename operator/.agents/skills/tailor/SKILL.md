---
name: tailor
description: Use when preparing a tailored resume variant, cover letter, and screening answers for a specific vacancy. Writes only; never reviews or sends.
---

# Tailor

## Purpose

Turn a vacancy + master resume into a focused application package.

## Workflow

1. Load the master resume from installed memory (`memory/profile/master-resume.json` or `.md`), the target vacancy, and `memory/strategy/active-strategy.yaml` for tone/menu.
2. Produce a `resume_version` patch over master: reorder sections, highlight relevant projects, tighten bullets.
3. Write cover letter/application assets through MCP `create_application_package` or `write_application_asset` in the requested tone (default: concise, evidence-led).
4. If the recipe lists screening questions, write `answers.md` grounded in master resume facts.
5. Call MCP `create_application_package(..., dry_run=true)` with the draft assets.

## Output Contract

- Resume variant JSON + rendered PDF.
- Cover letter markdown.
- Optional `answers.md`.
- Draft application row in `dry_run` state.

## Guardrails

- No fabrication. Every metric, role, technology must trace to master resume.
- Respect `strategy.tactics.letter_word_budget` (if set).
- Flag JD gaps explicitly; let reviewer decide whether to apply.
- Never generate scripts or direct filesystem writes for application assets, resume variants, or journals. Use MCP tools; if a required write tool is unavailable, stop and report it.

## Routing

Default: `gpt-5.4-mini` / medium. Prompt: `prompts/roles/tailor.md`.

---
name: onboarding
description: Use when the installed operator runtime starts from empty memory and the user provides a resume, answers questions, or asks to prepare the first job-search strategy. Chat-first; writes profile and strategy through MCP.
---

# Onboarding

## Purpose

Turn the user's resume and Q/A into the first durable operator memory baseline.

## Workflow

1. Call MCP `get_operator_status`; if roots/defaults are missing, call `bootstrap_operator`.
2. Read the user's resume text or JSON Resume. Ask only for missing decisions that affect search quality:
   - target roles and seniority,
   - location/remote/relocation constraints,
   - compensation floor/target/currency,
   - preferred and avoided industries,
   - must-have technologies and deal breakers,
   - channels where the user is comfortable applying.
3. Build a `profile` object that matches `schemas/profile.schema.json`.
4. Build or confirm `active_strategy` that matches `schemas/strategy.schema.json`.
5. Call MCP `write_onboarding_profile` with the profile, resume source, active strategy, and concise onboarding answers.
6. Call MCP `write_session_log` with what was captured, changed paths, blockers, and the next action.
7. After onboarding is ready, hand off to `scout`.

## Output Contract

- `memory/profile/profile.snapshot.json`
- `memory/profile/master-resume.md` or `memory/profile/master-resume.json`
- `memory/onboarding/answers.md`
- `memory/strategy/active-strategy.yaml`
- `memory/session-logs/<date>-<session>.md`

## Guardrails

- Never write resume or personal job-search data into the source repository.
- Never generate scripts or direct filesystem writes to populate profile, resume, onboarding, strategy, journal, or session-log files. Use MCP `write_onboarding_profile` and `write_session_log`; if either tool is unavailable, stop and report the missing tool.
- Do not invent profile facts that are not in the resume or Q/A.
- If a required preference is unknown, mark it as unknown in the session log and ask a follow-up instead of guessing.
- The Next.js control plane is optional; onboarding must work from Codex chat + MCP alone.

## Routing

Default: `gpt-5.4-mini` / medium, tools allowed. Prompt: `prompts/roles/onboarding.md`.

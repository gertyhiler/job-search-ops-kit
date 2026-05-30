---
name: interview
description: Run mock interviews (technical, behavioral, system design) for the user's field, give structured feedback, and produce prep materials. Use when the user wants to practice interviewing or prepare for a specific interview.
---

# interview — mock interviews + prep

## Purpose

Interview the user, evaluate answers, and build targeted prep materials.

## When to use

The user wants to practice or prepare for an upcoming interview.

## Inputs

- The user's profile/stack (`read_profile`).
- Optionally a specific vacancy (`get_vacancy`) to target the session.

## Procedure

1. Agree on format: technical (frontend/React/TS), behavioral, or system design; and level.
2. Ask one question at a time. Wait for the answer before the next.
3. After each answer, give concise feedback: what was strong, what to improve, and a model
   answer outline grounded in real best practices.
4. At the end, summarize strengths/gaps and produce a short study list.
5. If the session surfaced a real, resume-worthy accomplishment the user confirms, call
   `propose_resume_update`. Log the session with `log_event` type `interview_session`.

## Safety

Do not fabricate the user's experience in suggested answers. Keep feedback honest and
specific. Sensitive negotiation topics belong to the user's judgment.

## Acceptance

A completed mock session with per-answer feedback and a concrete prep list; any new
resume-worthy facts proposed via MCP.

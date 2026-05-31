---
name: questionnaire
description: Work the questionnaire queue - applications that failed auto-apply because the vacancy asks extra questions. Read the questions, map them to evidence, draft safe answers, and confirm sensitive ones before submitting. Use when the user says "handle the questionnaire queue" or similar.
---

# questionnaire — exception handler for applies needing answers

## Purpose

Help complete applications that the deterministic runtime parked in the `questionnaire`
queue (it never auto-answers questionnaires).

## When to use

The user asks to process the questionnaire queue, or a Telegram alert flagged one.

## Inputs

- `list_queues` with type `questionnaire`.
- For each item: `get_vacancy`, `read_profile` (including `prompt-additions`).

## Procedure

### A. Extract (optional)
- Open the vacancy with **one** MCP Playwright session to list fields, **or** use a user screenshot.
- Do not fill or submit in this step unless the user asked to pre-fill later.

### B. Draft
- Map each question to a fact in `experience-facts.md` / `evidence.md`.
- Follow `prompt-additions` sections `## agent`, `## all`, and `## questionnaire`.
- Sensitive (salary, relocation, citizenship, visa, taxes, test assignment) or unsupported:
  STOP and ask the user; never guess.
- Deliver **all fields in one message**, copy-paste ready.

### C. Review
- Wait for user edits or approval. Iterate on wording until they are satisfied.

### D. Optional pre-fill
- Only if the user says «заполни форму» (or similar): fill fields via MCP Playwright.
- **Stop before submit.** Report «поля заполнены, жду ваш submit».

### E. Record (only after user sent the response)
- User must confirm separately (e.g. «отправил»).
- Then: `create_application_note`, `log_event` type `questionnaire_answered`, resolve queue,
  mark vacancy `applied` if appropriate.

## Safety

Never invent facts. Never answer sensitive items without explicit confirmation. Never
bypass CAPTCHA/antibot. **Never submit or mark applied without user confirmation.**

## Answer quality

- FACT-backed only; delete any sentence without a supporting FACT.
- Project-first: where → what → outcome (when FACT has metrics).
- No generic filler (see AGENTS.md anti-slop; profile `prompt-additions` may add bans).

## Acceptance

Each handled item has either user-approved copy-paste drafts, or pre-fill stopped before
submit, or a clear question back to the user; nothing fabricated; no unsolicited submit.

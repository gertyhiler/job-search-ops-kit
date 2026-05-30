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
- For each item: `get_vacancy`, `read_profile`.

## Procedure

1. `list_queues` (type `questionnaire`) to get pending vacancies.
2. For each: open the vacancy (you may use the attended browser MCP), read the questions.
3. Map each question to a fact in `experience-facts.md`/`evidence.md`.
   - Standard, safe questions with a supporting fact: draft the answer.
   - Sensitive (salary, relocation, citizenship, visa, taxes, legal, test assignment) or
     unsupported by evidence: STOP and ask the user; never guess.
4. Present drafts to the user. On approval, submit via the attended browser, then
   `create_application_note` with the answers and `log_event` type `questionnaire_answered`.
5. Resolve the queue item (the pipeline will pick up the new application status).

## Safety

Never invent facts. Never answer sensitive items without explicit confirmation. Never
bypass CAPTCHA/antibot.

## Acceptance

Each handled item has either approved+submitted answers (logged) or a clear question back
to the user; nothing fabricated.

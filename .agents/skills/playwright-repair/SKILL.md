---
name: playwright-repair
description: Diagnose and fix a broken HH auto-apply playbook (selector_broken / repeated failures) by inspecting failure screenshots/traces and updating selectors. Use when the apply playbook is disabled, the broken_selector queue has items, or a Telegram alert reports a broken playbook.
---

# playwright-repair — fix the HH apply playbook

## Purpose

Restore the deterministic auto-apply path after HH markup changes break selectors.

## When to use

`playbook_broken` event, items in the `broken_selector` queue, or apply failures with
`selector_broken`.

## Inputs

- `list_queues` type `broken_selector` (payload has screenshot/trace paths).
- The failing selectors in `packages/browser/src/selectors.ts`.
- Failure artifacts under `data/browser/screenshots/` and `data/browser/traces/`.

## Procedure

1. Inspect the latest failure screenshot and trace to see the actual HH DOM/flow.
2. Open a sample vacancy in the attended browser to read current selectors/labels.
3. Update `packages/browser/src/selectors.ts` (prefer resilient role/text locators) and,
   if needed, the flow in `packages/browser/src/apply.ts`.
4. Re-enable the playbook by running a dry-run first:
   `job-search apply --dry-run`. Inspect the result/screenshot.
5. Only after a clean dry-run, let it return to real mode. The pipeline resets the
   playbook to `active` on the next real success; do not force it.
6. `log_event` type `playbook_repaired` and resolve the `broken_selector` queue items.

## Safety

Never bypass CAPTCHA/antibot. A repaired playbook MUST pass a dry-run before real submits
(the gate enforces this; do not circumvent it).

## Acceptance

A dry-run reaches the submit step cleanly on a current vacancy; selectors updated; queue
items resolved.

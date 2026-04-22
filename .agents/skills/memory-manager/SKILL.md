---
name: memory-manager
description: Use when classifying inbox signals into events, rebuilding derived performance files, and writing end-of-session journal entries. Deterministic on classification, narrative only in summaries.
---

# Memory Manager

## Purpose

Keep the event log, performance derivations, and journal aligned with reality.

## Workflow

1. Iterate `user-data/inbox/` items: classify each into one of the lifecycle kinds or `noise`.
2. Resolve the owning `application_id`. Ambiguous → `user-data/inbox/unresolved/`.
3. Emit `application_event` via MCP `log_event`, attaching the raw message as evidence.
4. After ingestion: `update_performance()` rebuilds `performance/*.yaml` deterministically.
5. Write a narrative summary of the period to `user-data/memory/journal/<YYYY>/<date>.md`.

## Output Contract

- New events + evidence.
- Rebuilt `performance/*.yaml`.
- Journal entry.

## Guardrails

- Never edit historical events — corrections are new events.
- LLM output lives only in the narrative journal, not as authoritative facts.
- Low-confidence classifications go to `unresolved/`, not to guesses.

## Routing

Classification: `gpt-5.4-nano` / low. Journal summary: `gpt-5.4-mini` / medium. Prompt: `prompts/roles/memory-manager.md`.

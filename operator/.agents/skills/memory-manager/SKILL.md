---
name: memory-manager
description: Use when classifying inbox signals into events, rebuilding derived performance files, and writing end-of-session journal entries. Deterministic on classification, narrative only in summaries.
---

# Memory Manager

## Purpose

Keep the event log, performance derivations, and journal aligned with reality.

## Workflow

1. Iterate installed `inbox/` items under the data root: classify each into one of the lifecycle kinds or `noise`.
2. Resolve the owning `application_id`. Ambiguous items stay unresolved instead of being guessed.
3. Emit `application_event` via MCP `log_event`, attaching the raw message as evidence. For `applied`, require explicit human confirmation evidence.
4. After ingestion: call MCP `update_performance` to rebuild `performance/*.yaml` deterministically.
5. Write a narrative summary of the period through MCP `write_journal_entry` and a session-level summary through MCP `write_session_log` when appropriate.

## Output Contract

- New events + evidence.
- Rebuilt `performance/*.yaml`.
- Journal entry.

## Guardrails

- Never edit historical events — corrections are new events.
- LLM output lives only in the narrative journal, not as authoritative facts.
- Low-confidence classifications go to `unresolved/`, not to guesses.
- Never generate shell/Node/Python scripts or direct filesystem writes to populate memory, performance, journals, or profile data. If a required MCP write tool is unavailable, stop and report the missing tool.

## Routing

Classification: `gpt-5.4-nano` / low. Journal summary: `gpt-5.4-mini` / medium. Prompt: `prompts/roles/memory-manager.md`.

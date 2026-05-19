# Operator Runtime Contract — job-search-ops-kit

This installed workspace is the production operator surface for job-search workflows.

## Scope

- Use this workspace for role execution, MCP-backed orchestration, runtime prompts, and production `.agents/skills`.
- Do not treat this directory as the source code repo.
- Do not edit the operator contract here as a development workflow; change the source repo and reinstall/update instead.
- Primary operator UX is **Codex app chat-first orchestration** (Codex is the orchestrator; the control plane is supporting/observational).

## Storage Layout

- Config and secrets live under `~/.config/job-search`.
- User data, memory, evidence, and inbox live under `~/.local/share/job-search`.
- Mutable runtime state (SQLite projection, browser profiles, audit, health) lives under `~/.local/state/job-search`.
- Cache and disposable scratch live under `~/.cache/job-search`.

## Runtime Rules

- Start operator sessions by checking MCP `get_operator_status`; call `bootstrap_operator` if roots/defaults/projection are missing.
- Durable writes to profile, strategy, vacancies, applications, events, performance summaries, journals, and session logs must go through the installed `job-search` MCP tools.
- Do not create ad-hoc shell, Node, Python, or one-off scripts to populate or repair runtime memory. If the needed MCP tool is missing or unavailable, stop and report the missing tool instead of writing files directly.
- If the native MCP server/config is missing or unreachable, use the CLI mirror `job-search mcp call <tool> --args '<json>'` before declaring the workflow blocked.
- For first-run onboarding, use the installed `onboarding` skill and write durable memory through MCP `write_onboarding_profile`.
- Production role skills live under `.agents/skills/<role>/SKILL.md` in this installed workspace.
- MCP config for Codex/Cursor is rendered locally in `.codex/config.toml` (Codex) and `.cursor/mcp.json` (Cursor).
- All role sessions, MCP-backed runs, and runtime agent conversations belong here, not in the source repo.
- Strategy changes, event writes, and evidence capture remain append-only / auditable by contract.
- Narrative journal entries must use MCP `write_journal_entry`; meaningful sessions should end with MCP `write_session_log`. Low-level audit alone is not enough for Codex-first operation.
- In the Codex-first phase, prefer attended/human-in-the-loop workflows and only log `applied` with explicit human confirmation + evidence.

## Safety

- Never store personal data inside the source repo.
- Never write runtime memory back into public source-controlled files.
- If the installed runtime drifts from the source repo, reinstall or update instead of patching the runtime manually.

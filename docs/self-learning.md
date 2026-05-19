# Self-Learning

The self-learning loop belongs to the **installed operator runtime**, not to the source repo as an always-on working surface.

Current state:

- memory and event files already have a deterministic contract;
- replay and DB recovery already work;
- prompts/defaults for strategy and memory exist in source form;
- the installed runtime bundle can ship those assets.

Later milestones add:

- MCP tools for strategy proposal/decision/apply,
- Codex-first role execution inside the operator workspace,
- attended browser workflows and supervised confirmations,
- scheduled background loops only after the human-in-the-loop flow is proven,
- control-plane visibility into strategy evolution (supporting surface).

The key invariant after the split is unchanged:

- files under the external data root remain the source of truth;
- SQLite under the external state root remains rebuildable;
- strategy changes stay explicit and auditable rather than silent.

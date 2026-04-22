# Session Type: Ad-hoc

Default role: `support`. Roles: `analyst` for quantitative questions, `support` for factual lookups.

Flow:
1. Resolve the intent (factual lookup vs. analysis vs. tactical advice).
2. Route to the smallest role that can answer.
3. Return a direct answer with source pointer.
4. If the question implies mutation (change strategy, apply to a vacancy), hand off to the relevant role — never mutate from ad-hoc.

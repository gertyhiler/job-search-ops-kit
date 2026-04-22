# Session Type: Daily Scouting

Primary role: `scout`. Runs once a day (default 07:00). Produces a fresh candidate list against the active strategy.

Flow:
1. Load active strategy and profile constraints.
2. Run `scout` across configured boards (hh, LinkedIn optional, career pages).
3. Write new `vacancy.md` files and DB rows.
4. Update `today-context.md` with "new candidates: N" and top 5 highlights.
5. Exit — applying is a separate session.

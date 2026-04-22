# Architecture Diagram

End-to-end dataflow: agents call MCP servers; `job-search` MCP is the sole write path into memory and DB; file memory is the source of truth; SQLite is a projection.

```mermaid
flowchart LR
    subgraph agents [Agents]
        codex[Codex runner]
        cursor[Cursor IDE]
    end

    subgraph mcp [MCP servers]
        hhmcp[hh-mcp OAuth]
        lmcp[linkedin-mcp]
        pwmcp[playwright]
        jsmcp[job-search-mcp]
    end

    subgraph memory [File memory - source of truth]
        profile[profile/]
        strategy[strategy/]
        vacancies[vacancies/]
        applications[applications/]
        events[events/ jsonl]
        journal[journal/]
        evidence[evidence/]
        perf[performance/]
        reviews[reviews/]
    end

    subgraph db [SQLite projection]
        sqlite[(Drizzle schema)]
    end

    subgraph app [Self-hosted Next.js 16 app - started on demand]
        web[Next.js dashboard]
        sched[DB-driven sweep - next_run_at in SQLite]
        cli[Ink CLI/TUI - js tick, js today]
    end

    triggers["Triggers: app boot, dashboard request, js tick, optional launchd poker 15min"] --> sched
    sched -->|"sweep: due tasks"| spawn[Subprocess spawner]
    spawn -->|"codex exec with role, model, prompt"| agents
    agents --> mcp
    hhmcp -->|"search, apply"| vacancies
    hhmcp --> events
    jsmcp -->|"read, write"| memory
    jsmcp --> sqlite
    jsmcp -->|"auto_decide_strategy, apply_strategy_change"| strategy
    memory -->|"ingest, replay"| sqlite
    web --> sqlite
    web --> memory
    web -->|"manage schedules, next_run_at, catchup"| sched
    cli --> jsmcp
    cli -.->|"standalone MCP when app is offline"| jsmcp
    events -->|"derive via memory-manager run"| perf
    perf -->|"feeds"| strategy
```

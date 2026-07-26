<!-- description: Entry point for conducks — what it is, the 14 MCP tools and which question each answers, and how to orient in an unfamiliar codebase. Use when you need to pick a conducks tool or are starting a session on a project. -->

# Conducks Guide

Conducks is a structural intelligence engine. It parses a codebase into a queryable graph
(symbols as nodes, calls/imports as edges, stored in DuckDB), then answers structural questions
live from that graph instead of from prose in a doc.

Two surfaces:
- **MCP tools** — 14 of them, listed below. This is the tool surface.
- **Skills** — the guidance surface. This file plus seven task-specific ones.

Nothing works until the graph exists. Run `conducks analyze [path]` first (see `conducks-cli`).
Most tool responses carry `indexStaleness` — if it says stale, re-analyze before trusting output.

## Two layers

The tool surface has two halves, and the difference is what each NEEDS, not what each is about:

| layer | reads | needs `conducks analyze` first? |
|---|---|---|
| **docs** | the authored markdown under `docs/` | **no** — works on any folder, opens no database, holds no lock |
| **code** | the structural graph in `.conducks/` | **yes** — an unanalyzed project has nothing to answer from |

Start a session on the docs layer: it tells you what is on the table and what the binding decisions
are, instantly, before any pulse has run. Reach for the code layer once you need wiring.

Each tool's MCP description is prefixed `[docs layer]` or `[code layer]` so the split survives into
any client.

## The 14 tools, by the question they answer

### Docs layer

```
conducks_docs         the open threads in the authored docs, rooted at the decisions that own
                      them: each ADR with unfinished work, the todo phases building it, the next
                      task in each, and what is blocked by what. Finished work is omitted.
                      layer="all" (default) also returns conventions + memory, the constraints to
                      load once per session; layer="board" omits them for repeat calls;
                      raw=true returns the full unprojected board.
```

### Code layer

**"Where is it? What exists?"**
```
conducks_query        symbol/concept search — fuzzy by name, or a named Oracle SQL template
                      (find_usages, hotspots, dead_code, cycles, entry_points, …)
conducks_status       graph health, node/edge counts, staleness; modes: health, map (entry
                      points + hotspots), manifest (LLM summary), pulse (refresh one file)
conducks_graph_query  raw SELECT against the DuckDB graph store — anything the templates miss
```

**"How does this work? What is around it?"**
```
conducks_context      neighbours within a graph radius, ranked by relevance, token-budgeted
conducks_explain      one symbol's risk profile — gravity, entropy, churn, complexity
conducks_trace        execution/data flow from a symbol; mode=path finds a route to a target
conducks_flows        every named execution flow (entry point + the symbols it calls)
```

**"What breaks if I change it?"**
```
conducks_impact       blast radius of a symbol; upstream (default) = what breaks, downstream = its dependencies
conducks_diff         structural change: uncommitted (git diff mapped to symbols), historical,
                      drift (vs the previous pulse)
```

**"Is it healthy? What is dead?"**
```
conducks_audit        integrity audit — cycles, god objects, violations; modes: scan, advice,
                      guard (blocks over a risk threshold), archeology (decay over pulses),
                      fallback (legacy fallback detection)
conducks_prune        dead code — ORPHAN, UNUSED_EXPORT, STALE_IMPORT
conducks_coverage     overlay an istanbul coverage-final.json onto function spans; a dark (0%)
                      function with no callers is dead, one that was covered and went dark broke
```

**Mutation (the only one that writes source)**
```
conducks_rename       graph-verified rename across all structural references.
                      dryRun defaults to true. Re-analyze after a real run.
```

## Orienting in an unfamiliar codebase

1. `conducks_status mode=health` — does a graph exist, and is it fresh?
2. `conducks_status mode=map` — entry points and hotspots: where the weight sits.
3. `conducks_flows` — what the system actually does, end to end.
4. `conducks_audit mode=scan` — cycles and god objects, so you know the broken parts early.
5. `conducks_query` a name you care about, then `conducks_context` around it.

Before editing anything: `conducks_impact`. Before deleting anything: `conducks_prune`, then
`conducks_impact` on the flagged symbol to confirm nothing calls it.

## The other conducks skills

| skill | use it for |
|---|---|
| `conducks-workflows` | explore · debug · impact · refactor · audit — the probe sequence for each |
| `conducks-docs` | the documentation standard: what goes where, and how each file is structured |
| `conducks-cli` | the terminal command surface |

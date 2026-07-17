# 0004 — Coverage as a range-join onto node line-spans, shown as fill detail
Status: Accepted
- Date: 2026-07-17

## Context
todo01 needed to bind live test coverage (istanbul/c8 output) to the structural graph so
functions could visually "light up" as tested. The taxonomy reconcile (ADR 0003) added
`STATEMENT`/`BRANCH` tiers, which raised the question of whether coverage should be represented
by emitting a graph node per statement and per branch. Doing so would flood the graph with
execution-detail nodes — the exact over-granularity complaint that started this project (the
target was "function level max" per commit `ae88fb7`).

## Decision
Coverage is computed at bind time as a range-join: each covered source line is matched to the
node whose `[lineStart, lineEnd]` span contains it, and the hit count rolls up
STATEMENT → BEHAVIOR → FILE → PACKAGE. Branch coverage is computed from istanbul's
`branchMap`/`b` counters and shown as fill detail inside each function's BEHAVIOR row (e.g.
`taken/total br`, highlighted when arms are untaken — the "error path never ran" signal) rather
than as separate BRANCH nodes in the graph. This was proven end-to-end by self-analysis: conducks
ran its own jest suite with istanbul coverage and range-joined it onto its own graph
(`adjacency-list.ts`: `addNode` 86%, `addEdge` 57%, `traverseAStar`/`findSymbolAtLine` dark),
recorded in `docs/todos/todo01.md` as "SPINE PROVEN (2026-07-17) — C2 + C3 end-to-end, fully
real."

## Consequences
The graph stays function-level regardless of how granular the underlying coverage data is —
`calculateComplexity` can show 100% line coverage but 1/2 branches taken without adding a single
node to the graph. This gives drift detection (ADR-adjacent C7 work) a stable, non-flooded graph
to reason about, and keeps the Mirror visualization at a scale a human can read. The tradeoff is
that per-branch detail is only visible by drilling into a node's overlay, not by querying the
graph structure directly — anything that wants branch-level structural analysis has to go through
the coverage bind, not the graph.

# 0017 — ARCH-3 means a module import cycle (amends 0016)
Status: Accepted
- Date: 2026-07-20
- Promoted: docs/architecture/modules/domain/governance/MODULE.md (Deferred — the call-cycle finding); docs/architecture/modules/core/graph/algorithms/MODULE.md ("Filtering is the caller's job"); docs/memory.md

## Context
ADR 0016 predicted that excluding type-only imports would take conducks' self-audit to 0 circular
dependencies. Implementing it did not: the ARCH-3 cycle
(`traversal → ranker → cycle-detector → adjacency-list`) survived, because it was never carried by
`IMPORTS` edges at all. The edges forming it are:

```
CONSTRUCTS  adjacency-list::…  -> cycle-detector::CycleDetector
CALLS       cycle-detector::…  -> adjacency-list::ConducksAdjacencyList.getNeighbors
CALLS       ranker::…          -> adjacency-list::ConducksAdjacencyList.getNeighbors
```

One direction is a real runtime dependency (`adjacency-list.ts:536` imports and calls
`CycleDetector.detect`). The other is not: `cycle-detector` calls `graph.getNeighbors(...)` on a
**parameter**, and conducks resolves that call onto `ConducksAdjacencyList` only because the
parameter carries a type annotation. Compiled `cycle-detector.js` imports nothing from
`adjacency-list.js`, so no module-level cycle exists — the loop is closed by a type-directed call
resolution, one level below where 0016 was looking.

This exposes the same consumer inconsistency 0010 and 0016 each hit once: `advisor.ts:24` already
restricts cycles to import-level by ignoring CALLS/CONSTRUCTS/ACCESSES, while the audit path does
not. ADR 0010's own prose scoped its target to "genuine cross-file **import** cycles", and the tool
it cross-validated against (`madge`) measures module imports — so the audit has been reporting a
stricter thing than either the prose or the validation baseline assumed.

## Decision
ARCH-3 means a **module import cycle**: a cycle over `IMPORTS`/`DEPENDS_ON` edges that survive
compilation. Cycle detection for ARCH-3 ignores `CALLS`, `CONSTRUCTS`, `ACCESSES` and
`TYPE_REFERENCE` alongside the containment edges from 0010 and the type-only imports from 0016. The
audit path aligns with `advisor.ts`, which already worked this way.

A mutual-call tangle that does not cross a module import boundary is a real property of the code but
is not a circular dependency, and is not reported under ARCH-3. Deferred, not dropped: surfacing it
separately (as a distinct "call cycle" finding, with its own severity) is worth building once there
is a consumer for it — it is deliberately out of ARCH-3 rather than discarded.

This amends 0016, whose Consequences section predicted an outcome that the implementation
disproved. 0016's rule — a dependency is what survives compilation — stands and is unchanged; only
its claim about which finding this clears was wrong.

## Consequences
`conducks audit` on conducks reports 0 circular dependencies, and the audit now agrees with both
`advisor` and `madge` on what a cycle is. The hub-overload count also fell as 0016 intended:
`registry/index.ts::unit` cleared entirely (74 → under the limit of 50) and `::registry` dropped
77 → 60, still over and now a real finding rather than a type-import artifact.

The cost is a genuine loss of signal: symbol-level mutual calls stop being flagged anywhere until
the deferred call-cycle finding is built. The pattern across 0010, 0016 and this ADR is worth
naming — each time, a finding was traced to the graph counting a relationship that is not the
relationship the finding claims to measure. New governance rules should state which edge types they
mean before they ship.

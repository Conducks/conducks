# core/graph/algorithms — cycle detection, ranking, traversal

**Part of:** [core/graph](../graph.md). Three static classes: `CycleDetector`, `StructuralRanker`,
`GraphTraversal`.

**Responsibility:** graph math, and only graph math. Tarjan SCC for cycles, damped PageRank for
gravity plus entry-point detection, BFS/A* for traversal and blast radius.

**Boundaries:** they answer "what is connected how", never "is that acceptable". `detect()` returns
SCCs; whether an SCC is an ARCH-3 violation is [governance](../../domain/governance.md)'s
call. That separation is why the same detector serves the audit, the advisor and the guard with
three different filters.

**Deferred / not built:** no incremental recomputation. Ranking runs over the whole graph each pulse;
fine at current scale, and the obvious thing to revisit if it stops being fine.

## They look like a circular dependency and are not

`adjacency-list` imports all three; all three name `ConducksAdjacencyList` in their signatures. That
reads as a cycle in any source-level tool — `madge` on TS source reports exactly this.

It is not one. Each algorithm uses the type **only as a static-method parameter annotation** — no
`new`, no `instanceof`, no static access — so TypeScript erases the import entirely. The compiled
`algorithms/*.js` import nothing from `adjacency-list.js`, and `madge` on compiled JS agrees there is
no cycle.

**Do not "fix" this by inverting the dependency or extracting an interface.** The shape is correct;
the tools that flag it have a type-erasure blind spot, which is the whole subject of ADR 0016. If you
change a signature here to take a concrete value rather than a type, you *would* create a real cycle
— that is the thing to avoid.

## Filtering is the caller's job, and callers used to disagree

`detect()` takes `ignoreTypes` and `ignoreTypeOnly` and applies them literally. It has no opinion. For
years the three callers passed three different filters, which is why one false positive kept
reappearing under a different command. They now share `IMPORT_CYCLE_IGNORED_EDGE_TYPES` (ADR 0017).

Two properties worth keeping in mind when adding a caller: an SCC is an **unordered set**, not an
ordered path — walking it as `c[i] → c[i+1]` inspects non-edges, a bug that shipped once — and a
single-node component is only a cycle if it has a genuine self-edge.

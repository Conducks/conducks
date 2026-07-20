# core/graph — the structural graph and its algorithms

**Layer:** core. Imports contracts only. Everything above depends on it; it depends on nothing in
the codebase.

**Responsibility:** owns the in-memory graph — nodes, edges, adjacency, and the algorithms over it
(Tarjan SCC cycle detection, gravity/PageRank ranking, traversal). It owns the *shape* of a node and
an edge, and the ID normalization rules everything else must obey.

**Boundaries:** it does not decide what a finding *means*. Cycle detection returns SCCs; whether an
SCC is an ARCH-3 violation is governance's call. It does not parse and it does not persist — it
receives a built spectrum and hands out a queryable structure.

**Deferred / not built:** edges are the only durable carrier of analysis signal. Arbitrary node
properties do not survive a persist/reload round-trip — `addNode` copies an allowlist into the
stored skeleton and the DB has fixed columns. Passing a signal from an analysis pass to an audit
therefore requires a distinctly-id'd edge, not a node property. This is a constraint, not an
oversight; changing it means changing the schema.

## Two rules that are easy to break

**IDs are lowercased.** Mandatory for APFS, where `/Users/Said/` and `/users/said/` are the same
file — mixed-case IDs silently fragment the graph. The cost is that TypeScript's type and value
namespaces, which differ only by case, collapse: the variable `nodeId` and the type `NodeId` become
one key. Anything classifying a symbol by its bare lowercased name is therefore wrong; producers
carry the pre-lowercase spelling in `metadata.original` for consumers that need it.

**Not every edge is a dependency.** The graph is deliberately rich because impact, trace and
dead-code legitimately want containment, type and call edges. Governance must filter *down* to what
it means — `STRUCTURAL_EDGE_TYPES`, `NON_RUNTIME_EDGE_TYPES`, `IMPORT_CYCLE_IGNORED_EDGE_TYPES` exist
for exactly this, and every past false-positive hunt (ADRs 0010, 0016, 0017) traced back to a
consumer that skipped the filter. A new finding must state which edge types it traverses before it
ships.

## Why the algorithms look circular but aren't

`adjacency-list` imports the algorithms; the algorithms name `ConducksAdjacencyList` only as a
parameter type. TypeScript erases those imports, so no runtime cycle exists — confirmed in the
compiled output, and `madge` on compiled JS agrees. Tools reading TS *source* will report a cycle
here. That is their type-erasure blind spot, not a defect to fix (ADR 0016).

# core/graph — the structural graph

**Layer:** core. Imports contracts, plus core siblings (the prism/spectrum types, `utils`) — nothing
from domain or above. Everything above depends on it.

**Responsibility:** owning the in-memory graph — the shape of a node and an edge, adjacency, the ID
normalization rules everything else must obey, and ingestion of a spectrum into that structure.

**Boundaries:** it holds structure and answers structural questions. It does not parse, does not
persist, and does not decide what a finding *means* — [governance](../domain/governance.md)
owns judgement.

**Deferred / not built:** **edges are the only durable carrier of analysis signal.** Arbitrary node
properties do not survive a persist/reload round-trip — `addNode` copies an allowlist into the stored
skeleton and the DB has fixed columns. Passing a signal from an analysis pass to an audit therefore
requires a distinctly-id'd edge, not a node property. A constraint, not an oversight.

## Parts

- **[algorithms/](graph/algorithms.md)** — Tarjan cycle detection, gravity ranking, traversal.
- **[linkers/](graph/linkers.md)** — binding bare names and specifiers to real nodes across files
  and repos.

`boundary-classifier` (internal / stdlib / dependency origin, ADR 0014) and `diff-engine` (graph-to-
graph comparison) are single-purpose and self-describing.

## Two rules that are easy to break

**IDs are lowercased.** Mandatory for APFS, where `/Users/Said/` and `/users/said/` are the same file
— mixed-case IDs silently fragment the graph. The cost is that TypeScript's type and value
namespaces, which differ only by case, collapse: the variable `nodeId` and the type `NodeId` become
one key. Anything classifying a symbol by its bare lowercased name is therefore wrong, and producers
carry the pre-lowercase spelling in `metadata.original` for consumers that need it.

**Not every edge is a dependency.** The graph is deliberately rich because impact, trace and
dead-code legitimately want containment, type and call edges. Consumers must filter *down* to what
they mean — `STRUCTURAL_EDGE_TYPES`, `NON_RUNTIME_EDGE_TYPES`, `IMPORT_CYCLE_IGNORED_EDGE_TYPES` exist
for exactly this. Every past false-positive hunt (ADRs 0010, 0016, 0017) traced to a consumer that
skipped the filter.

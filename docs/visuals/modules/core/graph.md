# core/graph — the structural graph

**Layer:** core. Imports contracts, plus core siblings (the prism/spectrum types, `utils`) — nothing
from domain or above. Everything above depends on it.

**Responsibility:** owning the in-memory graph (`core/graph/adjacency-list.ts`, `core/graph/graph-engine.ts`) — the shape of a node and an edge, adjacency, the ID
normalization rules everything else must obey, and ingestion of a spectrum into that structure.

**Boundaries:** it holds structure and answers structural questions. It does not parse, does not
persist, and does not decide what a finding *means* — [governance](../domain/governance.md)
owns judgement.

**A degraded answer is labelled, never disguised.** When a code path here cannot get the real
answer, it refuses (throws, returns null, drops the row) or returns something the caller can tell
apart from a real result — never a value indistinguishable from success. A guessed edge must not
carry the same confidence as a resolved one: `graph-engine.ts:273` treats a non-existent node as
worse than a missing edge for exactly this reason (ADR 0046).

**A hand-built fixture or emitted edge uses the producer's id shape.** `NodeId` is a type alias for
`string`, so nothing stops a test — or a linker — from naming an endpoint with the wrong shape
(a bare file path, or an id missing its enclosing scope). The mistake does not error: it returns an
empty result at runtime, or worse, a confident edge whose node was deleted as unused by
`pruneTaxonomy`'s reachability check. `getNeighborsByFilePath()` (`adjacency-list.ts:760`) is the
only sanctioned way a file path reaches a graph lookup; every id otherwise follows the shapes
`repository::<name>`, `directory::<abs-path>`, `<file>::unit`, `<file>::<symbol>` (ADR 0028).

**Uses:** takes the parsed spectrum from `core/parsing` (via `graph-engine`'s ingestion) and the
canonical id rules from [contracts](../contracts.md); builds and holds the in-memory adjacency
structure that `graph/algorithms` and `graph/linkers` both operate on; hands the result to
`core/persistence` for storage and to everything above (domain, interfaces) for structural queries.

**Deferred / not built:** **edges are the only durable carrier of analysis signal.** Arbitrary node
properties do not survive a persist/reload round-trip — `addNode` copies an allowlist into the stored
skeleton and the DB has fixed columns. Passing a signal from an analysis pass to an audit therefore
requires a distinctly-id'd edge, not a node property. A constraint, not an oversight.

The allowlist has a companion trap. What is NOT in the skeleton is kept as "meat", and the split was
made by deleting a hand-written list of keys — so a key added to the skeleton and forgotten in that
list was stored TWICE, in both halves, and the two could disagree after a partial update. It strips
every skeleton key by construction now (`for (const key of Object.keys(skeletonNode.properties))`),
which is the only version that cannot drift when the skeleton grows.

## Features

- **[algorithms/](graph/algorithms.md)** — Tarjan cycle detection, gravity ranking, traversal.
- **[linkers/](graph/linkers.md)** — binding bare names and specifiers to real nodes across files
  and repos.

`boundary-classifier` (internal / stdlib / dependency origin, ADR 0014), `diff-engine` (graph-to-graph
comparison), `cluster-rule` (which ecosystem a node belongs to) and `external-nodes` (the properties
an induced external node carries) are single-purpose and self-describing.

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

## A dangling edge must not carry a confident score

`processors/call.ts`'s `CallProcessor` used to stamp 0.85 confidence whenever it resolved the
RECEIVER'S FILE, which says nothing about whether that file declares the member — an id no node has
could be presented as a fact at 0.85. Whether a reference resolved is only knowable AFTER linking, so
the correction lives in the post-link sweep: `persistence.sweepUnresolvedGuesses`
(`core/persistence/persistence.ts:1175`) re-stamps every surviving dangler to `UNRESOLVED_CONFIDENCE`
(`src/contracts/built-ins.ts:190`) and prints the count. The invariant this protects: **no dangling edge
carries confidence ≥ 0.6**, which is what makes a caller's `WHERE confidence < 0.6` mean something.
Anything reading `edges.confidence` as trust, or any new emitter choosing a confidence, must import
`UNRESOLVED_CONFIDENCE` rather than add a second literal (ADR 0104).

## `resonate()` runs AFTER the final flush — its edges are not persisted for free

`bindNeuralCircuits`, `bindRouteCircuits` and `bindPulseCircuits` (`graph/graph-engine.ts:174-176`)
all add edges to the in-memory graph inside `resonate()` (`graph-engine.ts:170`), which the pulse
calls after the last wave flush. A pulse then ends with `save()`
(`src/lib/core/persistence/persistence.ts:885`), which writes metadata and the pulse row and has
NEVER written node or edge rows in any mode — so every edge those binders create is dropped unless
something explicitly saves it. `ConducksGraph.lastResonanceEdges` (`graph-engine.ts:157`) collects
them, and the pulse calls `saveEdges` on that collection separately. Any new binder added inside
`resonate()` inherits this: assert the edge is in the VAULT after a pulse runs, not merely that the
binder ran.

## A two-sided invariant fails on the side nobody asserts

`bindNeuralCircuits` (`src/lib/core/graph/graph-engine.ts:174`) once wrote `edge.targetId` directly
instead of calling `rebindEdgeTarget` (`src/lib/core/graph/adjacency-list.ts:560`). The edge then
pointed at the new target while `inEdges` still filed it under the old one. `impact` walks UPSTREAM,
so "who calls this" lost exactly the edges the binder had just repaired.

The forward direction stayed correct, and the forward direction is what a test naturally checks — an
assertion on `edge.targetId` passes against the broken version and proves nothing. **When a
structure keeps a derived index, the test asserts the DERIVED side.** Both cases in
`tests/unit/core/graph/neural-rebind-index.test.ts` were confirmed RED against a restored bare
assignment before the test was accepted.

## Removing the Ghost Local strip RAISED the dangling rate, and that is correct

A strip used to degrade a fully-qualified target id to its bare last segment when the node was not
resident in memory. Removing it (todo22#P7) moved dangling from **0.501% to 3.509%** on one subject
and 1.089% to 1.676% on this repository.

That is not a regression, and a reader meeting those numbers needs to know why. Before, `<file>::db.query`
became `db.query` and was then either fuzzy-matched onto whatever else shared that name — a WRONG
edge, reported with confidence — or swept as a guess. Now the edge keeps its exact target and dangles
honestly when the target does not exist. A higher dangling rate is the honest number replacing a
lower dishonest one.

## Glossary
- **skeleton** — the fixed allowlist of node properties `addNode` copies into the stored form; a
  property outside it does not survive a persist/reload round-trip.
- **STRUCTURAL_EDGE_TYPES / NON_RUNTIME_EDGE_TYPES / IMPORT_CYCLE_IGNORED_EDGE_TYPES** — the shared
  filters a consumer applies to say which edges count as "a dependency" for its own purpose.

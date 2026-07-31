# 0042 — the vault is the source of truth; memory holds a working set, not the graph
Status: Accepted
- Amended by: 0043, 0060
- Date: 2026-07-30

0060 then withdrew what remained of the sizing. Measured twice on `mentorseed`, the reload this
record is about costs 21-27 MB and the WHOLE read half is roughly 33 MB of a 686 MB peak — under 5%
— so todo23's remaining phases were closed as void rather than deferred. The projection DISCIPLINE
this record argues for survives and shipped; only its cost estimate is gone.

0043 disproved this record's DIAGNOSIS by experiment while keeping its decision. The transaction
holds nothing releasable (committing per wave changes peak RSS by 0.03%), DuckDB's cache is not the
cause (`memory_limit` from 256 MB to 19.1 GiB changes nothing), and the reload now costs +55 MB
rather than the +235 MB measured here — batching the per-row writes absorbed it. The stage table
below is what the trace said; it is not what the levers say. Read 0043 for the sizing before acting
on any number in this record.

## Context

A 974-unit project peaks at 994 MB of resident memory, and almost none of it is the project. The
source is 9 MB and reading it costs 9 MB. Measured per stage on that pulse:

| stage | native memory |
|---|---|
| boot, 12 grammars, allocator floor | ~130 MB |
| tree-sitter trees during a wave | +87 MB |
| vault writes held for the pulse transaction | +200 MB |
| fetching 9,861 nodes and 28,737 edges back | **+293 MB** |

The JavaScript heap never exceeds 148 MB, so this is not object overhead and no JS-side
restructuring reaches it. Two of those four lines are the database, and the same rows are resident
twice: once as uncommitted transaction state, then again as query results.

The read half is the one with no defence. Every wave flushes to the vault and clears memory — and
then `persistence.load()` pulls the whole graph back so `resonate()` and the linkers can walk it,
undoing the saving the waves just made. `calculateGravity` needs node ids, one kind field and the
edge list: 38,598 edges as integer pairs is roughly 300 KB. It is handed 9,861 node rows carrying a
1.4 KB `metadata` JSON blob each, which it never reads. Three orders of magnitude more than the
algorithm requires.

The direction was already set twice and not carried far enough. ADR 0038 made the load lazy so a
reader that answers from SQL pays nothing; ADR 0040 serves readers from a snapshot. Both treat the
in-memory graph as the thing to avoid loading. Neither removed the load from the writer.

## Decision

**The vault is the source of truth. Memory holds only what a computation is running on right now,
and nothing loads the graph to walk it.** A consumer states the projection it needs and queries for
that; it does not receive a materialised graph and pick fields out of it. The audit behind this:

| consumer | how it gets its data |
|---|---|
| `pruneTaxonomy`, `updateRisks` | already SQL — the shape everything else moves toward |
| `induceVirtualLibraries` | dangling targets are a `LEFT JOIN`, not a scan of every edge |
| `IntraLinker.resolve` | unit-to-symbol map and IMPORTS adjacency are a `GROUP BY` |
| `bindPulseCircuits` | per-node outgoing edges are a join on `edges` |
| `updateRanks` | one UPDATE from computed values |
| `calculateGravity` | the edge list ONLY, as a compact array read from SQL |

**PageRank is the one genuine exception, and it is kept.** Thirty power iterations over every edge
cannot stream cheaply, so the edge set stays resident for the duration. What changes is its shape:
integer pairs, not node rows. The exception is about the algorithm, not about the row format it was
accidentally given.

**Not chosen: a faster in-memory graph.** ADR 0038 already measured that road and closed it — after
a load the graph retains 21 MB while RSS sits at 199 MB, so the remainder is allocator behaviour and
a typed-array rewrite of the node store buys nothing. The cost is not how nodes are represented in
memory; it is that they are in memory at all.

**Not chosen: dropping the atomic pulse to release the write half.** The 200 MB of uncommitted rows
is the price of a killed `analyze` leaving the previous graph intact rather than a half-written one.
That is a real guarantee, it is what commit `34ba398` was written to provide, and this record does
not spend it. See the open question.

**Not chosen: keeping the reload and merely narrowing it.** Narrowing is the first step and is worth
taking on its own — one pass at it already returned 34 MB — but it leaves the architecture inverted.
A narrower `SELECT` still says "fetch the graph, then walk it"; the decision here is that consumers
ask questions instead.

## Consequences

Every future consumer has to state what it reads. That is more work per feature than receiving a
graph and helping itself, and it is the point: the current design makes the expensive thing invisible
and the cheap thing indistinguishable from it.

The gain is bounded and worth naming honestly. Removing the read half entirely returns ~293 MB of a
994 MB peak. The write half is ~200 MB and is deliberately kept. Boot and parsing are ~217 MB and are
legitimate. So a fully converted pulse still costs roughly 500 MB on this subject — better, not
small. Anyone expecting the vault to make analyze cheap should read that number first.

Some consumers get slower in wall time. A `GROUP BY` per wave costs more than a Map lookup against an
already-loaded graph. Nothing here has been measured for time, only for memory, and a conversion that
trades 293 MB for a minute of extra runtime would be a bad trade this record does not authorise.
Measure both sides per consumer.

`bindRouteCircuits` is already dead and this makes it visible rather than fixing it. It reads
`isRoute`, `isRequest`, `url`, `method` and `path`, none of which survive into the skeleton
`addNode` keeps, so after any reload it sees `undefined` and binds nothing. Converting it to SQL
means deciding whether cross-service HTTP binding is a feature or parse-time-only behaviour, which
is a separate call.

`Open:` how the write half releases its 200 MB, if it should. Per-wave commits, a savepoint per wave,
and writing to a sibling vault and swapping (the ADR 0037 and 0040 mechanism) all release it and cost
different amounts of the rollback guarantee. No threshold has been set for how much of that guarantee
is spendable, and this measurement does not set one — the question is what an interrupted analyze is
allowed to leave behind, which is a product call rather than an engineering one. Carried by
todo23#P0.

# 0083 — the vault loads materialised, not streamed
Status: Accepted
- Date: 2026-08-01
- Builds: 0060
- Enforced by: tests/unit/core/deferred-graph-guard.test.ts and tests/unit/core/lazy-graph.test.ts (walking an unmaterialised graph is refused, not answered emptily)

## Context

`load()` pulls the whole `nodes` result into an array, then the whole `edges` result, then builds the
graph from both. That shape looks obviously wasteful: peak memory holds every row AND the graph built
from them at the same moment, and the edge array is fetched BEFORE the node loop has even started, so
it is held for the entire ingestion for no reason.

`todo21` carried it as deferred work on a recorded saving of 111 MB materialised against 98 MB
streamed, blocked on an API detail: `db.each`'s completion callback never fires in duckdb 1.4.4, so a
load that waits for it hangs. `stream()` returns an async iterable and terminates normally, so the
blocker was real but narrow.

## Decision

**Keep the arrays. Streaming is 2.4x worse, and so is the smaller fix.**

The streamed version was built and it works — the premise was wrong, not the API. Peak RSS across a
full mentorseed load (20,092 edges), sampled every 5 ms, three runs per arm:

| arm | peak RSS | peak heap | wall |
|---|---|---|---|
| materialised, both queries back-to-back (**shipped**) | **125 MB** | 26 MB | 248 ms |
| streamed via `stream()` | 302 MB | 56 MB | 250 ms |
| arrays kept, edge query moved AFTER node ingestion | 271 MB | 39 MB | 245 ms |

The third arm is the interesting one. It removes the one genuinely wasteful thing in the old shape —
holding the edge array across the node loop — and is still 2.2x worse than doing nothing. Both losing
arms have one property in common: **they separate the two queries in time.** So the cost is not the
row arrays at all; it is whatever the driver holds between them, and issuing both back-to-back is the
cheapest measured shape.

The 111-vs-98 figure that motivated the task measured the NODE half alone. Measure the whole load and
it inverts.

## Consequences

- No code ships from this. The measurement is the deliverable, and the task is DROPPED rather than
  deferred — the work is not owed, because the saving does not exist.
- Wall time is identical across all three arms (~248 ms), so there is no second reason to want it.
- **`streamRows()` was not kept.** An unused public API that looks like the better way is how this
  gets re-proposed; the record is the thing that should survive, not the code.
- This says nothing about streaming on the WRITE path. `voyager.streamBatches` batches ingestion
  during a pulse and memory.md still records that as mandatory on large repos — a different stage,
  a different measurement, unchanged by this.
- Anyone re-proposing it should reproduce the table above first. The harness samples RSS on an
  interval rather than reading heap at the end, because the arrays are released before the function
  returns and an end-of-call reading shows nothing.

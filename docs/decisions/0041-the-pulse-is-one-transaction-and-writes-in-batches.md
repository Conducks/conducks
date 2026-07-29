# 0041 — the pulse is one transaction, and that is only affordable in batches
Status: Accepted
- Enforced by: tests/unit/core/persistence/batched-insert.test.ts (a pulse-sized write stays far under what one statement per row costs, last-wins survives the deduplication batching needs, a write larger than one batch splits and loses nothing, an aborted pulse still leaves no rows, and every batch size both divides DuckDB's 2048-row vector and stays under the bound-parameter cap)
- Date: 2026-07-29

## Context

`analyze` wraps its whole pulse in one transaction — `beginPulse()` opens it and only `save()`
commits — so a killed analyze never commits and the previous good graph survives instead of a
half-written one. That was landed as `34ba398` on 2026-07-19 with no record of its own, which is
part of why what follows went unnoticed for ten days.

`saveNodes` and `saveEdges` wrote one row per statement, and they read `owned = !this.inPulse` to
decide whether to commit. So the atomic pulse silently changed what those two methods cost. DuckDB
allocates transaction-local storage PER STATEMENT and coalesces none of it before the COMMIT.

Measured on a 26-column table, 20,000 rows:

| how the rows are written | DuckDB memory | per row |
|---|---|---|
| one statement per row, inside one open transaction | 17,281 MB | 885 KB |
| one statement per row, self-committing | 15 MB | 0.8 KB |
| batched 500 per statement, inside one open transaction | 169 MB | 8.6 KB |

A factor of 1150 between the first two rows, and the atomic pulse moved every install from the
second to the first. Real analyze runs died at 19.1 GiB — DuckDB's default budget, 80% of a 24 GB
machine — partway through wave 3, having written roughly 20,000 nodes. The arithmetic matches.

Three explanations of this were written down before anything was measured, and all three were
wrong: that uncommitted rows were PINNED and could not spill (the cost is per statement, not per
row retained); that it failed during the discovery flush before wave 1 (it fails at wave 3); and
that the duplicated `metadata` column carried the weight (measured at 1382 bytes average, 28 MB
total, irrelevant). CONDUCKS-31 exists because of exactly this, and it was written days earlier.

## Decision

**The pulse stays one transaction, and writes go in batches.** `insertBatched()` builds one
multi-row `INSERT OR REPLACE` per batch instead of one statement per row. Because the cost is per
statement, this buys the memory back without touching the guarantee: 169 MB against 17,281 MB for
the same rows, still one transaction, still rolling the whole pulse back when it is killed.

**The batch is capped by PARAMETER count, not row count** — 10,000. The node driver passes bound
parameters through `Function.prototype.apply`, so 26 columns times 2,000 rows throws
`RangeError: Maximum call stack size exceeded` in JavaScript before DuckDB is reached. A row count
safe for 10-column edges is not safe for 26-column nodes, so the cap has to be on the thing that
actually overflows.

**And the batch is then rounded DOWN to a power of two**, which is a second, independent limit that
this decision originally shipped without and paid for. DuckDB processes in vectors of 2,048 rows,
and a multi-row `INSERT OR REPLACE` at a batch that does not divide that vector killed the process
with `INTERNAL Error: Unaligned fetch in validity and main column data for update`, inside
`MergeIntoGlobalState::Sink -> PhysicalUpdate::Sink`. MEASURED at the original batch of 384: about
one run in three, on a FRESH vault as well as an aged one, so neither vault corruption nor a timing
artefact. At 256 the same analyze ran 20 times with no failure, on two different projects.

The rule is asserted directly rather than through behaviour, because the crash is NONDETERMINISTIC:
a test that runs a pulse twice would have passed while broken two times in three, which is exactly
how this reached a commit. `batchSizeFor()` is public for that reason.

**Not chosen: delete-then-insert instead of `INSERT OR REPLACE`.** It avoids the crashing MERGE path
entirely and measured TEN TIMES better in isolation — 22 MB against 212 MB for 20,000 rows written
twice, at identical wall time. It also broke the real pulse with
`Duplicate key "id: ecosystem::path" violates primary key constraint`, which a standalone probe of
the same shape (overlapping ids, varying NULLs, file-backed and in-memory) could not reproduce. A
10x memory win is worth returning to, but not while the mechanism is unexplained. `todo22#P7`.

**Rows are deduplicated on their id, last one winning.** `INSERT OR REPLACE` applied one row at a
time lets a later row overwrite an earlier one; the same two rows inside a single multi-row
statement would try to update one row twice and fail. Deduplicating first preserves the old
semantics exactly rather than approximately.

**Not chosen: committing per wave.** It fixes the memory and gives up the reason the transaction
exists — an interrupted analyze would leave a partial graph, which is the worse bug and the one
`34ba398` was written to prevent.

**Not chosen: a savepoint per wave, or writing to a sibling vault and swapping.** Both were on the
table while the cause was believed to be retained rows. Both are real mechanisms and both cost
something, and neither is needed once the cost is known to be per statement. This is the whole
value of measuring before choosing: the tradeoff being deliberated did not exist.

**Not chosen: lowering `memory_limit`.** Tried and reverted. At 2 GB it fails identically with
`failed to pin block (1.8 GiB/1.8 GiB used)` — a lower ceiling moves the wall closer, and it would
break the projects that currently work.

## Consequences

Analyze no longer grows without bound during a pulse, and the guarantee that made the transaction
worth having is untouched. The regression test asserts DuckDB's own accounting through
`duckdb_memory()` rather than a proxy, and it was mutation-checked: forcing one row per statement
takes the same test from 1.4 s and under 500 MB to 28.5 s and 3,707 MB.

Any write path added later inherits the same trap. A new row-by-row writer inside the pulse will
cost 885 KB per row again, and nothing outside `saveNodes`/`saveEdges` is currently pinned against
it. The rule is that a write inside the pulse batches; the test only covers the two methods that
exist today.

Batching is not free of judgement. 8.6 KB per row is still an order of magnitude above the 0.8 KB a
self-committing writer pays, because transaction-local storage genuinely holds the uncommitted rows.
A pulse large enough will still exhaust memory — it just takes roughly 100 times more rows to get
there. No project has been measured at that size, and this record does not claim a ceiling it has
not tested.

`Open:` whether the orchestrator should stop the pulse on the first flush failure instead of
running every remaining wave against an aborted transaction. It is why the OOM was reported as
`TransactionContext Error: Current transaction is aborted` and why the real cause stayed hidden for
so long. `todo22#P5` carries it.

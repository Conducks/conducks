# 0041 — the pulse is one transaction, and that is only affordable in batches
Status: Accepted
- Enforced by: tests/unit/core/persistence/batched-insert.test.ts (a pulse-sized write stays far under what one statement per row costs; last-wins survives deduplication; a write larger than one batch splits and loses nothing; an aborted pulse leaves no rows; every batch stays under the bound-parameter cap; and the statement stream contains ZERO deletes — existing rows are UPDATEd, new rows INSERTed, which is the only level the DuckDB bug below can be tested at)
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

**The pulse stays one transaction, and writes go in batches.** `insertBatched()` writes many rows
per statement instead of one statement per row. Because the cost is per
statement, this buys the memory back without touching the guarantee: 169 MB against 17,281 MB for
the same rows, still one transaction, still rolling the whole pulse back when it is killed.

**The batch is capped by PARAMETER count, not row count** — 10,000. The node driver passes bound
parameters through `Function.prototype.apply`, so 26 columns times 2,000 rows throws
`RangeError: Maximum call stack size exceeded` in JavaScript before DuckDB is reached. A row count
safe for 10-column edges is not safe for 26-column nodes, so the cap has to be on the thing that
actually overflows.

**And the write is UPDATE-or-INSERT, split by existence — never delete-and-reinsert.** Deleting and
re-inserting the same primary key inside one transaction hits DuckDB's over-eager index checking
(duckdb/duckdb#2241, #16520, #16604; edge cases remain after the partial fix in #15836, still
present in 1.4.4) and dies with `Duplicate key ... violates primary key constraint`. The trigger is
NOT the key's own history: captured and delta-shrunk, the minimal repro is BEGIN; delete+insert one
batch of OTHER committed rows; then delete+insert a batch containing the victim — a key written only
ONCE. Both halves are required, every single-row probe of the pattern passes, and the failure
survives vault compaction. So each batch now probes which ids exist (a read, costing no
transaction-local storage, seeing this pulse's own earlier writes), UPDATEs those via one
`UPDATE ... FROM (VALUES ...)` statement per batch, and plainly INSERTs the rest. The pattern the
bug needs no longer occurs in `insertBatched` at all, and that ABSENCE is what the test asserts —
a green run proves nothing about a bug this layout-sensitive.

`INSERT OR REPLACE` stays excluded: multi-row it compiles to a MERGE, and DuckDB crashes inside
`MergeIntoGlobalState::Sink` with `INTERNAL Error: Unaligned fetch in validity and main column data
for update`, about one run in three at some batch shapes.

**How this was finally pinned down, because the method is the lesson.** Four hand-built fixtures of
increasing realism failed to reproduce the crash — each encoded a THEORY of the pulse, and the
theory was the unreliable part. What worked: `CONDUCKS_SQL_LOG` records every write statement of a
real failing run as JSONL; replaying that log verbatim against a copy of the failed vault reproduced
it deterministically on the first attempt; greedy delta-debugging shrank 36 statements to 5.

**Not chosen, and RECORDED BECAUSE IT WAS PARTLY ACCIDENTAL: delete-then-insert with repeat writes
tracked and turned into UPDATEs.** The previous decision here. It was right about repeat writes —
the discovery flush and a wave both record the containment skeleton, and re-inserting a key this
transaction already inserted does fail — and its 5 clean runs on the failing vault were still luck:
the statement log of that build shows the victim key STILL going delete-then-insert, surviving only
because converting repeats to updates shifted the batch composition the bug is sensitive to. It also
measured well (22 MB against 212 MB for 20,000 rows written twice), which is a reminder that a fix
can be fast, tested, measured, and still wrong about why it works.

**Not chosen, and RECORDED BECAUSE IT WAS WRONG: rounding the batch to a power of two.** The first
fix for the crash assumed the batch had to divide DuckDB's 2,048-row vector, since the error says
"unaligned". Twenty consecutive clean analyzes on one project and five on another looked like
proof. It was not: on a third input the same build crashed 4 times out of 4. The alignment theory
explained the error message, not the error. The batch is still rounded to a power of two because the
code that does it is harmless, but it is NOT what fixes the crash and must not be trusted as such.

**Rows are deduplicated on their id, last one winning.** `INSERT OR REPLACE` applied one row at a
time let a later row overwrite an earlier one; a plain INSERT of both would violate the primary key. Deduplicating first preserves the old
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

The crash this record avoids was believed fixed TWICE — by batch alignment on the strength of 25
consecutive passes, and by the repeat-write UPDATE on the strength of 5 — and both beliefs failed
further scrutiny. What settled it was a deterministic replay of a captured statement log, shrunk
mechanically. Treat any future "it stopped happening" about a nondeterministic failure as unproven
until the statement log reproduces it and the fix makes the PATTERN absent rather than the symptom
quiet. `CONDUCKS_SQL_LOG=<file> conducks analyze` captures the log.

One delete-then-insert cycle per key remains structurally possible outside `insertBatched`:
`purgeUnits` deletes a unit's rows and the wave re-inserts them. That is a SINGLE cycle with no
churn between the delete and the insert of the same key — the shape every probe passes, and the
shape the pre-batching code ran for weeks. Stated so nobody mistakes "the pattern is gone" for a
claim wider than what `insertBatched` controls.

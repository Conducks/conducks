# 0043 — the pulse already writes and forgets; RSS is a high-water mark, not a holding
Status: Accepted
- Amends: 0042
- Date: 2026-07-30

ADR 0042 attributed a 994 MB peak to two causes: ~200 MB of rows held by the single pulse
transaction, and ~293 MB of rows fetched back for PageRank. Both numbers came from reading stage
deltas out of a memory trace. Neither survived being tested directly. The decision 0042 makes — the
vault is the source of truth, consumers query for projections — still stands. Its diagnosis of WHY
memory is high does not, and the work it implies is smaller and differently shaped than it claimed.

## Context

Three experiments, each disproving a stated cause of the 994 MB.

**The transaction holds nothing releasable.** A build that commits at the end of every wave, so the
vault owns each wave's rows and DuckDB is free to drop them, peaks at 918,405,120 bytes. The
unmodified single-transaction build peaks at 918,716,416 bytes. A 0.03% difference on a subject where
the transaction supposedly held 200 MB.

**DuckDB is not caching it.** `memory_limit` defaults to 80% of RAM — 19.1 GiB here — and conducks
never set it, which looked like the obvious answer. Sweeping it across a 75x range changed nothing:

| memory_limit | peak RSS |
|---|---|
| default (19.1 GiB) | 874 MB |
| 2 GB | 826 MB |
| 1 GB | 874 MB |
| 512 MB | 853 MB |
| 256 MB | 868 MB |

**The reload is no longer expensive.** 0042 measured the node fetch at +235 MB. Re-measured after
the per-row writes were batched (todo22#P8), the same fetch costs +55 MB, and cutting the query to
`SELECT id, canonicalKind` — the minimum PageRank needs — brings it to +25 MB. The whole win
available from narrowing is about **30 MB**, not 293 MB. The earlier figure was real when taken; the
batching work absorbed it as a side effect.

What the trace does show is native memory climbing monotonically through the waves — 255 MB after the
discovery flush, 414, 601, 618, 634, 668 — and then FALLING, 564 MB to 481 MB across the linkers.
Memory that falls was never held.

## Decision

**Treat RSS as a high-water mark of allocator arenas, not as data the process is holding.** The rows
are written and forgotten; what remains is address space the allocator has not returned to the OS and
will reuse. That is why committing does not help, why capping DuckDB's budget does not help, and why
the number falls on its own later in the pulse.

**0042's direction is kept and its sizing is corrected.** Consumers should still ask the vault for
projections rather than receive a materialised graph — that is a design property worth having, and
`getAllNodes()` handing out skeletons while callers pick fields out of them is how
`bindRouteCircuits` came to read five fields that do not exist. But it is now a **clarity** argument,
not a memory one. Anyone picking up todo23 expecting 293 MB back will not find it.

**Not chosen: pursuing the remaining native memory.** It is ~660 MB, it is outside the JS heap
(148 MB max) and outside DuckDB's tracked budget, and it is reused rather than leaked. Reaching it
means the allocator or the native addons, which is a different discipline from anything else in this
project and has no measured user-facing cost attached to it. Left alone deliberately.

**Not chosen: setting `memory_limit` anyway.** It changes nothing here and a value low enough to bind
would make DuckDB spill to `temp_directory`, trading memory for I/O on a workload that is not memory
constrained. An earlier attempt at 2 GB, before the writes were batched, failed outright with
`failed to pin block`.

## Consequences

todo23 shrinks. Phase 0's question — what an interrupted analyze may leave behind — is **void**:
committing per wave buys no memory, so there is nothing to trade the rollback guarantee for. Phase 4's
prediction of "roughly 500 MB after the read half is removed" is withdrawn.

This record's own "~30 MB from narrowing the reload" was ALSO wrong, and it was wrong the same way
everything before it was: derived from a stage delta rather than from an experiment. Phase 1 shipped
and a two-run A/B of the whole pulse gives 831 MB narrow against 838 MB full — 7 MB, noise. Shrinking
one stage does not lower a peak another stage sets, which is the very thing this record says RSS is.
The lesson survives its own author: a stage delta is not a lever until it has been pulled.

The measured peak on that subject is now **881 MB**, down from 1,019 MB, entirely from batching the
per-row writes (todo22#P8) — the one intervention that did move the number. That is the pattern worth
carrying: per-statement costs inside the pulse are real and measurable, and structural memory
attribution from stage deltas is not.

Five explanations for this project's memory have now been measured and killed: retained rows, wave
size, holding the source, the JS heap, and the twelve grammars. This record adds three more — the
transaction, DuckDB's cache, and the reload's size. The through-line is that every one was derived
by reading a profile rather than by changing one thing and re-measuring. `CONDUCKS_MEM_TRACE` shows
WHERE memory is; only an experiment shows WHY.

`Open:` whether the native ~660 MB matters to anyone. It has no measured cost — wall time is
unaffected by every lever tried, and no user report exists. Nobody should spend on it until a real
constraint appears, and if one does, the question is whether it is allocator retention or an addon
leak, which `heaptrack` or `malloc` zone statistics would answer rather than any conducks-side
change. No todo carries this yet, deliberately.

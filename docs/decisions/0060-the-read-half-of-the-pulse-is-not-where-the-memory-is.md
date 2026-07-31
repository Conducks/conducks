# 0060 — the read half of the pulse is not where the memory is
Status: Accepted
- Enforced by: tests/integration/features/pulse-writes-every-table.test.ts (the pulse still produces a complete graph after the reload it keeps)
- Builds: 0042, 0043
- Date: 2026-07-31

## Context

todo23 exists to remove `persistence.load()` from the pulse. Its remaining phases were sized against
one number: the reload costs **+293 MB**, so PageRank should read an edge list, the linkers should
ask the vault, and the reload should disappear.

That number has now been wrong three times, and this record is the third correction.

- ADR 0042 attributed 293 MB to the reload.
- ADR 0043 disproved the transaction half of that diagnosis by experiment and revised the reload to
  ~30 MB, from a stage delta.
- todo23#P1 was then measured end to end and came out at **7 MB, which is noise** — the todo's own
  words. Its lesson is written into the file: "shrinking one stage does not lower a peak another
  stage sets."

Phase 2 was still carrying the original 293 MB. Measured on `mentorseed` — the subject the todo
names, 326 commits, 974 files, 9,910 nodes — twice:

| stage | run 1 | run 2 |
|---|---|---|
| last wave flush (peak-setting) | 653 MB | 619 MB |
| node rows fetched | +20 MB | +14 MB |
| edge rows fetched | +5 MB | +5 MB |
| nodes ingested | +2 MB | +1 MB |
| **reload, total** | **+27 MB** | **+21 MB** |
| PageRank | +1 MB | +25 MB |
| linkers and virtual induction | +5 MB | +9 MB |

**The whole read half is roughly 33 MB of a 686 MB peak — under 5%.** PageRank's own delta swings
between 1 MB and 25 MB across two identical runs, which is not a measurement of PageRank; it is the
noise floor. ADR 0043's warning about stage-delta attribution applies to this table too, so 33 MB is
an upper bound rather than a holding.

The memory is in the write half. From the same trace: discovery flush 311 MB, then the waves take it
to 653 MB. The single largest jump is the wave-1 vault flush at +124 MB, and native memory climbs
188 MB → 335 MB across it and never returns.

## Decision

**todo23 Phases 2, 3 and 4 are closed as void on measurement, not deferred.** There is no 293 MB to
reclaim, and the acceptance criteria cannot be met by the work they describe:

1. **Phase 2 — PageRank reads an edge list.** Worth at most the 20 MB the node fetch costs, and it
   cannot remove the reload, because the reload at `analysis/index.ts:204` serves `resonate()`, the
   linkers, virtual induction and doc governance — not ranking alone. The comment above it says
   "reload graph from vault so PageRank runs on the full node/edge set", which is how the phase came
   to be scoped to the ranker; the code below it disagrees with the comment.
2. **Phase 3 — the linkers ask the vault.** Its own acceptance criterion allows no more than a 10%
   wall-time regression, and its own text says trading 293 MB for a minute of runtime is a bad
   trade. At 33 MB the trade is worse by an order of magnitude, and the risk is unchanged.
3. **Phase 4 — the reload is gone, or its last owner is named.** Nothing to remove once 2 and 3 are
   void. **The owner is named here instead**, which was the phase's fallback outcome: the reload
   exists because the orchestrator clears the in-memory graph between waves (ADR 0041), so every
   consumer that needs a whole-project view — the ranker, `IntraLinker`, induction, `GOVERNS` —
   needs it rebuilt. That is one reload for four consumers, and it costs 5% of the peak.

The todo anticipated this. Its context reads: "Phases 3 and 4 may turn out unnecessary once Phases 1
and 2 land, and that is a real outcome rather than a shortfall." Recording that outcome is the
honest close.

**The projection discipline that survives is Phase 1's, and it already shipped.** ADR 0042's design
argument — that a consumer taking a materialised graph and picking fields out of it will drift, as
`bindRouteCircuits` did when it read five fields that do not survive a reload — is real and is not a
memory argument. Phase 1 shipped the shallow load on exactly those merits and was explicit that it
"costs nothing and buys nothing measurable". Nothing in Phases 2-4 adds to that.

**Not chosen: converting PageRank anyway, for the design.** `calculateGravity` WRITES `rank`,
`gravity` and `kineticEnergy` back onto every node, and it calls `detectEntryPoints`, which reads
`name`, `filePath`, `kind`, `label` and `canonicalKind` and writes `isEntryPoint`. So its projection
is most of the skeleton, and it needs objects to write to. The todo describes it as reading "node
ids, one kind field, and edges", which is the ranker's first half only. A conversion would be
invasive, would not shrink the projection much, and would buy a measured ~20 MB.

**Not chosen: leaving the phases open as deferred.** A phase whose premise has been disproved is not
waiting for capacity; it is waiting for nothing. Leaving it open would keep a 293 MB claim in the
repository after three measurements have contradicted it, and the next person to plan against
todo23 would plan against the same wrong number a fourth time.

## Consequences

`persistence.load()` stays in the pulse, with the reason written at the call site rather than in a
todo. Anyone proposing to remove it now has to beat 5%.

todo23's acceptance line — "no stage of `analyze` materialises the graph to walk it, and
`CONDUCKS_MEM_TRACE=1` shows no fetch stage above 50 MB" — is half met and half withdrawn. **No
fetch stage exceeds 50 MB today**: the largest is the node fetch at 20 MB, so that half passes as
written. The first half is withdrawn, because materialising the graph is what four consumers need
and the cost of it is not what the todo assumed.

todo22 carries the same stale figure in an open task — "`persistence.load()` reloading the entire
graph for PageRank costs **230 MB**, the largest single step". It is corrected there rather than
left to be found again. The largest single step is the wave-1 vault flush.

The peak on `mentorseed` is 686 MB, against the 881 MB ADR 0043 recorded for this project. Those are
different subjects and are not comparable; what is comparable is the shape, and the shape is that
the write half sets the peak in both.

`Open:` native memory climbs 188 MB → 335 MB across the wave-1 flush and does not return, which is
consistent with todo22's separate finding that parse adds ~152 MB of native memory that is never
released. Whether these are the same allocation seen from two stages is unknown — both are stage
deltas, and this record has just spent its length arguing that stage deltas over-attribute. It
needs an A/B, not another trace. Carried by todo23#P5.

# todo49 — a repository's first analyze produces a thinner graph than its second
Status: done
- Acceptance: analyzing a repository from no vault produces the same edge set as `--force` over the result, per edge type, on all three frozen subjects — and a test pins the parity so it cannot regress quietly.
- Builds: 0051, 0144

## Context

MEASURED with the vaults deleted, then `--force` over the cold result:

| subject | cold | after force | delta |
|---|---|---|---|
| scraper | 5,294 / 17,285 | 5,294 / 17,342 | +57 edges |
| orchestrator | 6,647 / 23,701 | 6,647 / 23,797 | +96 edges |
| sofie | 10,546 / 34,683 | 10,545 / 34,931 | −1 node, +248 edges |

Isolated to ONE edge type by diffing the composition on a copied subject: every other type is
identical to the row, and `PULSES_TO` goes **6 → 63** on scraper. So the whole cold-start gap is the
handover binder, and the inputs it reads are not the difference — `reason='assignment'` edges are
4,182 in both states.

Everyone analyzes a repository for the first time exactly once, and a second `analyze --force` fixes
it, which is why this survived: the projects it was developed against had all been analyzed many
times.

**PRIORITY CORRECTED 2026-08-07, and the correction matters more than the finding.** This record
first claimed the cold run "answers `flows` from a tenth of the handovers". That was asserted, not
measured, and it is WRONG. Measured since:

- The gap is **0.33% / 0.40% / 0.71%** of all edges on the three subjects — 57, 96 and 248 of
  17,342 / 23,797 / 34,931.
- It is confined to `PULSES_TO`, which is **0.39%** of the graph.
- `flow-engine.ts` reads `CALLS` and `ACCESSES` and does **not** read `PULSES_TO` at all. Neither do
  `impact`, `trace` or `context`. Its consumers are `linker-intra` (resolution) and one dangling
  check in governance.

So no user-facing answer measurably changes between a cold graph and a warm one. This is a real
correctness defect — a first analyze must equal a second — and it is NOT the user-visible emergency
the original wording implied. Fix it for determinism, on its own schedule, and do not let the word
"handover" in an edge name stand in for a measurement of what reads it.

## Phase 1 — what has already been done, and what it did not fix

- [x] `IntraLinker`'s resolutions are applied to the IN-MEMORY graph, not only the vault. They were
      written with `updateEdgeTargets` alone, so every consumer running later in the same pulse still
      saw the bare names — a real defect regardless of this one. `retargetEdge` on the adjacency list
      keeps both indexes consistent. MEASURED: 4,375 resolutions now visible in memory on scraper,
      and sofie's cold edge count moved 34,683 → 34,723.
- [-] The handover binder is re-run after the linkers and induction (`rebindHandovers`) — dropped because it was measured to match zero — deduped by
      edge id before persisting — REMOVED 2026-08-07, because it was measured to do nothing.
      Instrumented at the call site: `rebindMatched=0 rebindSkippedMissingEndpoint=0`, meaning the
      second bind never reached even the endpoint check, while the inputs there are byte-identical
      to a warm pulse (`assignResolved=4181/4182` both ways). A no-op that looks like a fix is worse
      than the gap it pretends to close.
- [x] Neither closed the gap: scraper cold still writes 6 handovers against 63. The hypothesis that
      target resolution was the limiting factor is REFUTED by measurement, twice.

## Phase 2 — find the real cause

- [x] Instrument `bindPulseCircuits` to report, per pulse, how many nodes carried both a producer and
      a consuming call, and how many matched. Cold versus force on the same repository is then a
      two-number comparison rather than another hypothesis. → BUILT (`handoverInputs()`, behind
      `CONDUCKS_HANDOVER_TRACE=1`) and RUN. The inputs are BYTE-IDENTICAL between a cold and a warm
      pulse: `nodes=7503 withProducer=921 withCalls=989 withBoth=791 callsWithOriginal=4031/4031`.
      The outputs are not: 6 handovers cold, 63 warm.
- [x] The remaining suspects, in the order they are cheap to test: `metadata.original` on a CALLS
      edge (the key `callsByOriginal` is built from) may not survive a vault round-trip, which would
      make the SECOND run the anomalous one rather than the first; the shallow `load()` may omit a
      property the binder reads; the wave-flush cycle may clear an assignment edge the binder needs
      before it runs. → ALL THREE REFUTED. `original` survives at 4031/4031 both ways; the shallow
      load omits nothing the binder reads; the assignment edges are all present (921 producer nodes
      both ways). A fourth measurement located it instead: `beforeRebind=6 / afterRebind=6` cold and
      `beforeRebind=63 / afterRebind=63` warm — so the difference is made by the FIRST `resonate()`
      and the post-linker rebind adds nothing in either case.
- [x] Whichever it is, state which run is CORRECT before fixing. → **63 is correct; 6 is the bug.**
      Measured: the warm vault holds **4,181 of 4,182 assignment edges with a RESOLVED target**
      (`file.py::symbol`), because a previous pulse's `IntraLinker` resolved them and they were
      persisted. `bindPulseCircuits` keys its producer index on
      `edge.targetId.split('::').pop()`, so on a warm graph it indexes real symbol names and on a
      cold one it indexes pre-resolution bare text. It is matching MORE because it is matching
      against the right names, not because it is matching loosely. That settles the question this
      task existed to answer, and it means a fix must make the FIRST pass see resolved assignment
      targets — not make the second pass see fewer.

## Phase 4 — the fix, now that the target is known

Four hypotheses are now refuted by measurement, each refutation narrowing the next: not resolution
(`assignResolved=4181/4182` on a COLD run), not `metadata.original` (4031/4031 cold), not the shallow
load, not the bind ORDER. What is left is the only thing that still differs at the first
`resonate()` — the GRAPH IT RUNS ON. A warm pulse has just loaded everything the vault held,
including previously induced `library_symbol` nodes; a cold pulse has not, and the binder drops any
candidate pair whose endpoint is missing.

- [x] Count the endpoint drops on the FIRST bind, cold versus warm. → SETTLED, and the numbers are
      exact: the binder finds **213 candidate pairs on both runs**. Cold builds 6 and drops 207;
      warm builds 63 and drops 150. The 57 difference IS the gap. The candidates were never missing
      — only their endpoint nodes were, because `induceVirtualLibraries` materialises external
      symbols AFTER `resonate()` runs, so a warm pulse has them from the vault and a cold one has
      not seen them yet.
- [x] Prove any fix the same way: a cold run reporting 63 handovers, and the three frozen subjects
      unchanged. → **DONE.** The endpoint check is DEFERRED rather than skipped: the edge is
      collected either way, and the existence test happens at the persist step, which already
      filters both ends on `hasNode` after every resolver AND induction have run. It is still not
      added to the in-memory graph unless both ends exist, because a dangling in-memory edge is what
      ADR 0118 was written about.

      MEASURED after: a cold run on the Python subject writes **63 handovers and 5,294 / 17,342** —
      byte-identical to the warm answer, which was the pre-registered success criterion. All three
      frozen subjects now analyze to their warm baselines from an empty vault: scraper
      5,294/17,342, orchestrator 6,647/23,797, sofie 10,545/34,931. Suite 1,602, cli-smoke 28/28,
      guard clean.

      HONEST LIMIT on the regression test: `cold-start-parity.test.ts` does NOT reproduce this.
      Mutation-checked twice — reverting the fix leaves it green, before and after the fixture
      gained an external-symbol variable handover. Five files do not create the induced-endpoint
      race. The evidence for this fix is the SUBJECT measurement above; the test guards a different
      regression and now says so in its own header. It also carries a NaN guard, because it was
      reading `j.nodeCount` where the payload has `j.stats.nodeCount` — so both sides were NaN,
      `toEqual` treats NaN as equal to itself, and it had been comparing nothing to nothing.

## Phase 2b — an empty vault reports READY and SYNCHRONIZED

- [ ] Found while restoring a subject after `conducks clean`: `status` on a vault with 0 nodes and no
      pulse printed `Status: READY`, `Staleness: SYNCHRONIZED`, `Pulse: none` and an empty hotspot
      list. Nothing anywhere said the graph was empty. Same family as the empty-root and empty-scope
      false cleans closed in analyze — a state with nothing in it must not read as a healthy one.

## Phase 3 — the benchmark should have caught this

- [ ] `bench:health` analyzes each subject with `--force` against an existing vault, so it has never
      exercised a cold start and cannot see this class of defect. Add a cold-start run — or at
      minimum record that the baseline describes the SECOND analyze, not the first, so the number is
      not read as "what a new user gets".

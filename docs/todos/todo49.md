# todo49 — a repository's first analyze produces a thinner graph than its second
Status: todo
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
- [x] The handover binder is re-run after the linkers and induction (`rebindHandovers`), deduped by
      edge id before persisting. Correct ordering on its own merit — the edges were already
      PERSISTED at that point, only built earlier.
- [x] Neither closed the gap: scraper cold still writes 6 handovers against 63. The hypothesis that
      target resolution was the limiting factor is REFUTED by measurement, twice.

## Phase 2 — find the real cause

- [ ] Instrument `bindPulseCircuits` to report, per pulse, how many nodes carried both a producer and
      a consuming call, and how many matched. Cold versus force on the same repository is then a
      two-number comparison rather than another hypothesis.
- [ ] The remaining suspects, in the order they are cheap to test: `metadata.original` on a CALLS
      edge (the key `callsByOriginal` is built from) may not survive a vault round-trip, which would
      make the SECOND run the anomalous one rather than the first; the shallow `load()` may omit a
      property the binder reads; the wave-flush cycle may clear an assignment edge the binder needs
      before it runs.
- [ ] Whichever it is, state which run is CORRECT before fixing. 63 handovers may be the right answer
      and 6 the bug, or the second pass may be matching across a stale reading that should not
      match — the counts alone do not say, and a fix that makes them agree without answering this
      would just pick one.

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

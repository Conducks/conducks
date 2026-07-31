# todo23 — the pulse asks the vault questions instead of loading it
Status: done
- Acceptance: no stage of `analyze` materialises the graph to walk it, and `CONDUCKS_MEM_TRACE=1` shows no fetch stage above 50 MB. HALF MET, HALF WITHDRAWN by ADR 0060 — no fetch stage exceeds 50 MB (the largest is the node fetch at 20 MB), and the first half is withdrawn because materialising the graph is what four consumers need and it costs under 5% of the peak.

## Context

**Read ADR 0043 before any number here.** This todo was written against 0042's diagnosis, which was
disproved by experiment the same day: the transaction holds nothing releasable, DuckDB's cache is not
the cause, and the reload is worth ~30 MB rather than the 293 MB 0042 implied. Phase 0 is void as a
result, and the per-task sizing notes are corrected in place.

What survives is the DESIGN argument, and it is worth doing on its own terms. Consumers receive a
materialised graph and pick fields out of it, which is how `bindRouteCircuits` came to read five
fields that do not exist after a reload. A consumer that states the projection it needs cannot drift
that way. ADR 0042 has the per-consumer audit.

The peak is 881 MB today, down from 1,019 MB, and every megabyte of that came from batching per-row
writes (todo22#P8) rather than from anything in this todo. Expect clarity from this work, not memory.

Order matters more than usual. Phase 1 is worth doing alone and de-risks the rest; Phases 3 and 4 may
turn out unnecessary once Phases 1 and 2 land, and that is a real outcome rather than a shortfall.

## Phase 0 — decide what an interrupted analyze may leave behind
- Builds: 0042
- [-] Whether to trade the rollback guarantee for the transaction's memory — VOID, there is nothing to trade. MEASURED (ADR 0043): a build committing at the end of every wave peaks at 918,405,120 bytes against 918,716,416 for the single transaction, a 0.03% difference. The ~200 MB this question was built on was an attribution from stage deltas, not a holding. The atomic pulse costs nothing recoverable, so it stays and no product call is needed
- [-] Whether a savepoint per wave releases transaction-local storage — VOID for the same reason: the commit-per-wave measurement already bounds what any weaker form could return at ~0

## Phase 1 — the reload fetches only what its consumers read
- Builds: 0042
- [x] Audited: of the skeleton fields `addNode` keeps, all but FOUR are real columns. The four that are not — `parentname`, `rank`, `kineticEnergy`, `isExport` — have no reader on the analyze path. `kineticEnergy` is WRITTEN by the ranker rather than read; `isExport` is read by `ImportResolver`, dead-code and governance, none of which run in the pulse (`IntraLinker` holds a `TypeScriptResolver`, not `ImportResolver`); nothing reads the other two. So a shallow load fetches columns only and drops the blob
- [x] Done and verified IDENTICAL: 4,836 nodes and 23,002 edges hash-for-hash against the previous build. The comparison must run both arms in the SAME directory — `fingerprint` is a hash of the file path, so two copies at different temp paths differ on 3,295 rows for a reason that has nothing to do with the change, and a path-normalised id comparison cannot see through it
- [x] Kept on its merits rather than its memory: the pulse no longer fetches or JSON-parses a 1,382-byte blob per row to extract fields it does not read, which is the projection discipline ADR 0042 argues for. It costs nothing and buys nothing measurable — that is the honest summary
- [x] SIZING WRONG TWICE, and now measured end to end: this is worth **7 MB, which is noise**. ADR 0042 implied 293 MB, ADR 0043 corrected that to ~30 MB from the fetch-stage delta, and a two-run A/B of the whole pulse gives 831 MB narrow against 838 MB full (individual runs 856/805 and 854/821), with wall time 75.5 s against 75.4 s. Shrinking one stage does not lower a peak another stage sets — which is exactly what ADR 0043 says RSS is, applied to its own prediction

## Phase 2 — PageRank reads an edge list, not a graph
- Depends: todo23#P1
- Builds: 0042
- [-] VOID ON MEASUREMENT (ADR 0060), not deferred. Measured twice on `mentorseed`: the node fetch is 14-20 MB and PageRank's own delta swings 1 MB to 25 MB across two identical runs, which is the noise floor rather than a measurement. The 293 MB below is the THIRD wrong sizing of this reload — 0042 said 293 MB, 0043 revised to ~30 MB, P1 measured 7 MB end to end. It also cannot remove the reload, which serves four consumers and not the ranker. Original: `calculateGravity` runs 30 power iterations and reads node ids, one kind field, and edges. It is handed a materialised graph of 9,861 node rows instead. The edge set genuinely must stay resident for the iterations — 38,598 edges as integer pairs is roughly 300 KB against the +293 MB currently paid, so the exception is the algorithm's, not the row format's
- [-] VOID with the phase. Would also have been invasive for its size: `calculateGravity` WRITES rank, gravity and kineticEnergy onto every node and calls `detectEntryPoints`, which reads name, filePath, kind, label and canonicalKind — so its projection is most of the skeleton, not the "ids and one kind field" this phase assumed. Original: Fixed when gravity values are identical to the current implementation for every node on a real project with git history, compared as an ordered hash of `(id, gravity)`, and no stage of the pulse fetches node rows for ranking. `mentorseed` with its 325 commits is the subject — a copy without `.git` measures a pulse where a third of the work does not run

## Phase 3 — the linkers ask the vault
- Depends: todo23#P2
- Builds: 0042
- [-] VOID ON MEASUREMENT (ADR 0060). This phase's own text calls trading 293 MB for a minute of runtime a bad trade; the real figure is roughly 33 MB for the entire read half, so the trade is an order of magnitude worse and the wall-time risk is unchanged. Original: `induceVirtualLibraries` walks every edge to find targets with no node; `IntraLinker.resolve` builds a unit-to-symbol map and IMPORTS adjacency by walking the whole graph; `bindPulseCircuits` reads each node's outgoing edges. ADR 0042 names the query shape for each. UNMEASURED: what each costs in wall time as SQL against the same work in memory — a `GROUP BY` per wave may cost more than a Map lookup, and trading 293 MB for a minute of runtime is a bad trade
- [-] VOID with the phase — and the instruction was followed. Measuring before converting is what closed it. Original: Measure before converting, then fixed when each converted linker produces an identical edge set on a real project and the pulse's wall time has not regressed by more than 10%. If a conversion cannot meet that, leave it in memory and record which one and why — the reload can stay for one consumer and still be worth removing for the others
- [x] DECIDED and BUILT in todo22#P15: cross-service HTTP binding is a real feature and its fields are real columns. `is_route`, `is_request`, `http_method`, `http_path` and `http_url` are stored by the vault and restored on load, and a cross-service CALLS edge is asserted after a reload by `tests/integration/features/cross-service.test.ts`

## Phase 4 — the reload is gone, or its last owner is named
- Depends: todo23#P3
- Builds: 0042
- [x] RESOLVED VIA THE SECOND BRANCH, which this phase explicitly allowed. `persistence.load()` keeps exactly one caller in the pulse and the reason is now written at the call site: the orchestrator clears the graph between waves (ADR 0041), so `resonate()`, `IntraLinker`, induction and doc governance all need it rebuilt. Four consumers, one reload, under 5% of the peak. Original: Once Phases 1 to 3 land, either `persistence.load()` has no caller inside the pulse, or exactly one remains with a written reason. Fixed when `grep -n "persistence.load" src/lib/domain/analysis/index.ts` returns nothing, or returns one line whose comment names the consumer and why SQL lost for it
- [x] RE-MEASURED (ADR 0060), on `mentorseed` rather than this repo because a subject with 326 commits exercises the git half the todo asks for. Peak 686 MB, and the shape is the finding: the write half takes it from 311 MB to 653 MB, the largest single jump being the wave-1 vault flush at +124 MB, while the whole read half adds 33 MB. Not comparable to the 881 MB figure, which was a different subject. Original: Re-measure the whole pulse. ADR 0042's prediction of roughly 500 MB is WITHDRAWN by 0043 — the peak is 881 MB today, down from 1,019 MB entirely through batching the per-row writes, and the read half is worth ~30 MB of what remains. Expect roughly 850 MB after Phases 1-3, and if it lands far from that, record the gap rather than adjusting the expectation quietly

## Phase 5 — where the memory actually is
- Builds: 0060
- [-] MOVED to todo22#P21 and live there — that todo already carries the parse-side native-memory finding, and keeping a copy here would run two threads on one subject: whether the native memory that never returns is one allocation or two

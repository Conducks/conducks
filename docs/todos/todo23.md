# todo23 — the pulse asks the vault questions instead of loading it
Status: todo
- Acceptance: no stage of `analyze` materialises the graph to walk it, and `CONDUCKS_MEM_TRACE=1` shows no fetch stage above 50 MB.

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
- [ ] `persistence.load()` selects 15 columns including a `metadata` JSON blob averaging 1382 bytes, and the analyze reload is already `shallow: true` — so the blob is fetched and JSON-parsed to extract a handful of skeleton fields and the rest is dropped. Fetching 9,861 node rows costs +235 MB RSS, about 24 KB per row. Establish which skeleton fields exist as real columns (`fingerprint`, `rootId`, `structureId`, `isEntryPoint`, `lineStart`/`lineEnd`) and which live only inside `metadata` (`parentname`, `rank`, `kineticEnergy`, `isExport`), because that decides whether the blob can be dropped or must be promoted to columns first
- [ ] Fixed when `CONDUCKS_MEM_TRACE=1 conducks analyze` shows the `load: N node rows fetched` stage under 50 MB, and the vault content is byte-identical to the previous build on the same source — compare with a path-normalised hash of `nodes` and `edges`, since ids embed the project path and a naive diff reports every row as changed
- [ ] SIZING CORRECTED (ADR 0043): this is worth about **30 MB**, not the 293 MB ADR 0042 implied. The node fetch measured +235 MB before the per-row writes were batched and +55 MB after; cutting the query to `SELECT id, canonicalKind` reaches +25 MB. Do it for correctness and for the projection discipline, not for the memory — anyone expecting 293 MB back will not find it

## Phase 2 — PageRank reads an edge list, not a graph
- Depends: todo23#P1
- Builds: 0042
- [ ] `calculateGravity` runs 30 power iterations and reads node ids, one kind field, and edges. It is handed a materialised graph of 9,861 node rows instead. The edge set genuinely must stay resident for the iterations — 38,598 edges as integer pairs is roughly 300 KB against the +293 MB currently paid, so the exception is the algorithm's, not the row format's
- [ ] Fixed when gravity values are identical to the current implementation for every node on a real project with git history, compared as an ordered hash of `(id, gravity)`, and no stage of the pulse fetches node rows for ranking. `mentorseed` with its 325 commits is the subject — a copy without `.git` measures a pulse where a third of the work does not run

## Phase 3 — the linkers ask the vault
- Depends: todo23#P2
- Builds: 0042
- [ ] `induceVirtualLibraries` walks every edge to find targets with no node; `IntraLinker.resolve` builds a unit-to-symbol map and IMPORTS adjacency by walking the whole graph; `bindPulseCircuits` reads each node's outgoing edges. ADR 0042 names the query shape for each. UNMEASURED: what each costs in wall time as SQL against the same work in memory — a `GROUP BY` per wave may cost more than a Map lookup, and trading 293 MB for a minute of runtime is a bad trade
- [ ] Measure before converting, then fixed when each converted linker produces an identical edge set on a real project and the pulse's wall time has not regressed by more than 10%. If a conversion cannot meet that, leave it in memory and record which one and why — the reload can stay for one consumer and still be worth removing for the others
- [ ] `bindRouteCircuits` reads `isRoute`, `isRequest`, `url`, `method` and `path`, and none survive into the skeleton `addNode` keeps, so after any reload it binds nothing. Decide whether cross-service HTTP binding is a real feature (promote those fields into the skeleton) or parse-time-only behaviour (say so in `features.md` and stop running it post-reload). Verify by asserting a cross-service CALLS edge exists after a reload, which currently cannot happen

## Phase 4 — the reload is gone, or its last owner is named
- Depends: todo23#P3
- Builds: 0042
- [ ] Once Phases 1 to 3 land, either `persistence.load()` has no caller inside the pulse, or exactly one remains with a written reason. Fixed when `grep -n "persistence.load" src/lib/domain/analysis/index.ts` returns nothing, or returns one line whose comment names the consumer and why SQL lost for it
- [ ] Re-measure the whole pulse. ADR 0042's prediction of roughly 500 MB is WITHDRAWN by 0043 — the peak is 881 MB today, down from 1,019 MB entirely through batching the per-row writes, and the read half is worth ~30 MB of what remains. Expect roughly 850 MB after Phases 1-3, and if it lands far from that, record the gap rather than adjusting the expectation quietly

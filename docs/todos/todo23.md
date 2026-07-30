# todo23 — the pulse asks the vault questions instead of loading it
Status: todo
- Acceptance: no stage of `analyze` materialises the graph to walk it, and `CONDUCKS_MEM_TRACE=1` shows no fetch stage above 50 MB.

## Context

A 974-unit project peaks at 994 MB and the source is 9 MB of it. The read half — `persistence.load()`
pulling 9,861 nodes and 28,737 edges back after every wave already flushed them — is +293 MB, and the
consumers it serves read a fraction of what it fetches. ADR 0042 has the per-consumer audit and the
measured stage table.

Two things this todo does NOT do. It does not touch the write half: the ~200 MB of uncommitted rows
buys rollback-on-kill, and whether any of that is spendable is Phase 0's question. And it does not
promise a small pulse — boot and parsing are ~217 MB and legitimate, so a fully converted pulse still
costs roughly 500 MB here.

Order matters more than usual. Phase 1 is worth doing alone and de-risks the rest; Phases 3 and 4 may
turn out unnecessary once Phases 1 and 2 land, and that is a real outcome rather than a shortfall.

## Phase 0 — decide what an interrupted analyze may leave behind
- Builds: 0042
- [ ] The pulse holds ~200 MB of uncommitted rows because the whole analyze is one transaction, which is what makes a killed run leave the previous graph intact instead of a half-written one. Per-wave commits, a savepoint per wave, and writing to a sibling vault and swapping all release that memory and cost different amounts of that guarantee. NO THRESHOLD IS SET for how much is spendable, and no measurement sets it — the question is what an interrupted `analyze` is allowed to leave behind, which is a product call. Write the phase that implements the chosen option once the answer exists; do not write candidate phases now
- [ ] UNMEASURED: whether a savepoint per wave actually releases transaction-local storage in DuckDB, or merely marks a rollback point while holding the same rows. That decides whether the middle option exists at all. Verify with `CONDUCKS_MEM_TRACE=1` across a multi-wave pulse under a savepoint-per-wave build before the option is offered as real

## Phase 1 — the reload fetches only what its consumers read
- Builds: 0042
- [ ] `persistence.load()` selects 15 columns including a `metadata` JSON blob averaging 1382 bytes, and the analyze reload is already `shallow: true` — so the blob is fetched and JSON-parsed to extract a handful of skeleton fields and the rest is dropped. Fetching 9,861 node rows costs +235 MB RSS, about 24 KB per row. Establish which skeleton fields exist as real columns (`fingerprint`, `rootId`, `structureId`, `isEntryPoint`, `lineStart`/`lineEnd`) and which live only inside `metadata` (`parentname`, `rank`, `kineticEnergy`, `isExport`), because that decides whether the blob can be dropped or must be promoted to columns first
- [ ] Fixed when `CONDUCKS_MEM_TRACE=1 conducks analyze` shows the `load: N node rows fetched` stage under 50 MB, and the vault content is byte-identical to the previous build on the same source — compare with a path-normalised hash of `nodes` and `edges`, since ids embed the project path and a naive diff reports every row as changed

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
- [ ] Re-measure the whole pulse. ADR 0042 predicts roughly 500 MB on a 974-unit subject after the read half is removed and the write half kept. If the number lands far from that, the stage table in ADR 0042 was wrong somewhere and the gap is the finding — record it rather than adjusting the expectation quietly

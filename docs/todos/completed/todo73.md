# todo73 — graph behind one door, and the parsing cycle broken
Status: done
- On close (2026-08-16): met, and one defect was created and fixed on the way — the door itself closed an ESM cycle through `linker-federated`, caught by a race test and proved by stashing rather than by argument.
- Acceptance: `core/graph` imports nothing from `core/parsing`, nothing outside `core/graph` imports past `core/graph/index.ts`, every symbol the door exposes is documented and pinned by a test that fails when its behaviour is broken, and the four oracles read the same numbers as before.

## Context

Builds ADR 0150. Fourth feature, and the first with real internal structure — 14 files, 3.9k lines,
including the two largest files in the codebase after `persistence.ts`: `adjacency-list.ts` at 912
and `linker-intra.ts` at 1,120.

**`core/graph` and `core/parsing` import each other.** Measured, both directions:

| direction | what |
|---|---|
| graph → parsing | `graph-engine` takes `PrismSpectrum`/`PrismRequest` from `prism-core` and `CanonicalKind`/`CanonicalRank` from `taxonomy`; `linker-intra` takes `isBuiltIn`/`getGlobalId` from `built-ins` |
| parsing → graph | `prism-core`, `essence-lens`, `reflector` and three processors take `ConducksNode`, `ConducksEdge`, `NodeId`, `EXTERNAL_ROOT` and `classifyOrigin` |

CONDUCKS-1 forbids circular imports in core and passes today, because no single FILE closes a loop.
The cycle is between the two FEATURES, and it becomes a file cycle the moment each gets a door: two
`index.ts` importing one another is a real ESM cycle, which this repository has already paid for once
(`registry` ↔ `watcher`, fixed by dependency injection; and `chronicle` ↔ `typescript/resolver`,
which is why `getDiscoverySurface` uses dynamic `import()`).

So the cycle is broken BEFORE the door, not after it — and rule 5 is the tool. Each thing crossing is
used by two or more features, which is the definition of a contract:

- `taxonomy` — graph, parsing, and four `domain/` files
- `built-ins` — graph, parsing, persistence
- `PrismSpectrum`/`PrismRequest` — already in `contracts/`; `prism-core` merely re-exports them, so
  `graph-engine` can take them from the source instead
- `ConducksNode`, `ConducksEdge`, `NodeId` — the graph's own vocabulary, spoken by parsing

The natural direction is parsing → graph: parsing PRODUCES spectra, graph STORES them. So graph must
stop importing parsing, not the other way round.

Behaviour does not change (rule 16). Everything here is a move or a re-point.

## Phase 0 — read before moving
- Builds: 0150
- [x] read. What each owns is in `docs/deep_clean.md`; the store owns what EXISTS and explicitly not whether a reference RESOLVES, which is the linkers' job
- [x] confirmed, and it missed nothing — but a SECOND cycle appeared later, created by the door itself and caught by a test rather than by the map
- [x] `taxonomy` and `built-ins` moved — three features use each. Everything else stayed

## Phase 1 — break the cycle
- Builds: 0150
- Depends: todo73#P0
- [x] done — `prism-core` only re-exported them
- [x] removed
- [x] moved, with the reason recorded on the door
- [x] returns nothing; the architecture suite passes

## Phase 2 — the door
- Builds: 0150
- Depends: todo73#P1
- [x] the door exports the store, the engine, four linkers, the ranker, three classifiers and the diff engine — measured from what actually crosses. `linker-intra`'s strategies, the traversal helpers and the PageRank iteration stay inside
- [x] zero, 68 files repointed
- [x] the gate holds four doors

## Phase 3 — clean behind it
- Builds: 0150
- Depends: todo73#P2
- [x] 36 real gaps → 0
- [x] four unused imports in `prism-core`
- [x] none contradicted

## Phase 4 — make it break
- Builds: 0150
- Depends: todo73#P3
- [x] `store-adversarial.test.ts`. One case was written wrong and the store corrected it: ids are LOWERCASED on write while names keep their spelling, so a caller assuming the id it passed is the id it gets looks up nothing — now pinned
- [x] 10 cases, all of those
- [x] three mutations, three failures: skipping the name index, skipping the file index, and not unindexing the previous node on overwrite

## Phase 5 — close it honestly
- Builds: 0150
- Depends: todo73#P4
- [x] four oracles green — and `oracle-tsc` IMPROVED, 30 → 28 missed, because consolidating specifiers onto one door made two more stale imports visible. Baseline ratcheted
- [x] recorded
- [x] 15 PASS, 0 n/a, 1 PARTIAL — rule 16, because the `openVault` inversion is a behaviour change forced by a defect the door itself created. Stated rather than pretended otherwise
- [x] they held, and one gap appeared. Rule 12 earned its place for the first time — this is the first feature WITH leaves. Rule 5 did the heavy lifting, breaking a feature cycle CONDUCKS-1 could not see. The gap: nothing in the 16 warns that A DOOR IS ITSELF A DEPENDENCY EDGE. `persistence` imported `graph/adjacency-list`, a leaf; pointing it at the barrel made it import `linker-federated`, which imports `persistence`. Nothing failed to compile — a race test failed, and only stashing the work proved the cause

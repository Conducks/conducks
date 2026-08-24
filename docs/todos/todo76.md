# todo76 — the boundary family: three findings, one root cause
Status: todo
- Acceptance: `context` and `impact` agree on an aliased re-export, a same-file case difference is two symbols rather than one, and no first-party package appears in the third-party surface.

## Context

Round 6 closed six of round 5's thirteen FAILs. Every one still open is a BOUNDARY problem rather
than a computation problem: the graph computes correctly and then loses which of two things it was
talking about. Three of them are the same root cause and are grouped here; the rest are separate and
are not.

ADR 0158 closed the receiver member of this family — a call's receiver was discarded, so
`asyncio.run` reached a project `run`. The fix refuses only on positive evidence. These three are
what the same discarding does elsewhere.

Not in scope, deliberately: `MirrorEngine` (ADR 0028 requires the file, so removing it is a decision
about that record, not a fix), and `calculateCompositeRisk` reaching four surfaces (shared POLICY, a
product call — see ADR 0159's closing note).

## Phase 0 — decide whether these are one fix or three
- [ ] They present as three, and the shared shape is "a distinguishing fact is dropped at resolution time". Establish whether one change closes all three or whether the alias, case and workspace cases resolve in different code paths. Read `linker-intra.ts` step 3f (ALIASES) and the id-lowercasing in `unitSymbols` before writing any phase — if they are separate paths, this todo is three phases; if one, it is one

## Phase 1 — `context` and `impact` must answer the same question
- Depends: todo76#P0
- [ ] `conducks context packages/core/database/server/index.ts::db` prints no `Called by` section while `conducks impact` on the same id reports 212 affected symbols. `db` is an aliased re-export (`export { coreDb as db }`), so incoming edges attach to `coreDb`; `impact` follows the ALIASES edge and `context` reads incoming edges on the exact node. It is the orchestrator subject's #1 hotspot, and the conducks skill's own explore probe sends a new reader to `context` third — so the first thing they learn is that the most central symbol has no callers. Fixed when both commands report callers for the alias, or when `context` says out loud that it is reading the alias rather than the declaration

## Phase 2 — a case difference is two symbols, not one
- Depends: todo76#P0
- [ ] `packages/core/registry/Registry.ts:101` declares a type-annotation property `registry` and line 102 exports `Registry`. They collapse into one node, the property wins, and it is the orchestrator subject's **#3 hotspot** at gravity 0.2364 while the export it swallowed has no node at all. Resolution is case-insensitive by construction, which is CORRECT for lookup — `query "mapperrunner"` must find `MapperRunner` — and wrong for identity in a case-sensitive language. Fixed when both declarations exist as separate nodes and lookup still resolves either spelling

## Phase 3 — a first-party package is not a dependency
- Depends: todo76#P0
- [ ] `supply-chain` on the scraper subject lists `specialists` as an undeclared third-party dependency with 1 importer. `specialists` is `src/specialists/`, that repository's own plug-in package, and 11 files import it — so the classification and the count are both wrong. The trigger is a `src/` layout: `foundation` and `core` resolve as internal throughout, `specialists` resolves internally 10 times out of 11. Fixed when no directory inside the project appears in the dependency table

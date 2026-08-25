# todo76 — the boundary family: three findings, three layers
Status: doing
- Acceptance: no first-party package appears in the third-party surface, `context` and `impact` agree on an aliased re-export, and two same-file declarations differing only in case are two nodes.

## Context

Round 6 closed six of round 5's thirteen FAILs. Every one still open is a BOUNDARY problem rather
than a computation problem: the graph computes correctly and then loses which of two things it was
talking about. ADR 0158 closed the receiver member of that family — a call's receiver was discarded,
so `asyncio.run` reached a project `run`.

Phase 0 asked whether the rest share its code path. They do not. They sit at three different layers,
which is why they are three phases in leaves-first order (`conducks-feature-clean` Rule 13) and three
commits with three measurements (Rule 16), not one change.

Not in scope, deliberately: `MirrorEngine` (ADR 0028 requires the file, so removing it is a decision
about that record) and `calculateCompositeRisk` reaching four surfaces (shared POLICY, a product
call — ADR 0159's closing note).

## Phase 0 — one fix or three
- [x] Establish whether the alias, case and workspace findings resolve in the same code path

Three layers, measured 2026-08-25 by reading each site:

| finding | layer | site | reached by |
|---|---|---|---|
| `specialists` as third-party | `core/graph` | `boundary-classifier.ts:105` | one consumer — `supply-chain` |
| `context` 0 callers vs `impact` 212 | consumer | ALIASES traversal, present in one command and not the other | two commands |
| `registry` swallows `Registry` | **`core/parsing`** | `reflector.ts:498` — `` `${file.path.toLowerCase()}::${scopePrefix}${name.toLowerCase()}` `` | **every node id, so all 35 commands** |

The third is the base, not an arm: the name is lowercased when the id is MINTED, so the collision
happens before any consumer sees it. That is what makes its ordering non-negotiable rather than a
preference.

**The case collision is systematic, not the single instance round 5 found.** Scanned every
declaration in all three subjects for two names in one file differing only in case:

```
orchestrator   12 of 658 files        sofie   32 of 513        scraper   0 of 168
```

and the shape is the ordinary TypeScript idiom — `class UserRepository` beside
`const userRepository`, `interface Props` beside `props`, `type ResolvedTheme` beside
`resolvedTheme`. 44 files hold two symbols merged into one node today, each inflating that node's
gravity and conflating its blast radius. scraper scores zero because Python does not use the
type-beside-instance convention.

## Phase 1 — a directory inside the project is not a dependency
- Depends: todo76#P0
- [ ] `supply-chain` on the scraper subject lists `specialists` as an undeclared third-party dependency with 1 importer, while 11 files import it — so the classification and the count are both wrong, and the third-party surface is inflated by the project's own code. The mechanism to fix it already exists: `boundary-classifier.ts:113` returns `internal` on `resolvesInRepo`, and `workspacePackages` covers the npm case (ADR 0108). Python's `src/` layout sets neither. Fixed when no directory inside the project appears in the dependency table, and the four genuinely-undeclared packages on that subject still do

## Phase 2 — one traversal, so two commands cannot disagree
- Depends: todo76#P1
- [ ] `conducks context packages/core/database/server/index.ts::db` prints no `Called by` section while `conducks impact` on the same id reports 212 affected symbols. `db` is `export { coreDb as db }`, so incoming edges attach to `coreDb`; `impact` follows the ALIASES edge and `context` reads incoming edges on the exact node. It is the orchestrator subject's #1 hotspot, and the conducks skill's explore probe sends a new reader to `context` third
- [ ] The fix goes in the layer BOTH commands read, never in `context.ts`. Patching the command would create a second answer to a question `impact` already answers — which is the `drift` defect ADR 0159 closed, rebuilt one layer up. Fixed when both commands report the same callers for an aliased re-export and neither owns the traversal

## Phase 3 — a case difference is two symbols, without reminting every id
- Depends: todo76#P2
- [ ] Two same-file declarations differing only in case collapse into one node and the property wins: on orchestrator `registry` (a type-annotation property, `Registry.ts:101`) is the **#3 hotspot** at gravity 0.2364 while the `Registry` exported on line 102 has no node at all. Case-insensitive resolution is CORRECT for lookup — `query "mapperrunner"` must find `MapperRunner` — and wrong for identity in a case-sensitive language
- [ ] Do NOT change the id scheme globally. Node ids are the graph's primary key: reminting them invalidates every stored vault and reaches all 35 commands, which is the definition of a base change under ADR 0159's octopus rule. The shape that stays additive is to keep ids lowercased and disambiguate ONLY on collision — when a second symbol in a file would take an id that already exists, append a discriminator. Ids then move for the 44 measured files and nowhere else. Fixed when both declarations resolve as separate nodes, either spelling still resolves on lookup, and `prune` and `impact` are unchanged on a subject with zero collisions (scraper) — that last one is the regression gate, not a formality

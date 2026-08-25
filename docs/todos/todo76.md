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

## Phase 2 — a value has no callers, and saying so was wrong
- Depends: todo76#P1
- [x] `conducks context packages/core/database/server/index.ts::db` printed no `Called by` section while `conducks impact` on the same id reported 212 affected symbols — the orchestrator subject's #1 hotspot, reported as used by nobody
- [-] Fix the ALIASES traversal in the layer both commands read, never in `context.ts` — dropped: the hypothesis was wrong, and measuring it took ten minutes that reading the diagnosis would not have. Both commands ALREADY call the same `registry.kinetic.getImpact`, so there was no second answer and nothing to move into a shared layer
- [x] The cause is one filter: `context.ts` kept only `path.length === 1 && USE_EDGES.has(path[0])`, and all 103 of `db`'s direct users have path `['IMPORTS']`, which the set omits. Fixed by falling back to file-level imports when no symbol used the node

The hypothesis in this phase was wrong in an instructive way. It named ALIASES because round 6 had
just found the receiver bug and this looked like the same family; the two commands do differ on
aliases, but that is not what produced the empty section.

What it actually is: the third time this use-edge set has been too small. `CALLS` alone omitted
classes, the weighted `depth` argument omitted constructions, and a set without `IMPORTS` omits every
re-exported value. A direct import gives the consuming SYMBOL an `ACCESSES` edge, which the set
already admits; reaching the value through a barrel leaves only an `IMPORTS` edge on the consuming
FILE — which is why the first fixture written for this passed without the fix, and had to be rebuilt
around the real `export { coreDb as db }` shape.

A FALLBACK rather than a widening, and the measurement decided it: every `IMPORTS` row is a file
node, so admitting them unconditionally puts the same fact in twice — `ensureServerInitialized` on
the same subject has 98 real symbol callers and 78 file rows behind them. Files show only where no
symbol used the node, which is exactly where the file is the only evidence there is. Verified after:
`db` names its importers as `[imports]`, `ensureServerInitialized` unchanged at 99 rows.

## Phase 3 — a case difference is two symbols, without reminting every id
- Depends: todo76#P2
- [ ] Two same-file declarations differing only in case collapse into one node and the property wins: on orchestrator `registry` (a type-annotation property, `Registry.ts:101`) is the **#3 hotspot** at gravity 0.2364 while the `Registry` exported on line 102 has no node at all. Case-insensitive resolution is CORRECT for lookup — `query "mapperrunner"` must find `MapperRunner` — and wrong for identity in a case-sensitive language
- [ ] Do NOT change the id scheme globally. Node ids are the graph's primary key: reminting them invalidates every stored vault and reaches all 35 commands, which is the definition of a base change under ADR 0159's octopus rule. The shape that stays additive is to keep ids lowercased and disambiguate ONLY on collision — when a second symbol in a file would take an id that already exists, append a discriminator. Ids then move for the 44 measured files and nowhere else. Fixed when both declarations resolve as separate nodes, either spelling still resolves on lookup, and `prune` and `impact` are unchanged on a subject with zero collisions (scraper) — that last one is the regression gate, not a formality

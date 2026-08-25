# todo76 — the boundary family: three findings, three layers
Status: done
- Acceptance: no first-party package appears in the third-party surface, and `context` names the users of a value it previously reported as used by nobody.

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

## Phase 3 — the case collision, re-tested against the bar that dropped it
- Depends: todo76#P2
- [-] Disambiguate a same-file case collision so two declarations are two nodes — dropped: `todo32#P2` already decided this by measurement and stated the condition for re-opening it. The condition is not met. Re-casing changes 38% of all ids — every fingerprint, every baseline, every stored layer — across 54 files of string-reading call sites
- [x] Test the re-open bar rather than assume it, since Phase 0 counted 44 colliding files against todo32's 2

Phase 0's 44 files counted the IDIOM, not damage. `todo32#P2` re-opens only "if a subject shows
collisions at a scale where span attribution goes wrong again", so that is what was measured — every
case-colliding pair on the orchestrator subject, read back against source:

```
IdentityManager/identityManager    -> class, span  95-111   correct
UserRepository/userRepository      -> class, span  11-185   correct
RequestDeduplicator/…              -> class, span  15-160   correct
AnalyticsService/…                 -> class, span  13-31    correct
ErrorLogRepository/…               -> class, span  47-132   correct
AnalyticsRepository/…              -> class, span  21-157   correct
```

Span attribution is correct in every one. The class wins the id and points at real code, which is
exactly what `todo32#P1` built and what its re-open condition guards. The idiom `class X` beside
`const x` is common; the damage it was feared to cause is not present.

**One case is still genuinely wrong, and it is a different defect.**
`packages/core/registry/Registry.ts:101` declares `registry` as a property inside a type annotation —
`const globalForRegistry = global as unknown as { registry?: ServiceRegistry }` — and line 102
exports `const Registry`. Both classify as `variable`, so the value-over-type tie-break cannot fire
and first-declared wins. The surviving node has span 101-101, and it is the subject's #3 hotspot at
gravity 0.2364 while the export it displaced has no node.

That is not an id-scheme problem and must not be fixed as one. A property inside a type annotation is
erased at runtime like the interfaces `ERASED_AT_RUNTIME` already names; classifying it as such would
let the existing tie-break resolve this with no id change anywhere. One instance measured, so it is
recorded here rather than opened as work — the same bar todo32 set applies to it.

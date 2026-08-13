# todo62 — an ALIASES edge outlived its own node, because it was built from a different id
Status: done
- Acceptance: every edge with confidence ≥ 0.6 has both endpoints present in `nodes`, with no type excluded — proven by the referential-integrity case in `tests/database/ts/structural.test.ts` passing without its ALIASES carve-out.

## Context

Found while porting the vault driver (todo56). The suite's referential-integrity assertion had been
VACUOUS: it passed its parameters as an array to a driver that wanted them spread, the resulting error
was swallowed by a `rows || []` wrapper, and the empty array read as "nothing dangles". It had never
checked anything.

The real answer was 552, and three of the four reasons turned out to be the QUERY being wrong rather
than the graph — see the comment on the test, which carries the measurements. What survived all three
corrections was 3 `ALIASES` edges at confidence 1.0 whose source id was not in `nodes`.

**The first reading of those three was wrong and is recorded here because the correction is the
useful part.** They were filed as re-exports (`export { X } from './y'`), which is what an alias edge
usually comes from. They are not. All three are destructured DYNAMIC imports:

```ts
const { ConducksMCPServer } = await import("./server.js");   // interfaces/tools/{index,entry}.ts
const { ConducksReflector }  = await import("@/lib/core/parsing/reflector.js");  // pulse-worker.ts
```

Real re-exports exist in this repository and were never affected — 57 of the 60 alias edges are that
shape and all of them are healthy. Reading the code the edges pointed at, rather than assuming the
usual producer, is what separated the two.

## The mechanism, from the write log rather than from reasoning

`CONDUCKS_SQL_LOG` captured what the pulse actually wrote for a 2-file fixture:

| | id |
|---|---|
| node minted for the binding | `renamed.ts::main2.doit` — **scoped** to the enclosing function |
| source of the ALIASES edge | `renamed.ts::doit` — **unscoped** |

`processAlias` was handed the bare local name and `graph-engine.ts:484` builds `<file>::<sourceName>`,
so the edge named an id nothing stores. Three things follow from that single mismatch, and the third
is what made it survive:

1. `pruneTaxonomy`'s ATOM edge-gate keeps a node only if some edge's endpoint IS that node. The alias
   edge's was not, so the binding read as unreferenced and was deleted.
2. Prune then deletes every edge touching a dropped id — and the alias edge did not touch it.
3. So the edge outlived its node, at confidence 1.0, in a graph whose own audit could not see it.

A module-level re-export has no enclosing scope, so its id is the same either way. That is exactly why
57 edges were healthy and 3 were not, and why this went unnoticed.

## Phase 0 — decide what a re-export IS, before building anything

- [x] Asked as a modelling question — is a barrel re-export a symbol or a relationship? — and the measurement answered a different one: nothing is wrong with the model. The two ids simply disagree, which is CONDUCKS-28 (a node-id shape) applied to the producing side of an edge. No decision was needed
- [x] Measured what the graph answers today: the alias's work is already DONE by the time it is orphaned — `main2 -CALLS-> server.ts::helper` resolves at 0.85 through the alias, so no downstream answer was wrong. What was wrong was the graph's own integrity, and a binding node that should have survived

## Phase 1 — build the alias edge against the id its node is stored under

- [x] Both `processAlias` call sites in `reflector.ts` now carry the enclosing scope, matching the `scopedId` computed three lines above the first of them. Module-level re-exports are the identity case and unchanged
- [x] `tests/unit/core/parsing/alias-edge-names-its-node.test.ts` — three cases (renamed, shorthand, module-level), asserted at the layer where the id is decided rather than two layers downstream in the vault. Mutation-verified: reverting the fix fails exactly the two scoped cases and leaves the module-level one green
- [x] The ALIASES carve-out is gone from `tests/database/ts/structural.test.ts` — it now asserts `[]`
- [x] MEASURED on this repository after a full re-analyze: dangling confident structural edges **3 → 0**, alias edges still **60** (none lost, three repaired), and the 1,044 deliberately-kept unresolved references at confidence 0.4 are untouched

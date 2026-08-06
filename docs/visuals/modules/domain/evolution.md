# domain/evolution — dead code, drift, and the file watcher

**Layer:** domain. Imports core + contracts.

**Responsibility:** what changed and what is no longer needed. Dead-code (`evolution/dead-code.ts`)
finds orphans and unused exports; drift (`evolution/drift-engine.ts`) compares the graph against a
baseline; the watcher (`evolution/watcher.ts`) drives incremental re-analysis;
`evolution/layer-diff.ts` and `evolution/merge-impact.ts` compare two stored layers structurally.

`diffLayers()` matches by id first and only then by a fingerprint that is UNIQUE on both sides, so a
"move" is claimed only where there is exactly one candidate; everything else is reported as
`incomparable` rather than paired on a guess. `mergeImpact()` is three-way, and the finding it exists
for is `changed-under-caller` — a symbol whose CALLER changed on the other side, which git cannot see
because neither file conflicts. Identical edits on both branches are explicitly NOT a conflict; that
case was wrong in the first version and a test caught it.

**Boundaries:** advisory only. Nothing here deletes anything, and nothing here should ever be wired
to an automatic fix.

**Deferred / not built:** raising `STALE_IMPORT` recall past its deliberate floor. The finding fires
since 2026-07-25 (`findStaleImports` — for a year it was gated on raw tree-sitter node types that
labels never carry, then blocked on missing inheritance edges; todo11 closed both). It reports only
on affirmative absence across every evidence class and currently yields 1 finding vs tsc's 75 —
a strict subset with zero false positives. The recall gap is a query-coverage problem, not detector
logic, and un-excluding type targets before the type-position captures exist would re-create the
measured 36-false-positive flood (todo14).

## Prune must under-report, and here is the proof

An attempt to derive unused imports from per-file usage produced 232 findings against
`tsc --noUnusedLocals`'s 96. The cause was not the import logic: the graph has **zero
EXTENDS/IMPLEMENTS edges**, so `implements ConducksCommand` registers no usage and every CLI
command's interface import looked unused. It was reverted rather than shipped.

That is the standing rule. Dynamic dispatch, DI property chains and entry-wired symbols have no
incoming edge, so they read as orphans while being perfectly alive. A finding that is wrong 40% of
the time is worse than no finding, because it trains the reader to ignore the tool.

## Current precision, measured

25 ORPHAN + 5 UNUSED_EXPORT on conducks, audited symbol by symbol: **20 of 25 orphans are genuinely
unreferenced** (14 have zero textual occurrences anywhere; 6 more appear only in archived tests,
comments, or a barrel re-export nothing consumes). All 5 unused exports are correct — the fix there
is dropping the `export` keyword, not deleting the symbol.

The 5 remaining false positives are all dynamic dispatch: four registry getters reached via DI
property chains, and a browser entry point. That profile is expected and acceptable.

**The cheap way to audit a finding** — `grep -rn "\bSym\b" src tests scripts` excluding its defining
file. Zero occurrences means nothing *could* reference it, so it cannot be a broken-edge false
positive regardless of which edges are missing. Do this before believing any orphan claim, including
ones written in these docs: a prior note retracted `DynamicToolLoader` as live via a re-export that
no longer exists.

## Why dead-code got better for free

Adding TypeScript type-position captures flipped this module's `graphTracksTypes` self-calibration
on. It suppresses type-declaration reasoning entirely when the language emits no TYPE_REFERENCE
edges — correctly, since otherwise every type would look orphaned. Once TS emitted them, real dead
types surfaced: orphans went ~8 → 25, and the new ones are genuine.
